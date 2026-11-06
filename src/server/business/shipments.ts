import {z} from 'zod';
import {uuid,version,date,positiveDecimal} from '@/modules/business/schemas';
import {currencyScale} from '@/modules/workspace/model';
import {parseDecimal} from '@/domain/decimal';
import {formatMinor,lineAmountMinor} from '@/domain/money';
import {audit,nextNumber,runBusinessCommand,type BusinessTx} from './commands';
import type {BusinessActor} from './access';
import {currentLines,expectVersion,lookupOrder,requireState} from './order-data';
const packing=z.object({orderLineId:uuid,quantity:positiveDecimal,packages:z.number().int().positive().max(1000000),netKg:positiveDecimal,grossKg:positiveDecimal,cbm:positiveDecimal,marks:z.string().max(500),dimensions:z.string().max(500),sources:z.array(z.object({receiptLineId:uuid,quantity:positiveDecimal}).strict()).min(1).max(100)}).strict().refine(v=>parseDecimal(v.grossKg,4)>=parseDecimal(v.netKg,4)).refine(v=>new Set(v.sources.map(s=>s.receiptLineId)).size===v.sources.length).refine(v=>v.sources.reduce((n,s)=>n+parseDecimal(s.quantity,4),0n)===parseDecimal(v.quantity,4));
const create=z.object({requestId:uuid,orderId:uuid,date,portLoad:z.string().trim().min(1).max(100),portDischarge:z.string().trim().min(1).max(100),transport:z.string().max(40),lines:z.array(packing).min(1).max(50)}).strict().refine(v=>new Set(v.lines.map(l=>l.orderLineId)).size===v.lines.length);
const shipment=z.object({id:uuid,orderId:uuid,no:z.string(),state:z.string(),version:z.number().int(),day:z.string(),totalMinor:z.string(),payload:z.record(z.string(),z.unknown()),confirmedAt:z.string().nullable()});
const shipmentLine=z.object({id:uuid,orderLineId:uuid,quantity:z.string(),amountMinor:z.string(),payload:z.record(z.string(),z.unknown())});
export async function shipmentRows(tx:BusinessTx,actor:BusinessActor,orderId:string){
 const rows=await tx`select id,order_id as "orderId",no,state,version,day::text,total_minor::text as "totalMinor",payload,confirmed_at::text as "confirmedAt" from trade_business.shipments where company_id=${actor.companyId} and order_id=${orderId} order by no`;const result=[];
 for(const raw of rows){const value=shipment.parse(raw),lines=await tx`select id,order_line_id as "orderLineId",quantity::text,amount_minor::text as "amountMinor",payload from trade_business.shipment_lines where company_id=${actor.companyId} and shipment_id=${value.id} order by id`;result.push({...value,lines:lines.map(l=>shipmentLine.parse(l))});}return result;
}
async function availability(tx:BusinessTx,actor:BusinessActor,orderId:string,items:z.infer<typeof packing>[]){
 const order=await lookupOrder(tx,actor,orderId,'fulfill');requireState(order.state,['confirmed','fulfilling']);const lines=await currentLines(tx,actor,order);
 for(const item of items){const line=lines.find(l=>l.id===item.orderLineId);if(!line)throw new Error('NOT_FOUND');
  const used=await tx`select coalesce(sum(l.quantity),0)::text as quantity from trade_business.shipment_lines l join trade_business.shipments s on s.company_id=l.company_id and s.id=l.shipment_id where l.company_id=${actor.companyId} and l.order_line_id=${line.id} and s.state='confirmed'`;
  if(parseDecimal(String(used[0].quantity),4)+parseDecimal(item.quantity,4)>parseDecimal(line.quantity,4))throw new Error('QUANTITY_EXCEEDED');
  for(const source of item.sources){const rows=await tx`select quantity::text from trade_business.receipt_lines where company_id=${actor.companyId} and order_id=${orderId} and order_line_id=${line.id} and id=${source.receiptLineId}`;if(!rows[0])throw new Error('NOT_FOUND');
   const allocated=await tx`select coalesce(sum(a.quantity),0)::text as quantity from trade_business.shipment_sources a join trade_business.shipments s on s.company_id=a.company_id and s.id=a.shipment_id where a.company_id=${actor.companyId} and a.receipt_line_id=${source.receiptLineId} and s.state='confirmed'`;
   if(parseDecimal(String(allocated[0].quantity),4)+parseDecimal(source.quantity,4)>parseDecimal(String(rows[0].quantity),4))throw new Error('QUANTITY_EXCEEDED');
  }
 }return order;
}
export async function createShipment(actor:BusinessActor,raw:unknown){const input=create.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'shipment.create',payload:input},async tx=>{
 await availability(tx,actor,input.orderId,input.lines);const id=crypto.randomUUID(),no=await nextNumber(tx,actor.companyId,'SH',input.date);
 await tx`insert into trade_business.shipments(company_id,id,order_id,no,day,payload,created_by) values(${actor.companyId},${id},${input.orderId},${no},${input.date},${tx.json({portLoad:input.portLoad,portDischarge:input.portDischarge,transport:input.transport})},${actor.id})`;
 for(const item of input.lines){const lineId=crypto.randomUUID();const {sources,...payload}=item;
  await tx`insert into trade_business.shipment_lines(company_id,id,shipment_id,order_id,order_line_id,quantity,payload) values(${actor.companyId},${lineId},${id},${input.orderId},${item.orderLineId},${item.quantity},${tx.json(payload)})`;
  for(const source of sources)await tx`insert into trade_business.shipment_sources(company_id,shipment_id,shipment_line_id,order_id,order_line_id,receipt_line_id,quantity) values(${actor.companyId},${id},${lineId},${input.orderId},${item.orderLineId},${source.receiptLineId},${source.quantity})`;
 }
 await audit(tx,actor,id,'shipment.create');return {id,version:1};
 });}
