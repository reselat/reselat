import {z} from 'zod';
import {uuid,date,currency,positiveDecimal,version} from '@/modules/business/schemas';
import {currencyScale} from '@/modules/workspace/model';
import {parseDecimal} from '@/domain/decimal';
import {assertPrecision} from '@/domain/precision';
import {IdentityError} from '@/server/auth/employee';
import {audit,runBusinessCommand,type BusinessTx} from './commands';
import type {BusinessActor} from './access';
import {expectVersion,lookupOrder,requireState} from './order-data';
const payment=z.object({id:uuid,kind:z.enum(['sale','purchase']),orderId:uuid,purchaseId:uuid.nullable(),state:z.enum(['pending','active','void']),version:z.number().int(),currency,amountMinor:z.string(),day:z.string(),reference:z.string(),note:z.string(),voidReason:z.string().nullable()});
export async function paymentRows(tx:BusinessTx,actor:BusinessActor,orderId:string){const rows=await tx`select id,kind,order_id as "orderId",purchase_id as "purchaseId",state,version,currency,amount_minor::text as "amountMinor",day::text,reference,note,void_reason as "voidReason" from trade_business.payments where company_id=${actor.companyId} and order_id=${orderId} order by day,id`;return rows.map(row=>payment.parse(row));}
const submit=z.object({requestId:uuid,kind:z.enum(['sale','purchase']),refId:uuid,amount:positiveDecimal,currency,date,reference:z.string().trim().min(1).max(200),note:z.string().max(500)}).strict();
export async function submitPayment(actor:BusinessActor,raw:unknown){const input=submit.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'payment.submit',payload:input},async tx=>{
 if(actor.role==='operations'||(input.kind==='purchase'&&actor.role!=='admin'))throw new IdentityError('FORBIDDEN');let orderId=input.refId,purchaseId:string|null=null,expectedCurrency='';
 if(input.kind==='purchase'){const rows=await tx`select order_id,currency,state from trade_business.purchase_orders where company_id=${actor.companyId} and id=${input.refId}`;if(!rows[0])throw new Error('NOT_FOUND');requireState(String(rows[0].state),['confirmed']);orderId=String(rows[0].order_id);purchaseId=input.refId;expectedCurrency=String(rows[0].currency);}
 const order=await lookupOrder(tx,actor,orderId,'write');requireState(order.state,['confirmed','fulfilling']);if(input.currency!==(expectedCurrency||order.currency))throw new Error('CURRENCY_MISMATCH');const amount=parseDecimal(input.amount,currencyScale[input.currency]);assertPrecision(amount.toString(),'minor');
 const duplicate=await tx`select 1 from trade_business.payments where company_id=${actor.companyId} and order_id=${orderId} and kind=${input.kind} and (purchase_id is not distinct from ${purchaseId}::uuid) and reference=${input.reference} and state<>'void'`;if(duplicate.length)throw new Error('DUPLICATE_REFERENCE');
 const id=crypto.randomUUID();await tx`insert into trade_business.payments(company_id,id,kind,order_id,purchase_id,currency,amount_minor,day,reference,note,created_by) values(${actor.companyId},${id},${input.kind},${orderId},${purchaseId},${input.currency},${amount.toString()},${input.date},${input.reference},${input.note},${actor.id})`;
 await tx`insert into trade_business.payment_events(company_id,id,payment_id,actor_id,action) values(${actor.companyId},${crypto.randomUUID()},${id},${actor.id},'submit')`;await audit(tx,actor,id,'payment.submit');return {id,version:1};
 });}
const action=z.object({requestId:uuid,id:uuid,expectedVersion:version,action:z.enum(['confirm','void']),reason:z.string().trim().min(1).max(500).optional()}).strict();
export async function transitionPayment(actor:BusinessActor,raw:unknown){const input=action.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'payment.'+input.action,payload:input},async tx=>{
 const rows=await tx`select id,kind,order_id as "orderId",purchase_id as "purchaseId",state,version,currency,amount_minor::text as "amountMinor",day::text,reference,note,void_reason as "voidReason" from trade_business.payments where company_id=${actor.companyId} and id=${input.id}`;if(!rows[0])throw new Error('NOT_FOUND');const value=payment.parse(rows[0]);const order=await lookupOrder(tx,actor,value.orderId,'confirm');expectVersion(value.version,input.expectedVersion);
 if(input.action==='confirm'){
  requireState(value.state,['pending']);requireState(order.state,['confirmed','fulfilling']);let total=BigInt(order.totalMinor);
  if(value.kind==='purchase'){const purchase=await tx`select total_minor::text as total,state from trade_business.purchase_orders where company_id=${actor.companyId} and id=${value.purchaseId}`;if(!purchase[0])throw new Error('NOT_FOUND');requireState(String(purchase[0].state),['confirmed']);total=BigInt(String(purchase[0].total));}
  const paid=await tx`select coalesce(sum(amount_minor),0)::text as paid from trade_business.payments where company_id=${actor.companyId} and order_id=${order.id} and kind=${value.kind} and (purchase_id is not distinct from ${value.purchaseId}::uuid) and state='active'`;
  if(BigInt(String(paid[0].paid))+BigInt(value.amountMinor)>total)throw new Error('AMOUNT_EXCEEDED');
 }else{requireState(order.state,['confirmed','fulfilling']);requireState(value.state,['pending','active']);if(!input.reason)throw new Error('INVALID_INPUT');}
 await tx`update trade_business.payments set state=${input.action==='confirm'?'active':'void'},version=version+1,void_reason=${input.reason??null} where company_id=${actor.companyId} and id=${value.id}`;
 await tx`insert into trade_business.payment_events(company_id,id,payment_id,actor_id,action,reason) values(${actor.companyId},${crypto.randomUUID()},${value.id},${actor.id},${input.action},${input.reason??null})`;await audit(tx,actor,value.id,'payment.'+input.action,{reason:input.reason??null});return {id:value.id,version:value.version+1};
 });}
