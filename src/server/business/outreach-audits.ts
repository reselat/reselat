import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {checkAdmin} from '@/server/auth/employee';
import {outreachDraftSchema,outreachReviewSchema,fuseOutreach} from '@/modules/business/outreach-fusion';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit,type BusinessTx,type CommandResult} from './commands';
import {readBusiness} from './order-data';
import {writebackInTransaction} from './outreach-writeback';

const schemas={
 outreach_audit_submit:z.object({leadId:z.uuid(),draft:outreachDraftSchema.optional()}).strict(),
 outreach_audit_record:z.object({auditId:z.uuid(),review:outreachReviewSchema}).strict(),
 outreach_audit_fuse:z.object({auditId:z.uuid()}).strict(),
};
async function latestReport(tx:BusinessTx,actor:BusinessActor,leadId:string){
 // Only an auto-accepted or human-accepted audit can authorize custom fusion.
 const rows=await tx`select r.id,r.summary from trade_business.diligence_reports r where r.company_id=${actor.companyId} and r.lead_id=${leadId} and exists(select 1 from trade_business.diligence_audits a where a.company_id=r.company_id and a.lead_id=r.lead_id and a.report_id=r.id and (a.status='auto_accepted' or a.human_decision='accept')) order by r.created_at desc,r.id limit 1`;
 if(!rows.length||!String(rows[0].summary).trim())throw Error('DILIGENCE_REQUIRED');
 return rows[0];
}
// Host/admin policy pipeline. Human approve/reject remain session-only commands.
export async function outreachAuditCommand(actor:BusinessActor,kind:string,raw:unknown){
 checkAdmin(actor,actor.aal);
 const input=z.object({requestId:z.uuid(),payload:z.unknown()}).strict().parse(raw);
 if(!Object.hasOwn(schemas,kind))throw Error('INVALID_INPUT');
 const payload=schemas[kind as keyof typeof schemas].parse(input.payload);
 return runBusinessCommand(actor,{requestId:input.requestId,kind,payload},async(tx):Promise<CommandResult>=>{
  if('leadId' in payload){
   const leads=await tx`select id,name from trade_business.leads where company_id=${actor.companyId} and id=${payload.leadId}`;
   if(!leads.length)throw Error('NOT_FOUND');
   const report=await latestReport(tx,actor,payload.leadId);
   const draft=outreachDraftSchema.parse(payload.draft??{
    subject:'合作需求交流',
    body:`您好，\n根据已记录的背调：\n${String(report.summary).slice(0,9000)}\n希望进一步了解贵司需求。若不希望继续联系，请告知。`,
   });
   const id=randomUUID();
   await tx`insert into trade_business.outreach_audits(company_id,id,lead_id,report_id,report_summary,draft) values(${actor.companyId},${id},${payload.leadId},${report.id},${report.summary},${tx.json(draft)})`;
   await audit(tx,actor,id,kind,{report_id:report.id});
   return {id,status:'needs_human',reportId:report.id};
  }
  const rows=await tx`select * from trade_business.outreach_audits where company_id=${actor.companyId} and id=${payload.auditId} for update`;
  if(!rows.length)throw Error('NOT_FOUND');
  const task=rows[0];
  if(task.fusion)throw Error('INVALID_TRANSITION');
  const reviews=z.array(outreachReviewSchema).max(20).parse(task.reviews);
  if('review' in payload){
   const review=outreachReviewSchema.parse(payload.review);
   if(reviews.length>=20)throw Error('INVALID_INPUT');
   if(reviews.some(r=>r.seatId===review.seatId))throw Error('DUPLICATE_SEAT');
   await tx`update trade_business.outreach_audits set reviews=${tx.json([...reviews,review])} where company_id=${actor.companyId} and id=${task.id}`;
   await audit(tx,actor,task.id,kind,{seat_id:review.seatId});
   return {id:task.id};
  }
  const report=await latestReport(tx,actor,task.lead_id);
  const fusion=fuseOutreach(task.draft,reviews,report.summary);
  if(report.id!==task.report_id||report.summary!==task.report_summary){
   fusion.blockers.push('背调已更新，草稿绑定版本待核实');
   fusion.confidence='low';fusion.status='needs_human';
  }
  const automatic=fusion.confidence==='high';
  const draftId=randomUUID(),approvalId=randomUUID();
  const state=automatic?'approved':'pending',gate=automatic?'auto':'human';
  await tx`insert into trade_business.outreach_drafts(company_id,id,lead_id,subject,body,state) values(${actor.companyId},${draftId},${task.lead_id},${fusion.subject},${fusion.body},${state})`;
  await tx`insert into trade_business.approval_queue(company_id,id,draft_id,submitted_by,state,approval_gate) values(${actor.companyId},${approvalId},${draftId},${actor.id},${state},${gate})`;
  await tx`update trade_business.outreach_audits set fusion=${tx.json(fusion)},status=${fusion.status},draft_id=${draftId},approval_id=${approvalId} where company_id=${actor.companyId} and id=${task.id}`;
  if(automatic){
   await audit(tx,actor,approvalId,'outreach_approve',{gate:'auto',actor:'system-policy',draft_id:draftId,audit_id:task.id});
   await writebackInTransaction(tx,actor,approvalId,{gate:'auto',reportSummary:report.summary});
  }
  await audit(tx,actor,task.id,kind,{gate,actor:automatic?'system-policy':'human-queue',report_id:report.id,agreement_ratio:fusion.agreement_ratio,status:fusion.status});
  return {id:task.id,status:fusion.status,draftId,approvalId};
 });
}
export async function outreachAuditList(actor:BusinessActor){
 checkAdmin(actor,actor.aal);
 return readBusiness(actor,async db=>({items:await db`select a.*,d.written_back_at from trade_business.outreach_audits a left join trade_business.outreach_drafts d on d.company_id=a.company_id and d.id=a.draft_id where a.company_id=${actor.companyId} order by a.created_at desc,a.id limit 500`}));
}
