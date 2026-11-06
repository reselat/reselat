import {assertAgentWrite} from './agent-roles';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit} from './commands';
import {readBusiness} from './order-data';
// @ts-expect-error Shared strict schemas for the Node MCP bridge.
import {payloads,commandSchema} from '../../../scripts/agents/p1-schemas.mjs';

export async function prospectCommand(actor:BusinessActor,kind:string,raw:unknown,roleCode?:string){
 checkAdmin(actor,actor.aal);
 if(!Object.hasOwn(payloads,kind))throw Error('INVALID_INPUT');
 const input=commandSchema(kind).parse(raw);
 return runBusinessCommand(actor,{...input,kind},async tx=>{
 if(roleCode!==undefined)await assertAgentWrite(actor,roleCode,kind,tx);
 const p=input.payload;let id=randomUUID();
 if(kind==='leads_upsert'){
 const rows=await tx`insert into trade_business.leads(company_id,id,name,email,source,place_id,maps_url,notes,address,phone) values(${actor.companyId},${id},${p.name},${p.email},${p.source},${p.placeId??null},${p.mapsUrl??null},${p.notes??null},${p.address??null},${p.phone??null}) on conflict(company_id,email) do update set name=excluded.name,source=excluded.source,place_id=coalesce(excluded.place_id,leads.place_id),maps_url=coalesce(excluded.maps_url,leads.maps_url),notes=coalesce(excluded.notes,leads.notes),address=coalesce(excluded.address,leads.address),phone=coalesce(excluded.phone,leads.phone) returning id`;id=rows[0].id;
 }else if(kind==='outreach_submit_approval'){
 const rows=await tx`update trade_business.outreach_drafts set state='pending' where company_id=${actor.companyId} and id=${p.draftId} and state in ('draft','pending') returning id`;
 if(!rows.length)throw Error('NOT_FOUND');
 const queue=await tx`insert into trade_business.approval_queue(company_id,id,draft_id,submitted_by) values(${actor.companyId},${id},${p.draftId},${actor.id}) on conflict(company_id,draft_id) do update set draft_id=excluded.draft_id returning id`;id=queue[0].id;
 }else{
 const lead=await tx`select id from trade_business.leads where company_id=${actor.companyId} and id=${p.leadId}`;if(!lead.length)throw Error('NOT_FOUND');
 if(kind==='diligence_save_report')await tx`insert into trade_business.diligence_reports(company_id,id,lead_id,summary) values(${actor.companyId},${id},${p.leadId},${p.summary})`;
 else await tx`insert into trade_business.outreach_drafts(company_id,id,lead_id,subject,body) values(${actor.companyId},${id},${p.leadId},${p.subject},${p.body})`;
 }
 await audit(tx,actor,id,kind);return {id};
 });
}
export async function approvalList(actor:BusinessActor,state?:string){checkAdmin(actor,actor.aal);const filter=z.enum(['pending','approved','rejected']).optional().parse(state);return readBusiness(actor,async db=>({items:await db`select q.id,q.draft_id,q.state,q.submitted_by,q.human_actor_id,q.created_at,q.customer_id,q.written_back_at,d.sent_at,d.brevo_message_id,d.brevo_send_started_at,d.subject,d.body,l.email from trade_business.approval_queue q join trade_business.outreach_drafts d on d.company_id=q.company_id and d.id=q.draft_id join trade_business.leads l on l.company_id=d.company_id and l.id=d.lead_id where q.company_id=${actor.companyId} and (${filter??null}::text is null or q.state=${filter??null}) order by q.created_at desc,q.id limit 100`}));}

// Only the same-origin authenticated HTTP session route invokes this command.
// Deliberately absent from the schemas used by the Agent MCP bridge.
export async function humanApprovalCommand(actor:BusinessActor,kind:string,raw:unknown){
 checkAdmin(actor,actor.aal);
 if(kind!=='outreach_approve'&&kind!=='outreach_reject')throw Error('INVALID_INPUT');
 const input=z.object({requestId:z.uuid(),payload:z.object({approvalId:z.uuid(),human_actor_id:z.uuid()}).strict()}).strict().parse(raw);
 if(input.payload.human_actor_id!==actor.id)throw Error('INVALID_INPUT');
 return runBusinessCommand(actor,{...input,kind},async tx=>{
 const state=kind==='outreach_approve'?'approved':'rejected';
 const rows=await tx`update trade_business.approval_queue set state=${state},human_actor_id=${actor.id} where company_id=${actor.companyId} and id=${input.payload.approvalId} and state='pending' returning id,draft_id`;
 if(!rows.length)throw Error('INVALID_TRANSITION');
 const drafts=await tx`update trade_business.outreach_drafts set state=${state} where company_id=${actor.companyId} and id=${rows[0].draft_id} and state='pending' returning id`;
 if(!drafts.length)throw Error('INVALID_TRANSITION');
 await audit(tx,actor,rows[0].id,kind,{human_actor_id:actor.id,draft_id:rows[0].draft_id});
 return {id:rows[0].id};
 });
}

export async function prospectList(actor:BusinessActor,view:string){
 checkAdmin(actor,actor.aal);
 return readBusiness(actor,async db=>{
 if(view==='leads')return {items:await db`select id,name,email,source,place_id,maps_url,notes,address,phone,created_at from trade_business.leads where company_id=${actor.companyId} order by created_at desc,id limit 500`};
 if(view==='diligence')return {items:await db`select id,lead_id,summary,created_at from trade_business.diligence_reports where company_id=${actor.companyId} order by created_at desc,id limit 500`};
 if(view==='drafts')return {items:await db`select id,lead_id,subject,body,state,created_at from trade_business.outreach_drafts where company_id=${actor.companyId} order by created_at desc,id limit 500`};
 throw Error('INVALID_INPUT');
 });
}
