import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit,type BusinessTx} from './commands';
import {saveRecordInTransaction} from './records';
import {addFollowupInTransaction} from './customers';
export const WRITEBACK_NEXT_DAYS=7;
const schema=z.object({requestId:z.uuid(),payload:z.object({approvalId:z.uuid()}).strict()}).strict();
export async function outreachWriteback(actor:BusinessActor,raw:unknown){
 checkAdmin(actor,actor.aal);const input=schema.parse(raw);
 return runBusinessCommand(actor,{...input,kind:'outreach_writeback'},async tx=>{
 return writebackInTransaction(tx,actor,input.payload.approvalId);
 });
}
// Internal transaction helper. The caller must have approved the queue row first.
export async function writebackInTransaction(tx:BusinessTx,actor:BusinessActor,approvalId:string,policy?:{gate:'auto';reportSummary:string}){
 const gate=policy?.gate??'human';
 const rows=await tx`select q.id,q.state,d.id as draft_id,d.state as draft_state,d.written_back_at,d.subject,l.id as lead_id,l.name,l.email from trade_business.approval_queue q join trade_business.outreach_drafts d on d.company_id=q.company_id and d.id=q.draft_id join trade_business.leads l on l.company_id=d.company_id and l.id=d.lead_id where q.company_id=${actor.companyId} and q.id=${approvalId}`;
 const row=rows[0];if(!row)throw Error('NOT_FOUND');
 if(row.state!=='approved'||row.draft_state!=='approved'||row.written_back_at)throw Error('INVALID_TRANSITION');
 const existing=await tx`select id,version from trade_business.business_records where company_id=${actor.companyId} and kind='customer' and lower(payload->>'email')=lower(${row.email}) order by created_at,id limit 1`;
 let customerId=existing[0]?.id;const version=existing[0]?.version??1;
 if(!customerId){const saved=await saveRecordInTransaction(tx,actor,{requestId:randomUUID(),kind:'customer',payload:{name:String(row.name).slice(0,120),email:row.email,address:'待补',country:'',phone:'',contact:'',source:'other',customerStage:'potential'}});customerId=saved.id;}
 const reports=policy?[{summary:policy.reportSummary}]:await tx`select summary from trade_business.diligence_reports where company_id=${actor.companyId} and lead_id=${row.lead_id} order by created_at desc,id limit 1`;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const next=new Date(day+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+WRITEBACK_NEXT_DAYS);
 await addFollowupInTransaction(tx,actor,{requestId:randomUUID(),customerId,date:day,nextDate:next.toISOString().slice(0,10),expectedVersion:version,note:('[AI辅助] 已批邮件主题：'+String(row.subject).slice(0,900)+'\n背调摘要：'+String(reports[0]?.summary??'无').slice(0,900)).slice(0,2000)});
 await tx`update trade_business.outreach_drafts set customer_id=${customerId},written_back_at=now() where company_id=${actor.companyId} and id=${row.draft_id}`;
 await tx`update trade_business.approval_queue set customer_id=${customerId},written_back_at=now() where company_id=${actor.companyId} and id=${row.id}`;
 await tx`update trade_business.leads set customer_id=${customerId},written_back_at=now() where company_id=${actor.companyId} and id=${row.lead_id}`;
 await audit(tx,actor,row.draft_id,'outreach_writeback',{customerId,gate,...(gate==='auto'?{actor:'system-policy'}:{})});return {id:row.draft_id,customerId};
}
