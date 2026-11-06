// @ts-expect-error Shared Node Host graph validation.
import {defaultSteps,validateStepsGraph,assertReadyStep} from '../../../scripts/agents/step-graph.mjs';
import {assertAgentWrite} from './agent-roles';
import {z} from 'zod';
import {randomUUID} from 'node:crypto';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit} from './commands';
const uuid=z.uuid();
export const planInput=z.object({name:z.string().min(1),email:z.email(),subject:z.string().min(1),body:z.string().min(1),summary:z.string().optional()}).strict();
export async function orchestrationCommand(actor:BusinessActor,kind:string,raw:unknown){
 checkAdmin(actor,actor.aal);
 const schemas={pipeline_upsert:z.object({id:uuid,name:z.string().min(1).max(100),enabled:z.boolean(),stepsGraph:z.unknown().optional()}).strict(),plan_upsert:z.object({id:uuid,pipelineId:uuid,expectedVersion:z.number().int().positive().optional(),input:planInput,steps:z.string().trim().min(1).max(10000)}).strict(),run_enqueue:z.object({pipelineId:uuid,planId:uuid}).strict(),run_claim:z.object({id:uuid,owner:uuid}),pipeline_advance:z.object({id:uuid,owner:uuid,seq:z.number().int().min(0).max(3),step_key:z.string().optional(),evidence:z.object({id:uuid})}),run_resume:z.object({id:uuid}),run_cancel:z.object({id:uuid}),run_requeue:z.object({id:uuid})};
 if(!Object.hasOwn(schemas,kind))throw Error('INVALID_INPUT');
 const input=z.object({requestId:uuid,payload:schemas[kind as keyof typeof schemas]}).parse(raw);
 return runBusinessCommand(actor,{...input,kind},async tx=>{
 let version:number|undefined;
 const p=input.payload as {stepsGraph?:unknown;step_key?:string;expectedVersion?:number;id:string;name:string;enabled:boolean;pipelineId:string;planId:string;input:object;steps:string;owner:string;seq:number;evidence:{id:string}};const id=p.id??randomUUID();
 if(kind==='pipeline_upsert'){
 const graph=p.stepsGraph===undefined?null:JSON.stringify(validateStepsGraph(p.stepsGraph));
 await tx`insert into trade_business.agent_pipelines(company_id,id,name,enabled,steps_graph) values(${actor.companyId},${id},${p.name},${p.enabled},${graph??JSON.stringify(defaultSteps)}::jsonb) on conflict(company_id,id) do update set name=excluded.name,enabled=excluded.enabled,steps_graph=coalesce(${graph}::jsonb,agent_pipelines.steps_graph)`;
 }
 else if(kind==='plan_upsert'){
 const rows=await tx`insert into trade_business.agent_plans(company_id,id,pipeline_id,input,steps) values(${actor.companyId},${id},${p.pipelineId},${JSON.stringify(p.input)}::jsonb,${p.steps}) on conflict(company_id,id) do update set pipeline_id=excluded.pipeline_id,input=excluded.input,steps=excluded.steps,version=agent_plans.version+1 where agent_plans.state='draft' and (${p.expectedVersion??null}::integer is null or agent_plans.version=${p.expectedVersion??null}) returning id,version`;
 if(!rows.length)throw Error(p.expectedVersion===undefined?'INVALID_TRANSITION':'VERSION_CONFLICT');
 version=Number(rows[0].version);
 }else if(kind==='run_enqueue'){
 const pipeline=await tx`select id,steps_graph from trade_business.agent_pipelines where company_id=${actor.companyId} and id=${p.pipelineId} and enabled=true for share`;if(!pipeline.length)throw Error('NOT_FOUND');
 const plans=await tx`select input from trade_business.agent_plans where company_id=${actor.companyId} and id=${p.planId} and pipeline_id=${p.pipelineId} and state='confirmed' for share`;
 if(!plans.length)throw Error('REVIEW_REQUIRED');
 await tx`insert into trade_business.agent_runs(company_id,id,pipeline_id,plan_id,input,steps_graph) values(${actor.companyId},${id},${p.pipelineId},${p.planId},${JSON.stringify(plans[0].input)}::jsonb,${JSON.stringify(validateStepsGraph(pipeline[0].steps_graph))}::jsonb)`;
 }else{
 const rows=await tx`select * from trade_business.agent_runs where company_id=${actor.companyId} and id=${id} for update`;const run=rows[0];if(!run)throw Error('NOT_FOUND');
 if(['run_claim','pipeline_advance','run_requeue','run_resume'].includes(kind)){
 const plans=await tx`select id from trade_business.agent_plans where company_id=${actor.companyId} and id=${run.plan_id} and pipeline_id=${run.pipeline_id} and state='confirmed' and input=${JSON.stringify(run.input)}::jsonb`;
 if(!plans.length)throw Error('REVIEW_REQUIRED');
 }
 if(kind==='run_claim'){
 if(run.state!=='queued')throw Error('LEASE_CONFLICT');
 await tx`update trade_business.agent_runs set state='running',lease_owner=${p.owner},lease_until=now()+interval '5 minutes',started_at=coalesce(started_at,now()) where company_id=${actor.companyId} and id=${id}`;
 }else if(kind==='run_cancel'){
 if(!['queued','reserved','running','awaiting_approval','failed'].includes(run.state))throw Error('INVALID_TRANSITION');
 await tx`update trade_business.agent_runs set state='cancelled',lease_owner=null,lease_until=null where company_id=${actor.companyId} and id=${id}`;
 }else if(kind==='run_resume'){
 const done=await tx`select q.id from trade_business.agent_steps s join trade_business.approval_queue q on q.company_id=s.company_id and q.id=(s.evidence->>'id')::uuid where s.company_id=${actor.companyId} and s.run_id=${id} and s.kind='outreach_submit_approval' and s.state='succeeded' and q.state='approved' and q.written_back_at is not null`;if(run.state!=='awaiting_approval'||!done.length)throw Error('INVALID_TRANSITION');
 await tx`update trade_business.agent_runs set state='succeeded',finished_at=now() where company_id=${actor.companyId} and id=${id}`;
 }else if(kind==='run_requeue'){
 const eligible=await tx`select id from trade_business.agent_runs where company_id=${actor.companyId} and id=${id} and (state='failed' or (state in ('running','reserved') and lease_until<=now()))`;if(!eligible.length)throw Error('INVALID_TRANSITION');
 await tx`update trade_business.agent_runs set state='queued',lease_owner=null,lease_until=null where company_id=${actor.companyId} and id=${id}`;
 }else{
 const lease=await tx`select id from trade_business.agent_runs where company_id=${actor.companyId} and id=${id} and state='running' and lease_owner=${p.owner} and lease_until>now()`;if(!lease.length)throw Error('LEASE_CONFLICT');
 const prior=await tx`select * from trade_business.agent_steps where company_id=${actor.companyId} and run_id=${id} order by seq`;
 const step=assertReadyStep(run.steps_graph,prior,p.seq,p.step_key);
 await assertAgentWrite(actor,step.role_code,step.action,tx);
 const leadId=prior.find(s=>s.kind==='leads_upsert'&&s.state==='succeeded')?.evidence.id;
 const draftId=prior.find(s=>s.kind==='outreach_draft_email'&&s.state==='succeeded')?.evidence.id;
 let valid;
 if(step.action==='leads_upsert')valid=await tx`select id from trade_business.leads where company_id=${actor.companyId} and id=${p.evidence.id} and email=${run.input.email.toLowerCase()}`;
 else if(step.action==='diligence_save_report')valid=await tx`select id from trade_business.diligence_reports where company_id=${actor.companyId} and id=${p.evidence.id} and lead_id=${leadId}`;
 else if(step.action==='outreach_draft_email')valid=await tx`select id from trade_business.outreach_drafts where company_id=${actor.companyId} and id=${p.evidence.id} and lead_id=${leadId}`;
 else valid=await tx`select id from trade_business.approval_queue where company_id=${actor.companyId} and id=${p.evidence.id} and draft_id=${draftId} and state='pending'`;
 if(!valid.length)throw Error('INVALID_EVIDENCE');
 await tx`insert into trade_business.agent_steps(company_id,run_id,seq,step_key,role_code,kind,state,evidence) values(${actor.companyId},${id},${p.seq},${step.step_key},${step.role_code},${step.action},'succeeded',${JSON.stringify(p.evidence)}::jsonb)`;
 await tx`update trade_business.agent_runs set state=${step.action==='outreach_submit_approval'?'awaiting_approval':'running'},lease_owner=${step.action==='outreach_submit_approval'?null:p.owner},lease_until=${step.action==='outreach_submit_approval'?null:run.lease_until} where company_id=${actor.companyId} and id=${id}`;
 }
 }
 await audit(tx,actor,id,kind);const result:Record<string,string|number>={id};if(version!==undefined)result.version=version;return result;
 });
}

// Human-only: invoked by the session HTTP branch, never orchestration/MCP dispatch.
export async function confirmPlan(actor:BusinessActor,raw:unknown){
 checkAdmin(actor,actor.aal);
 const input=z.object({requestId:uuid,payload:z.object({id:uuid,expectedVersion:z.number().int().positive()}).strict()}).strict().parse(raw);
 return runBusinessCommand(actor,{...input,kind:'plan_confirm'},async tx=>{
 const rows=await tx`update trade_business.agent_plans set state='confirmed',confirmed_by=${actor.id},confirmed_at=now() where company_id=${actor.companyId} and id=${input.payload.id} and state='draft' and version=${input.payload.expectedVersion} returning id`;
 if(!rows.length)throw Error('VERSION_CONFLICT');
 await audit(tx,actor,input.payload.id,'plan_confirm',{human_actor_id:actor.id});return {id:input.payload.id};
 });
}
