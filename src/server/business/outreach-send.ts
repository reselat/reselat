import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit} from './commands';
import {brevoConfiguration,sendBrevo} from './brevo';
const schema=z.object({requestId:z.uuid(),payload:z.object({approvalId:z.uuid()}).strict()}).strict();
export async function outreachSendBrevo(actor:BusinessActor,raw:unknown){
 checkAdmin(actor,actor.aal);
 const input=schema.parse(raw);
 brevoConfiguration();
 const reservation=await runBusinessCommand(actor,{...input,kind:'outreach_send_brevo'},async tx=>{
 const rows=await tx`select q.state,d.id,d.state as draft_state,d.subject,d.body,d.sent_at,d.brevo_message_id,d.brevo_send_started_at,l.email from trade_business.approval_queue q join trade_business.outreach_drafts d on d.company_id=q.company_id and d.id=q.draft_id join trade_business.leads l on l.company_id=d.company_id and l.id=d.lead_id where q.company_id=${actor.companyId} and q.id=${input.payload.approvalId}`;
 const row=rows[0];
 if(!row)throw Error('NOT_FOUND');
 if(row.state!=='approved'||row.draft_state!=='approved')throw Error('INVALID_TRANSITION');
 if(row.sent_at||row.brevo_message_id||row.brevo_send_started_at)throw Error('BREVO_ALREADY_STARTED');
 z.email().parse(row.email);z.string().trim().min(1).parse(row.subject);z.string().trim().min(1).parse(row.body);
 await tx`update trade_business.outreach_drafts set brevo_send_started_at=now() where company_id=${actor.companyId} and id=${row.id}`;
 await audit(tx,actor,row.id,'outreach_send_brevo',{actor:'human',channel:'brevo',status:'started'});
 return {id:row.id,email:row.email,subject:row.subject,body:row.body};
 });
 // A replay must never issue a second provider request.
 const claim=await runBusinessCommand(actor,{requestId:randomUUID(),kind:'outreach_send_claim',payload:{id:reservation.id}},async tx=>{
 const rows=await tx`update trade_business.outreach_drafts set brevo_send_started_at=brevo_send_started_at where company_id=${actor.companyId} and id=${String(reservation.id)} and brevo_message_id is null and not exists(select 1 from trade_business.audit_events where company_id=${actor.companyId} and subject_id=${String(reservation.id)} and action='outreach_send_dispatch') returning id`;
 if(!rows.length)throw Error('BREVO_ALREADY_STARTED');
 await audit(tx,actor,String(reservation.id),'outreach_send_dispatch',{actor:'human',channel:'brevo'});return {id:reservation.id};
 });
 let messageId:string;
 try{messageId=await sendBrevo({email:String(reservation.email),subject:String(reservation.subject),body:String(reservation.body),tags:[actor.companyId,String(claim.id),input.payload.approvalId]});}
 catch(error){await runBusinessCommand(actor,{requestId:randomUUID(),kind:'outreach_send_failure',payload:{id:claim.id}},async tx=>{await audit(tx,actor,String(claim.id),'outreach_send_brevo',{actor:'human',channel:'brevo',status:error instanceof Error?error.message:'BREVO_RESULT_UNKNOWN'});return {id:claim.id};});throw error;}
 return runBusinessCommand(actor,{requestId:randomUUID(),kind:'outreach_send_receipt',payload:{id:claim.id,messageId}},async tx=>{
 await tx`update trade_business.outreach_drafts set sent_at=now(),brevo_message_id=${messageId} where company_id=${actor.companyId} and id=${String(claim.id)}`;
 await audit(tx,actor,String(claim.id),'outreach_send_brevo',{actor:'human',channel:'brevo',status:'sent',messageId});return {id:claim.id,messageId};
 });
}
