import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit} from './commands';
export const MAX_NO_REPLY_REDRAFTS=2;
// Host/admin only. No send capability is involved.
export async function scanDueFollowups(actor:BusinessActor,raw:unknown){
 checkAdmin(actor,actor.aal);
 const input=z.object({requestId:z.uuid(),payload:z.object({today:z.iso.date()}).strict()}).strict().parse(raw);
 return runBusinessCommand(actor,{...input,kind:'outreach_followup_scan'},async tx=>{
 const due=await tx`select f.*,c.payload from trade_business.followups f join trade_business.business_records c on c.company_id=f.company_id and c.id=f.customer_id where f.company_id=${actor.companyId} and f.next_day<=${input.payload.today}::date and not exists(select 1 from trade_business.followups n where n.company_id=f.company_id and n.customer_id=f.customer_id and (n.created_at,n.id)>(f.created_at,f.id)) order by f.id`;
 let processed=0,skipped=0;
 for(const f of due){
 const parents=await tx`select d.* from trade_business.outreach_drafts d join trade_business.leads l on l.company_id=d.company_id and l.id=d.lead_id where d.company_id=${actor.companyId} and l.customer_id=${f.customer_id} and d.written_back_at is not null order by d.written_back_at desc,d.id limit 1`;
 const parent=parents[0];
 const previous=await tx`select id from trade_business.outreach_drafts where company_id=${actor.companyId} and followup_id=${f.id}`;
 const counts=await tx`select count(*)::int as total from trade_business.outreach_drafts where company_id=${actor.companyId} and followup_id is not null and (customer_id=${f.customer_id} or lead_id in(select id from trade_business.leads where company_id=${actor.companyId} and customer_id=${f.customer_id}))`;
 const reports=parent?await tx`select r.* from trade_business.diligence_reports r where r.company_id=${actor.companyId} and r.lead_id=${parent.lead_id} and exists(select 1 from trade_business.diligence_audits a where a.company_id=r.company_id and a.report_id=r.id and (a.status='auto_accepted' or a.human_decision='accept')) order by r.created_at desc,r.id limit 1`:[];
 const reason=previous.length?'already_redrafted':f.payload.stopContact===true?'stop_contact':f.payload.replied===true?'reply_recorded':!parent?'no_written_back_draft':counts[0].total>=MAX_NO_REPLY_REDRAFTS?'limit_reached':!reports.length?'no_accepted_report':null;
 if(reason){skipped++;await audit(tx,actor,f.id,'outreach_followup_redraft',{gate:'human',actor:'human-queue',reason});continue;}
 const id=randomUUID(),approvalId=randomUUID(),round=counts[0].total+1;
 const subject=`跟进 ${round}：${parent.subject}`.slice(0,200);
 const body=`您好，\n这是第 ${round} 次需求跟进。此前草稿内容：\n${String(parent.body).slice(0,4000)}\n最新已接受背调：\n${String(reports[0].summary).slice(0,3000)}\n如有相关需求，欢迎交流；如不希望继续联系，请告知。`;
 await tx`insert into trade_business.outreach_drafts(company_id,id,lead_id,subject,body,state,followup_id,parent_draft_id,followup_round) values(${actor.companyId},${id},${parent.lead_id},${subject},${body},'pending',${f.id},${parent.id},${round})`;
 await tx`insert into trade_business.approval_queue(company_id,id,draft_id,submitted_by,state,approval_gate) values(${actor.companyId},${approvalId},${id},${actor.id},'pending','human')`;
 await audit(tx,actor,id,'outreach_followup_redraft',{gate:'human',actor:'human-queue',followup_id:f.id,round,status:'pending'});processed++;
 }
 await audit(tx,actor,input.requestId,'outreach_followup_scan',{processed,skipped,gate:'human',actor:'human-queue'});
 return {processed,skipped};
 });
}

export async function followupRedraftSummary(actor:BusinessActor){
 checkAdmin(actor,actor.aal);
 const {readBusiness}=await import('./order-data');
 return readBusiness(actor,async tx=>({
 latest:await tx`select details,created_at::text from trade_business.audit_events where company_id=${actor.companyId} and action='outreach_followup_scan' order by id desc limit 1`,
 drafts:await tx`select id,state,followup_round from trade_business.outreach_drafts where company_id=${actor.companyId} and followup_id is not null order by created_at desc,id limit 20`,
 due:await tx`select count(*)::int as total from trade_business.followups f join trade_business.business_records c on c.company_id=f.company_id and c.id=f.customer_id where f.company_id=${actor.companyId} and f.next_day<=(now() at time zone 'Asia/Shanghai')::date and coalesce(c.payload->>'stopContact','false')<>'true' and coalesce(c.payload->>'replied','false')<>'true' and not exists(select 1 from trade_business.followups n where n.company_id=f.company_id and n.customer_id=f.customer_id and (n.created_at,n.id)>(f.created_at,f.id)) and not exists(select 1 from trade_business.outreach_drafts d where d.company_id=f.company_id and d.followup_id=f.id) and exists(select 1 from trade_business.leads l join trade_business.outreach_drafts d on d.company_id=l.company_id and d.lead_id=l.id where l.company_id=f.company_id and l.customer_id=f.customer_id and d.written_back_at is not null and exists(select 1 from trade_business.diligence_reports r join trade_business.diligence_audits a on a.company_id=r.company_id and a.report_id=r.id where r.company_id=l.company_id and r.lead_id=l.id and (a.status='auto_accepted' or a.human_decision='accept'))) and (select count(*) from trade_business.outreach_drafts d join trade_business.leads l on l.company_id=d.company_id and l.id=d.lead_id where d.company_id=f.company_id and l.customer_id=f.customer_id and d.followup_id is not null)<${MAX_NO_REPLY_REDRAFTS}`,
 }));
}
