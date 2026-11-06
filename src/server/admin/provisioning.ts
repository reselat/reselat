import {z} from 'zod';
import {authDatabase} from '@/server/db/client';
import type {Employee} from '@/server/auth/employee';
import {lockAdmin,type AdminTx} from './members';
import {authAdmin,createAuthAccount,confirmProvisionIdentity} from './auth-admin';
import type {CreateMember} from './member-domain';
import {runProvision,type ProvisionStore} from './provision-flow';
async function finishMember(tx:AdminTx,actor:Employee,id:string){
 const rows=await tx`select auth_user_id,display_name,role,state from trade_private.member_provisions where company_id=${actor.companyId} and id=${id} for update`;
 const row=rows[0];if(!row?.auth_user_id)throw new Error('RECONCILIATION_REQUIRED');if(row.state==='completed')return;
 // Never mutate an existing membership during retry or allow cross-company association.
 const existing=await tx`select company_id from trade_private.employees where user_id=${row.auth_user_id}`;
 if(existing.length)throw new Error('RECONCILIATION_REQUIRED');
 await tx`insert into trade_private.employees(user_id,company_id,display_name,role,enabled) values(${row.auth_user_id},${actor.companyId},${row.display_name},${row.role},true)`;
 await tx`update trade_private.member_provisions set state='completed',updated_at=now() where company_id=${actor.companyId} and id=${id}`;
 await tx`insert into trade_private.audit_events(company_id,actor_id,subject_id,action,details) values(${actor.companyId},${actor.id},${row.auth_user_id},'employee.create','{}')`;
}
export async function provisionStore(actor:Employee):Promise<ProvisionStore>{
 const db=await authDatabase();return {
 reserve:async input=>db.begin(async tx=>{await lockAdmin(tx,actor);const inserted=await tx`insert into trade_private.member_provisions(id,company_id,actor_id,display_name,role,state) values(${input.requestId},${actor.companyId},${actor.id},${input.name},${input.role},'pending') on conflict do nothing returning id`;
 const rows=await tx`select id,display_name as name,role,state,auth_user_id as "userId" from trade_private.member_provisions where company_id=${actor.companyId} and id=${input.requestId}`;
 if(!rows[0])throw new Error('REQUEST_MISMATCH');
 const row=z.object({id:z.string().uuid(),name:z.string(),role:z.enum(['admin','sales','operations']),state:z.enum(['pending','auth_created','completed','needs_reconciliation','rejected']),userId:z.string().uuid().nullable()}).parse(rows[0]);return {fresh:inserted.length>0,record:row};}),
 setUser:async(id,userId)=>{await db.begin(async tx=>{await lockAdmin(tx,actor);await tx`update trade_private.member_provisions set auth_user_id=${userId},state='auth_created',updated_at=now() where company_id=${actor.companyId} and id=${id} and state in ('pending','needs_reconciliation')`;});},
 finish:async id=>{await db.begin(async tx=>{await lockAdmin(tx,actor);await finishMember(tx,actor,id);});},
 reject:async id=>{await db`update trade_private.member_provisions set state='rejected',updated_at=now() where company_id=${actor.companyId} and id=${id} and state='pending'`;},
 uncertain:async id=>{await db`update trade_private.member_provisions set state='needs_reconciliation',updated_at=now() where company_id=${actor.companyId} and id=${id} and state<>'completed'`;}
 };
}
export async function provisionMember(actor:Employee,input:CreateMember){authAdmin();return runProvision(await provisionStore(actor),createAuthAccount,input);}
export async function listProvisions(actor:Employee,offset=0){return (await authDatabase()).begin(async tx=>{await lockAdmin(tx,actor);const rows=await tx`select id,display_name as name,role,state,auth_user_id is not null as "canRecover",created_at as "createdAt" from trade_private.member_provisions where company_id=${actor.companyId} and state<>'completed' order by created_at desc,id desc limit 51 offset ${offset}`;return {operations:rows.slice(0,50),hasMore:rows.length>50};});}
export async function recoverProvision(actor:Employee,id:string,suppliedUserId?:string){
 const db=await authDatabase();const rows=await db`select auth_user_id,state from trade_private.member_provisions where company_id=${actor.companyId} and id=${id}`;
 if(!rows[0])throw new Error('PROVISION_NOT_FOUND');
 if(rows[0].state==='completed')return {status:'completed'};
 const userId=rows[0].auth_user_id||suppliedUserId;
 if(!userId)throw new Error('RECONCILIATION_REQUIRED');
 await confirmProvisionIdentity(userId,id);
 await db.begin(async tx=>{await lockAdmin(tx,actor);await tx`update trade_private.member_provisions set auth_user_id=${userId},state='auth_created',updated_at=now() where company_id=${actor.companyId} and id=${id} and state<>'completed'`;await finishMember(tx,actor,id);});return {status:'completed'};
}
