import {parseDecimal} from '@/domain/decimal';
import {assertPrecision} from '@/domain/precision';
import {currencyScale} from '@/modules/workspace/model';
import {expenseAction,expenseInput,expenseRow,type Expense} from '@/modules/finance/schemas';
import {uuid} from '@/modules/business/schemas';
import {z} from 'zod';
import {checkAdmin,IdentityError} from '@/server/auth/employee';
import {audit,nextNumber,runBusinessCommand,type BusinessTx} from '@/server/business/commands';
import {expectVersion,lookupOrder,readBusiness,requireState} from '@/server/business/order-data';
import type {BusinessActor} from '@/server/business/access';
export async function expenseById(tx:BusinessTx,actor:BusinessActor,id:string){
 const rows=await tx`select id,no,kind,applicant_id as "applicantId",order_id as "orderId",application_id as "applicationId",category,currency,amount_minor::text as "amountMinor",day::text,purpose,invoice_reference as "invoiceReference",state,version,review_reason as "reviewReason",payment_reference as "paymentReference",payment_day::text as "paymentDay" from trade_business.expense_claims where company_id=${actor.companyId} and id=${uuid.parse(id)}`;
 if(!rows[0])throw new Error('NOT_FOUND');const row=expenseRow.parse(rows[0]);if(actor.role!=='admin'&&row.applicantId!==actor.id)throw new IdentityError('FORBIDDEN');return row;
}
async function checkApplication(tx:BusinessTx,actor:BusinessActor,claim:Pick<Expense,'id'|'kind'|'applicationId'|'orderId'|'applicantId'|'currency'|'amountMinor'|'category'>){
 if(!claim.applicationId)return;if(claim.kind!=='reimbursement')throw new Error('INVALID_INPUT');
 const parent=await expenseById(tx,actor,claim.applicationId);if(parent.kind!=='request'||parent.state!=='approved'||parent.applicantId!==claim.applicantId||parent.orderId!==claim.orderId||parent.currency!==claim.currency||parent.category!==claim.category)throw new Error('EXPENSE_APPLICATION_MISMATCH');
 const used=await tx`select coalesce(sum(amount_minor),0)::text as total from trade_business.expense_claims where company_id=${actor.companyId} and application_id=${parent.id} and id<>${claim.id} and state in ('submitted','approved','paid')`;
 if(BigInt(String(used[0].total))+BigInt(claim.amountMinor)>BigInt(parent.amountMinor))throw new Error('EXPENSE_APPLICATION_EXCEEDED');
}
export async function createExpense(actor:BusinessActor,raw:unknown){const input=expenseInput.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'expense.create',payload:input},async tx=>{
 if(input.orderId){const order=await lookupOrder(tx,actor,input.orderId,actor.role==='operations'?'fulfill':'write');requireState(order.state,['draft','submitted','confirmed','fulfilling','completed']);}
 if(input.kind==='request'&&input.applicationId)throw new Error('INVALID_INPUT');
 const amountMinor=assertPrecision(parseDecimal(input.amount,currencyScale[input.currency]).toString(),'minor'),id=crypto.randomUUID(),no=await nextNumber(tx,actor.companyId,input.kind==='request'?'EA':'ER',input.date);
 await checkApplication(tx,actor,{...input,id,applicantId:actor.id,amountMinor});
 await tx`insert into trade_business.expense_claims(company_id,id,no,kind,applicant_id,order_id,application_id,category,currency,amount_minor,day,purpose,invoice_reference) values(${actor.companyId},${id},${no},${input.kind},${actor.id},${input.orderId},${input.applicationId},${input.category},${input.currency},${amountMinor},${input.date},${input.purpose},${input.invoiceReference})`;
 await audit(tx,actor,id,'expense.create',{kind:input.kind,orderId:input.orderId});return {id,version:1};
 });}
export async function transitionExpense(actor:BusinessActor,raw:unknown){const input=expenseAction.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'expense.'+input.action,payload:input},async tx=>{
 const claim=await expenseById(tx,actor,input.id);expectVersion(claim.version,input.expectedVersion);let state:Expense['state']=claim.state;
 if(['approve','reject','pay','void'].includes(input.action))checkAdmin(actor,actor.aal);
 if(['approve','reject'].includes(input.action)&&claim.applicantId===actor.id)throw new Error('EXPENSE_SELF_REVIEW');
 if(input.action==='submit'){
  if(claim.applicantId!==actor.id)throw new IdentityError('FORBIDDEN');requireState(claim.state,['draft']);
  if(claim.kind==='reimbursement'&&!claim.invoiceReference)throw new Error('EXPENSE_RECEIPT_REQUIRED');await checkApplication(tx,actor,claim);state='submitted';
  if(claim.kind==='reimbursement'){const duplicate=await tx`select 1 from trade_business.expense_claims where company_id=${actor.companyId} and id<>${claim.id} and kind='reimbursement' and invoice_reference=${claim.invoiceReference} and state in ('submitted','approved','paid') limit 1`;if(duplicate.length)throw new Error('DUPLICATE_REFERENCE');}
 }
 if(input.action==='approve'){requireState(claim.state,['submitted']);await checkApplication(tx,actor,claim);state='approved';}
 if(input.action==='reject'){requireState(claim.state,['submitted']);if(!input.reason)throw new Error('INVALID_INPUT');state='rejected';}
 if(input.action==='cancel'){if(claim.applicantId!==actor.id&&actor.role!=='admin')throw new IdentityError('FORBIDDEN');requireState(claim.state,['draft','submitted','rejected','approved']);if(claim.state==='approved'&&actor.role!=='admin')throw new IdentityError('FORBIDDEN');state='cancelled';}
 if(input.action==='pay'){requireState(claim.state,['approved']);if(claim.kind!=='reimbursement'||!input.paymentReference||!input.paymentDate)throw new Error('INVALID_INPUT');state='paid';}
 if(input.action==='void'){requireState(claim.state,['paid']);if(!input.reason)throw new Error('INVALID_INPUT');state='void';}
 if(['cancel','void'].includes(input.action)&&claim.kind==='request'){
  const dependents=await tx`select 1 from trade_business.expense_claims where company_id=${actor.companyId} and application_id=${claim.id} and state not in ('cancelled','rejected','void') limit 1`;if(dependents.length)throw new Error('DEPENDENCIES_EXIST');
 }
 await tx`update trade_business.expense_claims set state=${state},version=version+1,review_reason=${input.reason||claim.reviewReason},payment_reference=${input.action==='pay'?input.paymentReference:claim.paymentReference},payment_day=${input.action==='pay'?(input.paymentDate??null):claim.paymentDay} where company_id=${actor.companyId} and id=${claim.id}`;
 await audit(tx,actor,claim.id,'expense.'+input.action,{reason:input.reason||null,orderId:claim.orderId});return {id:claim.id,version:claim.version+1};
 });}
export async function listExpenses(actor:BusinessActor,params:URLSearchParams){const offset=z.coerce.number().int().min(0).max(100000).parse(params.get('offset')??0);return readBusiness(actor,async tx=>{
 const ids=await tx`select id from trade_business.expense_claims where company_id=${actor.companyId} and (${actor.role==='admin'} or applicant_id=${actor.id}) order by created_at desc,id limit 51 offset ${offset}`;
 const items=[];for(const row of ids.slice(0,50))items.push(await expenseById(tx,actor,String(row.id)));return {items,hasMore:ids.length>50};
 });}
