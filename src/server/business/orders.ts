import {z} from 'zod';
import {collectOrigins} from '@/server/files/origins';
import {orderDraftSchema,actionSchema,headerSchema,type FrozenOrder} from '@/modules/business/order-schema';
import {companySchema,partySchema,productSchema,currencyScale} from '@/modules/workspace/model';
import {lineAmountMinor} from '@/domain/money';
import {assertPrecision} from '@/domain/precision';
import {parseDecimal} from '@/domain/decimal';
import {assertOperationsMember} from '@/server/auth/member-directory';
import {IdentityError} from '@/server/auth/employee';
import {audit,nextNumber,runBusinessCommand,type BusinessTx} from './commands';
import {lookupRecord,recordScope} from './records';
import {assertScope,type BusinessActor} from './access';
import {currentLines,expectVersion,lookupOrder,orderRow,orderSnapshot,readBusiness,requireState} from './order-data';
import {effectiveCustoms} from './customs';
import {purchaseRows,receiptRows} from './purchases';
import {shipmentRows} from './shipments';
import {paymentRows} from './payments';
async function snapshot(tx:BusinessTx,actor:BusinessActor,id:string,no:string,input:z.infer<typeof orderDraftSchema>):Promise<FrozenOrder>{
 const profile=await tx`select legal_profile from trade_business.company_profiles where id=${actor.companyId}`;
 const seller=companySchema.safeParse(profile[0]?.legal_profile);if(!seller.success)throw new Error('COMPANY_NOT_FOUND');
 const customer=partySchema.parse((await lookupRecord(tx,actor.companyId,input.customerId,'customer')).payload);
 const lines:FrozenOrder['lines']=[];let total=0n;
 for(const item of input.lines){const product=productSchema.parse((await lookupRecord(tx,actor.companyId,item.productId,'product')).payload);const amount=lineAmountMinor(item.quantity,item.unitPrice,currencyScale[input.currency]);assertPrecision(amount.toString(),'minor');total+=amount;
  const originCertificates=await collectOrigins(tx,actor,product);
  lines.push({...product,originCertificates,id:crypto.randomUUID(),productId:item.productId,description:product.nameEn+' / '+product.nameZh,quantity:item.quantity,unitPrice:item.unitPrice,amountMinor:amount.toString(),roundingAdjustmentMinor:'0',packages:0,netKg:'0',grossKg:'0',cbm:'0',marks:'',dimensions:''});
 }
 assertPrecision(total.toString(),'minor');
 // Customer-side snapshots never carry default procurement data.
 const safeLines=lines.map(l=>{const {supplierId:unusedSupplier,costPrice:unusedCost,purchaseCurrency:unusedCurrency,...safe}=z.object({supplierId:z.unknown().optional(),costPrice:z.unknown().optional(),purchaseCurrency:z.unknown().optional()}).passthrough().parse(l);void unusedSupplier;void unusedCost;void unusedCurrency;return safe;});
 const {frozenOrderSchema}=await import('@/modules/business/order-schema');
 return frozenOrderSchema.parse({id,no,header:headerSchema.parse({...input,buyerReference:customer.referenceCode??input.buyerReference}),seller:seller.data,customer,lines:safeLines,totalMinor:total.toString()});
}
async function insertVersion(tx:BusinessTx,actor:BusinessActor,value:FrozenOrder,version:number){
 await tx`insert into trade_business.order_versions(company_id,order_id,version,snapshot,created_by) values(${actor.companyId},${value.id},${version},${tx.json(value)},${actor.id})`;
 for(const line of value.lines)await tx`insert into trade_business.order_lines(company_id,id,order_id,order_version,product_id,quantity,unit_price,amount_minor,snapshot) values(${actor.companyId},${line.id},${value.id},${version},${line.productId},${line.quantity},${line.unitPrice},${line.amountMinor},${tx.json(line)})`;
}
export async function createOrder(actor:BusinessActor,raw:unknown){const input=orderDraftSchema.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'order.save',payload:input},async tx=>{
 if(actor.role==='operations')throw new IdentityError('FORBIDDEN');assertScope(actor,await recordScope(tx,actor,input.customerId),'write');
 const previous=input.id?await lookupOrder(tx,actor,input.id,'write'):undefined;
 if(previous){expectVersion(previous.version,input.expectedVersion??0);requireState(previous.state,['draft']);}
 const id=previous?.id??crypto.randomUUID(),no=previous?.no??await nextNumber(tx,actor.companyId,'SO',input.date),version=previous?(previous.sourceVersion+1):1;
 const value=await snapshot(tx,actor,id,no,input);
 if(previous)await tx`update trade_business.orders set source_version=${version},version=version+1,currency=${input.currency},day=${input.date},due_day=${input.dueDate},payload=${tx.json(value.header)},total_minor=${value.totalMinor} where company_id=${actor.companyId} and id=${id}`;
 else await tx`insert into trade_business.orders(company_id,id,no,customer_id,owner_id,created_by,currency,day,due_day,payload,total_minor) values(${actor.companyId},${id},${no},${input.customerId},${actor.id},${actor.id},${input.currency},${input.date},${input.dueDate},${tx.json(value.header)},${value.totalMinor})`;
 if(previous&&previous.customerId!==input.customerId)throw new Error('DEPENDENCIES_EXIST');
 await insertVersion(tx,actor,value,version);await audit(tx,actor,id,'order.save');return {id,version:(previous?.version??0)+1};
 });}
