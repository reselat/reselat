import {z} from 'zod';
import {date} from '@/modules/business/schemas';
import {authDatabase} from '@/server/db/client';
import type {BusinessActor} from './access';
import {readBusiness} from './order-data';
export async function customerDevelopment(actor:BusinessActor,rawDay:string){const day=date.parse(rawDay);return readBusiness(actor,async tx=>{
 // Attribute acquisition to its first save event, not its current owner. Transfers cannot rewrite performance.
 const created=await tx`select e.actor_id as "userId",count(*)::int as count from trade_business.business_records r join lateral (select actor_id from trade_business.audit_events a where a.company_id=r.company_id and a.subject_id=r.id and a.action='record.save' and a.details->>'kind'='customer' order by a.created_at,a.id limit 1) e on true where r.company_id=${actor.companyId} and r.kind='customer' and r.created_at>=(${day}::date::timestamp at time zone 'Asia/Shanghai') and r.created_at<(((${day}::date+1)::timestamp) at time zone 'Asia/Shanghai') and (${actor.role==='admin'} or e.actor_id=${actor.id}) group by e.actor_id`;
 const followed=await tx`select actor_id as "userId",count(*)::int as count,count(*) filter(where note like '[AI辅助]%')::int as ai,count(distinct customer_id)::int as customers from trade_business.followups where company_id=${actor.companyId} and day=${day}::date and (${actor.role==='admin'} or actor_id=${actor.id}) group by actor_id`;
 const db=await authDatabase();const members=await db`select user_id as id,display_name as name,role,enabled,archived_at from trade_private.employees where company_id=${actor.companyId} and (${actor.role==='admin'} or user_id=${actor.id}) order by display_name,user_id`;
 const items=members.map(m=>({userId:String(m.id),name:String(m.name),role:z.enum(['admin','sales','operations']).parse(m.role),enabled:Boolean(m.enabled)&&!m.archived_at,newCustomers:Number(created.find(r=>r.userId===m.id)?.count??0),followups:Number(followed.find(r=>r.userId===m.id)?.count??0),aiFollowups:Number(followed.find(r=>r.userId===m.id)?.ai??0),followedCustomers:Number(followed.find(r=>r.userId===m.id)?.customers??0)}));
 return {day,timeZone:'Asia/Shanghai',scope:actor.role==='admin'?'company':'self',items,totals:items.reduce((t,r)=>({aiFollowups:t.aiFollowups+r.aiFollowups,newCustomers:t.newCustomers+r.newCustomers,followups:t.followups+r.followups,followedCustomers:t.followedCustomers+r.followedCustomers}),{aiFollowups:0,newCustomers:0,followups:0,followedCustomers:0})};
 });}
