import {z} from 'zod';
import {collectSupplierOrigins} from '@/server/files/origins';
import {uuid,version,date,currency,positiveDecimal,decimal} from '@/modules/business/schemas';
import {partySchema,currencyScale} from '@/modules/workspace/model';
import {lineAmountMinor} from '@/domain/money';
import {parseDecimal} from '@/domain/decimal';
import {assertPrecision} from '@/domain/precision';
import {IdentityError} from '@/server/auth/employee';
import {audit,nextNumber,runBusinessCommand,type BusinessTx} from './commands';
import type {BusinessActor} from './access';
import {currentLines,lookupOrder,expectVersion,requireState,orderSnapshot} from './order-data';
import {lookupRecord} from './records';
const create=z.object({requestId:uuid,orderId:uuid,orderVersion:version,groups:z.array(z.object({supplierId:uuid,currency,date,dueDate:date,paymentTerms:z.string().trim().min(1).max(300),lines:z.array(z.object({orderLineId:uuid,quantity:positiveDecimal,unitCost:decimal}).strict()).min(1).max(50)}).strict().refine(v=>v.dueDate>=v.date)).min(1).max(20)}).strict();
const purchase=z.object({id:uuid,orderId:uuid,no:z.string(),state:z.string(),version:z.number().int(),currency,day:z.string(),dueDay:z.string(),totalMinor:z.string(),payload:z.record(z.string(),z.unknown())});
const line=z.object({id:uuid,purchaseId:uuid,orderLineId:uuid,quantity:z.string(),unitCost:z.string(),amountMinor:z.string(),snapshot:z.record(z.string(),z.unknown())});
export async function purchaseRows(tx:BusinessTx,actor:BusinessActor,orderId:string){
 const rows=await tx`select id,order_id as "orderId",no,state,version,currency,day::text,due_day::text as "dueDay",total_minor::text as "totalMinor",payload from trade_business.purchase_orders where company_id=${actor.companyId} and order_id=${orderId} order by no`;
 const result=[];for(const raw of rows){const record=purchase.parse(raw);const lines=await tx`select id,purchase_id as "purchaseId",order_line_id as "orderLineId",quantity::text,unit_cost::text as "unitCost",amount_minor::text as "amountMinor",snapshot from trade_business.purchase_lines where company_id=${actor.companyId} and purchase_id=${record.id} order by id`;result.push({...record,lines:lines.map(l=>line.parse(l))});}return result;
}
export async function receiptRows(tx:BusinessTx,actor:BusinessActor,orderId:string){const rows=await tx`select l.id,l.purchase_line_id as "purchaseLineId",l.order_line_id as "orderLineId",l.quantity::text,(l.quantity-coalesce((select sum(a.quantity) from trade_business.shipment_sources a join trade_business.shipment_lines sl on sl.company_id=a.company_id and sl.id=a.shipment_line_id join trade_business.shipments s on s.company_id=sl.company_id and s.id=sl.shipment_id where a.company_id=l.company_id and a.receipt_line_id=l.id and s.state='confirmed'),0))::text as available,r.day::text as date from trade_business.receipt_lines l join trade_business.receipts r on r.company_id=l.company_id and r.id=l.receipt_id where l.company_id=${actor.companyId} and l.order_id=${orderId} order by r.day,l.id`;return z.array(z.object({id:uuid,purchaseLineId:uuid,orderLineId:uuid,quantity:z.string(),available:z.string(),date:z.string()})).parse(rows);}
export async function createPurchases(actor:BusinessActor,raw:unknown){const input=create.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'purchase.create',payload:input},async tx=>{
 const order=await lookupOrder(tx,actor,input.orderId,'fulfill');requireState(order.state,['confirmed','fulfilling']);expectVersion(order.sourceVersion,input.orderVersion);const lines=await currentLines(tx,actor,order),frozen=await orderSnapshot(tx,actor,order);const ids:string[]=[];
 for(const group of input.groups){if(actor.role==='operations'){const allowed=await tx`select 1 from trade_business.order_supplier_access where company_id=${actor.companyId} and order_id=${order.id} and supplier_id=${group.supplierId}`;if(!allowed.length)throw new IdentityError('FORBIDDEN');}const supplier=partySchema.parse((await lookupRecord(tx,actor.companyId,group.supplierId,'supplier')).payload),id=crypto.randomUUID(),no=await nextNumber(tx,actor.companyId,'PO',group.date);let total=0n;
  const prepared=[];
  for(const item of group.lines){const source=lines.find(l=>l.id===item.orderLineId);if(!source)throw new Error('NOT_FOUND');
   const used=await tx`select coalesce(sum(l.quantity),0)::text as quantity from trade_business.purchase_lines l join trade_business.purchase_orders p on p.company_id=l.company_id and p.id=l.purchase_id where l.company_id=${actor.companyId} and l.order_line_id=${source.id} and p.state<>'cancelled'`;
   const local=prepared.filter(l=>l.orderLineId===item.orderLineId).reduce((n,l)=>n+parseDecimal(l.quantity,4),0n);
   if(parseDecimal(String(used[0].quantity),4)+local+parseDecimal(item.quantity,4)>parseDecimal(source.quantity,4))throw new Error('QUANTITY_EXCEEDED');
   const amount=lineAmountMinor(item.quantity,item.unitCost,currencyScale[group.currency]);assertPrecision(amount.toString(),'minor');total+=amount;prepared.push({...item,id:crypto.randomUUID(),amountMinor:amount.toString(),snapshot:source.snapshot});
  }
  const originCertificates=await collectSupplierOrigins(tx,actor,supplier);
  assertPrecision(total.toString(),'minor');await tx`insert into trade_business.purchase_orders(company_id,id,order_id,order_version,no,supplier_id,currency,day,due_day,payload,total_minor,created_by) values(${actor.companyId},${id},${order.id},${order.sourceVersion},${no},${group.supplierId},${group.currency},${group.date},${group.dueDate},${tx.json({supplier,seller:frozen.seller,paymentTerms:group.paymentTerms,supplierReference:supplier.referenceCode??'',originCertificates})},${total.toString()},${actor.id})`;
  for(const item of prepared)await tx`insert into trade_business.purchase_lines(company_id,id,purchase_id,order_id,order_line_id,quantity,unit_cost,amount_minor,snapshot) values(${actor.companyId},${item.id},${id},${order.id},${item.orderLineId},${item.quantity},${item.unitCost},${item.amountMinor},${tx.json(item.snapshot)})`;
  await audit(tx,actor,id,'purchase.create');ids.push(id);
 }
 return {ids};
 });}