const action=z.object({requestId:uuid,id:uuid,expectedVersion:version,action:z.enum(['submit','confirm','cancel']),reason:z.string().trim().min(1).max(500).optional()}).strict();
export async function transitionShipment(actor:BusinessActor,raw:unknown){const input=action.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'shipment.'+input.action,payload:input},async tx=>{
 const rows=await tx`select id,order_id as "orderId",no,state,version,day::text,total_minor::text as "totalMinor",payload,confirmed_at::text as "confirmedAt" from trade_business.shipments where company_id=${actor.companyId} and id=${input.id}`;if(!rows[0])throw new Error('NOT_FOUND');const value=shipment.parse(rows[0]);expectVersion(value.version,input.expectedVersion);
 const order=await lookupOrder(tx,actor,value.orderId,input.action==='confirm'||(input.action==='cancel'&&value.state==='confirmed')?'confirm':'fulfill');requireState(order.state,['confirmed','fulfilling']);
 if(input.action==='submit'){requireState(value.state,['draft']);await tx`update trade_business.shipments set state='submitted',version=version+1 where company_id=${actor.companyId} and id=${value.id}`;}
 if(input.action==='confirm'){
  requireState(value.state,['draft','submitted']);const stored=await tx`select id,order_line_id as "orderLineId",quantity::text,payload from trade_business.shipment_lines where company_id=${actor.companyId} and shipment_id=${value.id} order by id`;
  const prepared=[];for(const rawLine of stored){const row=z.object({id:uuid,orderLineId:uuid,quantity:z.string(),payload:z.record(z.string(),z.unknown())}).parse(rawLine);const sources=await tx`select receipt_line_id as "receiptLineId",quantity::text from trade_business.shipment_sources where company_id=${actor.companyId} and shipment_line_id=${row.id}`;prepared.push({id:row.id,...packing.parse({...row.payload,orderLineId:row.orderLineId,quantity:row.quantity,sources})});}
  await availability(tx,actor,order.id,prepared);const lines=await currentLines(tx,actor,order);let total=0n;
  for(const item of prepared){const line=lines.find(l=>l.id===item.orderLineId);if(!line)throw new Error('NOT_FOUND');const allocated=await tx`select coalesce(sum(l.quantity),0)::text as quantity,coalesce(sum(l.amount_minor),0)::text as amount from trade_business.shipment_lines l join trade_business.shipments s on s.company_id=l.company_id and s.id=l.shipment_id where l.company_id=${actor.companyId} and l.order_line_id=${line.id} and s.state='confirmed'`;
   const cumulative=formatMinor(parseDecimal(String(allocated[0].quantity),4)+parseDecimal(item.quantity,4),4);const amount=lineAmountMinor(cumulative,line.unitPrice,currencyScale[order.currency])-BigInt(String(allocated[0].amount));total+=amount;
   await tx`update trade_business.shipment_lines set amount_minor=${amount.toString()} where company_id=${actor.companyId} and id=${item.id}`;
  }
  await tx`update trade_business.shipments set state='confirmed',version=version+1,total_minor=${total.toString()},confirmed_at=clock_timestamp() where company_id=${actor.companyId} and id=${value.id}`;
  await tx`update trade_business.orders set state='fulfilling',version=version+1 where company_id=${actor.companyId} and id=${order.id}`;
 }
 if(input.action==='cancel'){
  requireState(value.state,['draft','submitted','confirmed']);if(!input.reason)throw new Error('INVALID_INPUT');
  if(value.state==='confirmed'){
   const newer=await tx`select 1 from trade_business.shipments where company_id=${actor.companyId} and order_id=${order.id} and state='confirmed' and confirmed_at>${value.confirmedAt}::timestamptz limit 1`;if(newer.length)throw new Error('DEPENDENCIES_EXIST');
   const locks=await tx`select 1 from trade_business.shipment_document_locks where company_id=${actor.companyId} and shipment_id=${value.id} and active limit 1`;if(locks.length)throw new Error('DEPENDENCIES_EXIST');
  }
  await tx`update trade_business.shipments set state='cancelled',version=version+1 where company_id=${actor.companyId} and id=${value.id}`;
 }
 await audit(tx,actor,value.id,'shipment.'+input.action,{reason:input.reason??null});return {id:value.id,version:value.version+1};
 });}
