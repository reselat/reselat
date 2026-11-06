import {z} from 'zod';
import {authDatabase} from '@/server/db/client';
import {checkAdmin,IdentityError} from '@/server/auth/employee';
import {lockAdmin} from '@/server/admin/members';
import {uuid} from '@/modules/business/schemas';
import type {BusinessActor} from './access';
import {readBusiness} from './order-data';
import {runBusinessCommand,audit,type BusinessTx} from './commands';
import {commandFingerprint} from './command-values';
const selection=z.object({sourceId:uuid,targetId:uuid}).strict().refine(v=>v.sourceId!==v.targetId);
const handoverCommand=z.object({requestId:uuid,sourceId:uuid,targetId:uuid,previewVersion:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(1).max(500)}).strict();
async function withMembers<T>(actor:BusinessActor,raw:unknown,run:(pair:{sourceRole:string;targetRole:string})=>Promise<T>){
 checkAdmin(actor,actor.aal);const input=selection.parse(raw);if(input.sourceId===actor.id)throw new IdentityError('FORBIDDEN');
 return (await authDatabase()).begin(async tx=>{
  // Lock identity changes while the business transaction checks and transfers scope.
  await lockAdmin(tx,actor);
  const rows=await tx`select user_id as id,role,enabled,archived_at from trade_private.employees where company_id=${actor.companyId} and user_id in (${input.sourceId},${input.targetId}) order by user_id for update`;
  const source=rows.find(r=>r.id===input.sourceId),target=rows.find(r=>r.id===input.targetId);
  if(!source||!target)throw new IdentityError('FORBIDDEN');if(source.enabled)throw new Error('SOURCE_MUST_BE_DISABLED');if(!target.enabled||target.archived_at)throw new Error('TARGET_MUST_BE_ACTIVE');
  return run({sourceRole:String(source.role),targetRole:String(target.role)});
 });
}
async function inventory(tx:BusinessTx,actor:BusinessActor,sourceId:string,targetId:string){
 const records=await tx`select id,kind,version from trade_business.business_records where company_id=${actor.companyId} and owner_id=${sourceId} order by kind,id`;
 const orders=await tx`select id,version,state,owner_id,operations_id from trade_business.orders where company_id=${actor.companyId} and (owner_id=${sourceId} or operations_id=${sourceId} or customer_id in (select id from trade_business.business_records where company_id=${actor.companyId} and kind='customer' and owner_id=${sourceId})) order by id`;
 const recordShares=await tx`select kind,record_id from trade_business.record_shares where company_id=${actor.companyId} and user_id=${sourceId} order by kind,record_id`;
 const orderShares=await tx`select order_id from trade_business.order_shares where company_id=${actor.companyId} and user_id=${sourceId} order by order_id`;
 return {records,orders,recordShares,orderShares,version:commandFingerprint({sourceId,targetId,records,orders,recordShares,orderShares}),counts:{customers:records.filter(r=>r.kind==='customer').length,products:records.filter(r=>r.kind==='product').length,suppliers:records.filter(r=>r.kind==='supplier').length,orders:orders.length,completedOrders:orders.filter(o=>o.state==='completed').length,operationsOrders:orders.filter(o=>o.operations_id===sourceId).length,sharedRecords:recordShares.length,sharedOrders:orderShares.length}};
}
function checkTarget(current:Awaited<ReturnType<typeof inventory>>,sourceId:string,role:string){
 if(role==='admin')return;
 if((current.counts.customers||current.orders.some(o=>o.owner_id===sourceId)||current.orders.some(o=>o.operations_id!==sourceId))&&role!=='sales')throw new Error('HANDOVER_ROLE_MISMATCH');
 if(current.counts.operationsOrders&&role!=='operations')throw new Error('HANDOVER_ROLE_MISMATCH');
 if(current.counts.suppliers||current.counts.products&&role!=='operations')throw new Error('HANDOVER_ROLE_MISMATCH');
}
export async function previewEmployeeHandover(actor:BusinessActor,raw:unknown){const input=selection.parse(raw);return withMembers(actor,input,async pair=>readBusiness(actor,async tx=>{const current=await inventory(tx,actor,input.sourceId,input.targetId);checkTarget(current,input.sourceId,pair.targetRole);return {sourceId:input.sourceId,targetId:input.targetId,version:current.version,counts:current.counts};}));}
export async function handoverEmployee(actor:BusinessActor,raw:unknown){const input=handoverCommand.parse(raw);return withMembers(actor,{sourceId:input.sourceId,targetId:input.targetId},async pair=>runBusinessCommand(actor,{requestId:input.requestId,kind:'employee.handover',payload:input},async tx=>{
 const current=await inventory(tx,actor,input.sourceId,input.targetId);if(current.version!==input.previewVersion)throw new Error('VERSION_CONFLICT');checkTarget(current,input.sourceId,pair.targetRole);
 // Completed orders are transferred too. Snapshots, creators, followups and financial entries remain immutable.
 await tx`update trade_business.orders set owner_id=case when owner_id=${input.sourceId} or customer_id in (select id from trade_business.business_records where company_id=${actor.companyId} and kind='customer' and owner_id=${input.sourceId}) then ${input.targetId}::uuid else owner_id end,operations_id=case when operations_id=${input.sourceId} then ${input.targetId}::uuid else operations_id end,version=version+1 where company_id=${actor.companyId} and (owner_id=${input.sourceId} or operations_id=${input.sourceId} or customer_id in (select id from trade_business.business_records where company_id=${actor.companyId} and kind='customer' and owner_id=${input.sourceId}))`;
 await tx`update trade_business.business_records set owner_id=${input.targetId},version=version+1 where company_id=${actor.companyId} and owner_id=${input.sourceId}`;
 await tx`insert into trade_business.record_shares(company_id,kind,record_id,user_id) select company_id,kind,record_id,${input.targetId} from trade_business.record_shares where company_id=${actor.companyId} and user_id=${input.sourceId} on conflict do nothing`;
 await tx`delete from trade_business.record_shares where company_id=${actor.companyId} and user_id=${input.sourceId}`;
 await tx`insert into trade_business.order_shares(company_id,order_id,user_id) select company_id,order_id,${input.targetId} from trade_business.order_shares where company_id=${actor.companyId} and user_id=${input.sourceId} on conflict do nothing`;
 await tx`delete from trade_business.order_shares where company_id=${actor.companyId} and user_id=${input.sourceId}`;
 await audit(tx,actor,input.sourceId,'employee.handover',{from:input.sourceId,to:input.targetId,reason:input.reason,...current.counts});return {sourceId:input.sourceId,targetId:input.targetId,counts:current.counts};
 }));}