const action=z.object({requestId:uuid,id:uuid,expectedVersion:version,action:z.enum(['submit','confirm','cancel']),reason:z.string().trim().min(1).max(500).optional()}).strict();
async function lookupPurchase(tx:BusinessTx,actor:BusinessActor,id:string,confirm=false){const rows=await tx`select id,order_id as "orderId",no,state,version,currency,day::text,due_day::text as "dueDay",total_minor::text as "totalMinor",payload from trade_business.purchase_orders where company_id=${actor.companyId} and id=${id}`;if(!rows[0])throw new Error('NOT_FOUND');const value=purchase.parse(rows[0]);await lookupOrder(tx,actor,value.orderId,confirm?'confirm':'fulfill');return value;}
export async function transitionPurchase(actor:BusinessActor,raw:unknown){const input=action.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'purchase.'+input.action,payload:input},async tx=>{
 const purchase=await lookupPurchase(tx,actor,input.id,input.action==='confirm');expectVersion(purchase.version,input.expectedVersion);let state='';
 if(input.action==='submit'){requireState(purchase.state,['draft']);state='submitted';}
 if(input.action==='confirm'){requireState(purchase.state,['submitted']);state='confirmed';}
 if(input.action==='cancel'){
  requireState(purchase.state,['draft','submitted','confirmed']);if(!input.reason)throw new Error('INVALID_INPUT');if(purchase.state==='confirmed'&&actor.role!=='admin')throw new IdentityError('FORBIDDEN');
  const rows=await tx`select 1 from trade_business.receipts where company_id=${actor.companyId} and purchase_id=${purchase.id} union all select 1 from trade_business.payments where company_id=${actor.companyId} and purchase_id=${purchase.id} and state<>'void' limit 1`;const locks=await tx`select 1 from trade_business.purchase_document_locks where company_id=${actor.companyId} and purchase_id=${purchase.id} and active limit 1`;if(rows.length||locks.length)throw new Error('DEPENDENCIES_EXIST');state='cancelled';
 }
 await tx`update trade_business.purchase_orders set state=${state},version=version+1 where company_id=${actor.companyId} and id=${purchase.id}`;await audit(tx,actor,purchase.id,'purchase.'+input.action,{reason:input.reason??null});return {id:purchase.id,version:purchase.version+1};
 });}
const receive=z.object({requestId:uuid,purchaseId:uuid,date,lines:z.array(z.object({purchaseLineId:uuid,quantity:positiveDecimal}).strict()).min(1).max(50)}).strict();
export async function recordReceipt(actor:BusinessActor,raw:unknown){const input=receive.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'purchase.receipt',payload:input},async tx=>{
 const purchase=await lookupPurchase(tx,actor,input.purchaseId);requireState(purchase.state,['confirmed']);const id=crypto.randomUUID(),lineIds:string[]=[];
 await tx`insert into trade_business.receipts(company_id,id,purchase_id,day,created_by) values(${actor.companyId},${id},${purchase.id},${input.date},${actor.id})`;
 for(const item of input.lines){const rows=await tx`select order_line_id,quantity::text from trade_business.purchase_lines where company_id=${actor.companyId} and purchase_id=${purchase.id} and id=${item.purchaseLineId}`;if(!rows[0])throw new Error('NOT_FOUND');const used=await tx`select coalesce(sum(quantity),0)::text as quantity from trade_business.receipt_lines where company_id=${actor.companyId} and purchase_line_id=${item.purchaseLineId}`;
  if(parseDecimal(String(used[0].quantity),4)+parseDecimal(item.quantity,4)>parseDecimal(String(rows[0].quantity),4))throw new Error('QUANTITY_EXCEEDED');const lineId=crypto.randomUUID();
  await tx`insert into trade_business.receipt_lines(company_id,id,receipt_id,purchase_id,purchase_line_id,order_id,order_line_id,quantity) values(${actor.companyId},${lineId},${id},${purchase.id},${item.purchaseLineId},${purchase.orderId},${String(rows[0].order_line_id)},${item.quantity})`;lineIds.push(lineId);
 }
 await audit(tx,actor,id,'purchase.receipt');return {id,lineIds};
 });}
