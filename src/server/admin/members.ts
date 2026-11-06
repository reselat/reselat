import type postgres from 'postgres';
import {authDatabase} from '@/server/db/client';
import {IdentityError,type Employee} from '@/server/auth/employee';
import {memberPatch,type MemberChange} from './member-domain';
export type AdminTx=postgres.TransactionSql;
export async function lockAdmin(tx:AdminTx,actor:Employee){
 await tx`select id from trade_private.companies where id=${actor.companyId} for update`;
 const rows=await tx`select role,enabled,archived_at from trade_private.employees where company_id=${actor.companyId} and user_id=${actor.id} for update`;
 if(!rows[0]?.enabled||rows[0]?.role!=='admin'||rows[0]?.archived_at)throw new IdentityError('FORBIDDEN');
}
export async function listMembers(actor:Employee,params:URLSearchParams){
 const search=(params.get('search')||'').slice(0,80);const role=params.get('role')||'';const status=params.get('status')||'active';
 if(!['active','disabled','archived','all'].includes(status)||!['','admin','sales','operations'].includes(role))throw new Error('INVALID_FILTER');
 const offset=Math.max(0,Math.min(100000,Number(params.get('offset'))||0));const limit=50;
 const db=await authDatabase();
 const result=await db.begin(async tx=>{
 await lockAdmin(tx,actor);
 const where=tx`company_id=${actor.companyId} and (${search}='' or position(lower(${search}) in lower(display_name))>0) and (${role}='' or role=${role}) and ((${status}='all') or (${status}='active' and archived_at is null) or (${status}='disabled' and archived_at is null and not enabled) or (${status}='archived' and archived_at is not null))`;
 const rows=await tx`select user_id as id,display_name as name,role,enabled,version,created_at as "createdAt",archived_at as "archivedAt" from trade_private.employees where ${where} order by created_at,user_id limit ${limit} offset ${offset}`;
 const totals=await tx`select count(*)::int as total from trade_private.employees where ${where}`;
 const counts=await tx`select count(*) filter(where archived_at is null)::int as total,count(*) filter(where archived_at is null and enabled)::int as enabled,count(*) filter(where archived_at is null and not enabled)::int as disabled,count(*) filter(where archived_at is not null)::int as archived,count(*) filter(where archived_at is null and enabled and role='admin')::int as admins from trade_private.employees where company_id=${actor.companyId}`;
 const roles=await tx`select role,count(*)::int as count from trade_private.employees where company_id=${actor.companyId} and archived_at is null group by role`;
 return {employees:rows,total:totals[0].total,counts:counts[0],roles,offset,limit};
 });return result;
}
export async function mutateMember(actor:Employee,change:MemberChange){return (await authDatabase()).begin(async tx=>{
 await lockAdmin(tx,actor);
 const rows=await tx`select enabled,archived_at as "archivedAt",version from trade_private.employees where company_id=${actor.companyId} and user_id=${change.id} for update`;
 if(!rows[0]||rows[0].version!==change.version)return false;
 const patch=memberPatch({enabled:rows[0].enabled,archivedAt:rows[0].archivedAt},change,actor.id,change.id);
 const updates:Record<string,string|boolean|Date|null>={enabled:patch.enabled,archived_at:patch.archived?new Date():null};
 if(!('action' in change)){if(change.name!==undefined)updates.display_name=change.name;if(change.role!==undefined)updates.role=change.role;}
 await tx`update trade_private.employees set ${tx(updates)},version=version+1 where company_id=${actor.companyId} and user_id=${change.id} and version=${change.version}`;
 const action='action' in change?'employee.'+change.action:'employee.update';
 await tx`insert into trade_private.audit_events(company_id,actor_id,subject_id,action,details) values(${actor.companyId},${actor.id},${change.id},${action},${tx.json({enabled:patch.enabled,...(!('action' in change)&&change.role?{role:change.role}:{})})})`;
 return true;
});}