export async function transitionOrder(actor:BusinessActor,raw:unknown){const input=actionSchema.parse(raw);if(input.action==='assign'&&input.operationsId)await assertOperationsMember(actor.companyId,input.operationsId);
 return runBusinessCommand(actor,{requestId:input.requestId,kind:'order.'+input.action,payload:input},async tx=>{
 const confirm=['confirm','assign','complete','revise','reopen'].includes(input.action);const order=await lookupOrder(tx,actor,input.id,confirm?'confirm':'write');expectVersion(order.version,input.expectedVersion);let state=order.state;
 if(input.action==='assign'){if(!input.operationsId)throw new Error('INVALID_INPUT');requireState(state,['confirmed','fulfilling']);await tx`update trade_business.orders set operations_id=${input.operationsId},version=version+1 where company_id=${actor.companyId} and id=${order.id}`;}
 else{
  if(input.action==='submit'){requireState(state,['draft']);state='submitted';}
  if(input.action==='withdraw'){requireState(state,['submitted']);state='draft';}
  if(input.action==='confirm'){
   requireState(state,['submitted']);const old=await orderSnapshot(tx,actor,order);const value=await snapshot(tx,actor,order.id,order.no,orderDraftSchema.parse({...old.header,lines:old.lines.map(l=>({productId:l.productId,quantity:l.quantity,unitPrice:l.unitPrice})),requestId:input.requestId}));
   await insertVersion(tx,actor,value,order.sourceVersion+1);await tx`update trade_business.orders set source_version=source_version+1,total_minor=${value.totalMinor} where company_id=${actor.companyId} and id=${order.id}`;state='confirmed';
  }
  if(input.action==='cancel'||input.action==='revise'){
   if(!input.reason)throw new Error('INVALID_INPUT');requireState(state,['draft','submitted','confirmed']);
   if(state==='confirmed'&&actor.role!=='admin')throw new IdentityError('FORBIDDEN');
   const dependencies=await tx`select 1 from trade_business.purchase_orders where company_id=${actor.companyId} and order_id=${order.id} and state<>'cancelled' union all select 1 from trade_business.shipments where company_id=${actor.companyId} and order_id=${order.id} and state<>'cancelled' union all select 1 from trade_business.payments where company_id=${actor.companyId} and order_id=${order.id} and state<>'void' limit 1`;
   const locks=await tx`select 1 from trade_business.order_document_locks where company_id=${actor.companyId} and order_id=${order.id} and active limit 1`;if(dependencies.length||locks.length)throw new Error('DEPENDENCIES_EXIST');state=input.action==='cancel'?'cancelled':'draft';
  }
  if(input.action==='reopen'){requireState(state,['completed']);if(!input.reason)throw new Error('INVALID_INPUT');state='fulfilling';}
  if(input.action==='complete'){
   requireState(state,['confirmed','fulfilling']);const lines=await currentLines(tx,actor,order);
   for(const line of lines){const rows=await tx`select coalesce(sum(l.quantity),0)::text as quantity from trade_business.shipment_lines l join trade_business.shipments s on s.company_id=l.company_id and s.id=l.shipment_id where l.company_id=${actor.companyId} and l.order_line_id=${line.id} and s.state='confirmed'`;if(parseDecimal(String(rows[0].quantity),4)!==parseDecimal(line.quantity,4))throw new Error('DEPENDENCIES_EXIST');}
   const paid=await tx`select coalesce(sum(amount_minor),0)::text as paid from trade_business.payments where company_id=${actor.companyId} and order_id=${order.id} and kind='sale' and state='active'`;if(BigInt(String(paid[0].paid))!==BigInt(order.totalMinor))throw new Error('DEPENDENCIES_EXIST');const unsettled=await tx`select 1 from trade_business.purchase_orders p where p.company_id=${actor.companyId} and p.order_id=${order.id} and p.state<>'cancelled' and (p.state<>'confirmed' or p.total_minor<>coalesce((select sum(a.amount_minor) from trade_business.payments a where a.company_id=p.company_id and a.purchase_id=p.id and a.state='active'),0)) union all select 1 from trade_business.payments where company_id=${actor.companyId} and order_id=${order.id} and state='pending' limit 1`;if(unsettled.length)throw new Error('DEPENDENCIES_EXIST');state='completed';
  }
  await tx`update trade_business.orders set state=${state},version=version+1 where company_id=${actor.companyId} and id=${order.id}`;
 }
 await audit(tx,actor,order.id,'order.'+input.action,{reason:input.reason??null});return {id:order.id,version:order.version+1};
 });}
