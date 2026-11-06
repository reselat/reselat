import {z} from 'zod';
import {uuid,date,version} from '@/modules/business/schemas';
import {assertActiveCompanyMember,assertSalesOwner} from '@/server/auth/member-directory';
import {checkAdmin} from '@/server/auth/employee';
import {assertScope,type BusinessActor} from './access';
import {runBusinessCommand,audit,type BusinessTx} from './commands';
import {recordScope} from './records';
import {expectVersion,readBusiness} from './order-data';
import {commandFingerprint} from './command-values';
const followup=z.object({requestId:uuid,customerId:uuid,date,note:z.string().trim().min(1).max(2000),nextDate:date,expectedVersion:version}).strict().refine(v=>v.nextDate>=v.date);
export async function addFollowup(actor:BusinessActor,raw:unknown){const input=followup.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'customer.followup',payload:input},async tx=>{return addFollowupInTransaction(tx,actor,input);
 });}
export async function addFollowupInTransaction(tx:BusinessTx,actor:BusinessActor,input:z.infer<typeof followup>){
 const customer=await recordScope(tx,actor,input.customerId);assertScope(actor,customer,'write');expectVersion(customer.version,input.expectedVersion);const id=crypto.randomUUID();
 await tx`insert into trade_business.followups(id,company_id,customer_id,actor_id,day,note,next_day) values(${id},${actor.companyId},${input.customerId},${actor.id},${input.date},${input.note},${input.nextDate})`;
 await tx`update trade_business.business_records set version=version+1 where company_id=${actor.companyId} and kind='customer' and id=${input.customerId}`;
 await audit(tx,actor,input.customerId,'customer.followup');return {id,version:customer.version+1};
}
export async function listFollowups(actor:BusinessActor,customerId:string){return readBusiness(actor,async tx=>{
 const customer=await recordScope(tx,actor,uuid.parse(customerId));assertScope(actor,customer,'read');
 const rows=await tx`select id,actor_id as "actorId",day::text as date,note,next_day::text as "nextDate" from trade_business.followups where company_id=${actor.companyId} and customer_id=${customerId} order by created_at desc,id limit 100`;
 return {customer,items:z.array(z.object({id:uuid,actorId:uuid,date:z.string(),note:z.string(),nextDate:z.string().nullable()})).parse(rows)};
 });}
const share=z.object({requestId:uuid,customerId:uuid,userId:uuid,enabled:z.boolean(),expectedVersion:version}).strict();
export async function setCustomerAccess(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=share.parse(raw);await assertActiveCompanyMember(actor.companyId,input.userId);return runBusinessCommand(actor,{requestId:input.requestId,kind:'customer.share',payload:input},async tx=>{
 const customer=await recordScope(tx,actor,input.customerId);expectVersion(customer.version,input.expectedVersion);
 if(input.enabled)await tx`insert into trade_business.record_shares(company_id,kind,record_id,user_id) values(${actor.companyId},'customer',${input.customerId},${input.userId}) on conflict do nothing`;
 else await tx`delete from trade_business.record_shares where company_id=${actor.companyId} and kind='customer' and record_id=${input.customerId} and user_id=${input.userId}`;
 await tx`update trade_business.business_records set version=version+1 where company_id=${actor.companyId} and kind='customer' and id=${input.customerId}`;
 await audit(tx,actor,input.customerId,input.enabled?'customer.share':'customer.unshare',{userId:input.userId});return {id:input.customerId,version:customer.version+1};
 });}
async function preview(tx:BusinessTx,actor:BusinessActor,customerId:string,targetUserId:string){
 const customer=await recordScope(tx,actor,customerId);
 const orders=await tx`select id,no,version,state from trade_business.orders where company_id=${actor.companyId} and customer_id=${customerId} order by id`;
 const items=z.array(z.object({id:uuid,no:z.string(),version:z.number().int(),state:z.string()})).parse(orders);
 return {customerId,targetUserId,ownerId:customer.ownerId,version:commandFingerprint({customerVersion:customer.version,targetUserId,orders:items}),orders:items};
}
export async function previewTransfer(actor:BusinessActor,customerId:string,targetUserId:string){checkAdmin(actor,actor.aal);await assertSalesOwner(actor.companyId,uuid.parse(targetUserId));return readBusiness(actor,tx=>preview(tx,actor,uuid.parse(customerId),targetUserId));}
const transfer=z.object({requestId:uuid,customerId:uuid,targetUserId:uuid,previewVersion:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function transferCustomer(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=transfer.parse(raw);await assertSalesOwner(actor.companyId,input.targetUserId);return runBusinessCommand(actor,{requestId:input.requestId,kind:'customer.transfer',payload:input},async tx=>{
 const current=await preview(tx,actor,input.customerId,input.targetUserId);if(current.version!==input.previewVersion)throw new Error('VERSION_CONFLICT');
 await tx`update trade_business.business_records set owner_id=${input.targetUserId},version=version+1 where company_id=${actor.companyId} and kind='customer' and id=${input.customerId}`;
 await tx`delete from trade_business.record_shares where company_id=${actor.companyId} and kind='customer' and record_id=${input.customerId}`;
 await tx`update trade_business.orders set owner_id=${input.targetUserId},version=version+1 where company_id=${actor.companyId} and customer_id=${input.customerId} and state not in ('completed','cancelled')`;
 for(const item of current.orders.filter(o=>o.state==='completed'||o.state==='cancelled'))await tx`insert into trade_business.order_shares(company_id,order_id,user_id) values(${actor.companyId},${item.id},${input.targetUserId}) on conflict do nothing`;
 await audit(tx,actor,input.customerId,'customer.transfer',{from:current.ownerId,to:input.targetUserId});return {id:input.customerId};
 });}