export async function listOrders(actor:BusinessActor,params:URLSearchParams){const offset=z.coerce.number().int().min(0).max(100000).parse(params.get('offset')??0),search=(params.get('search')??'').slice(0,100);return readBusiness(actor,async tx=>{
 const rows=await tx`select id,company_id as "companyId",no,customer_id as "customerId",owner_id as "ownerId",operations_id as "operationsId",state,version,source_version as "sourceVersion",currency,day::text,due_day::text as "dueDay",total_minor::text as "totalMinor",payload from trade_business.orders o where company_id=${actor.companyId} and (${search}='' or position(lower(${search}) in lower(no))>0) and (${actor.role==='admin'} or (${actor.role==='sales'} and owner_id=${actor.id}) or (${actor.role==='operations'} and operations_id=${actor.id}) or exists(select 1 from trade_business.order_shares s where s.company_id=o.company_id and s.order_id=o.id and s.user_id=${actor.id})) order by created_at desc,id limit 51 offset ${offset}`;
 return {items:rows.slice(0,50).map(row=>orderRow.parse(row)),hasMore:rows.length>50};
 });}
export async function getOrderDetail(actor:BusinessActor,id:string){return readBusiness(actor,async tx=>{
 const order=await lookupOrder(tx,actor,id),snapshot=await orderSnapshot(tx,actor,order),lines=await currentLines(tx,actor,order);
 const procurementAllowed=actor.role==='admin'||(actor.role==='operations'&&order.operationsId===actor.id);const rawPurchases=procurementAllowed?await purchaseRows(tx,actor,order.id):[],receipts=procurementAllowed?await receiptRows(tx,actor,order.id):[];const purchases=rawPurchases.map(p=>{if(actor.role==='admin')return p;const source=companySchema.parse(p.payload.seller);return {...p,payload:{...p.payload,seller:{...source,bankName:'',bankAccount:'',swift:''}}};});
 const shipments=await shipmentRows(tx,actor,order.id),payments=(await paymentRows(tx,actor,order.id)).filter(p=>actor.role==='admin'||(actor.role==='sales'&&p.kind==='sale')||(actor.role==='operations'&&order.operationsId===actor.id&&p.kind==='purchase'));
 const seller=actor.role==='admin'?snapshot.seller:{...snapshot.seller,bankName:'',bankAccount:'',swift:''};
 const revisedLines=[];for(const line of lines)revisedLines.push({...line,snapshot:{...line.snapshot,...await effectiveCustoms(tx,actor,line.id,line.snapshot)}});return {order,lines:revisedLines,snapshot:{...snapshot,seller},purchases,receipts,shipments,payments};
 });}
