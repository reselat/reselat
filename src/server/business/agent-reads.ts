// @ts-expect-error Shared read-only graph policy
import {validateStepsGraph,nextReadyStep} from '../../../scripts/agents/step-graph.mjs';
import {buildRunObservation} from './run-observation';
import {z} from 'zod';
import {checkAdmin} from '@/server/auth/employee';
import {readBusiness} from './order-data';
import type {BusinessActor} from './access';

// Company-wide operational summaries are administrator-only.
export async function agentList(actor:BusinessActor,view:'agent-pipelines'|'agent-runs'|'agent-plans'){
 checkAdmin(actor,actor.aal);
 return readBusiness(actor,async db=>({items:view==='agent-plans'?await db`select * from trade_business.agent_plans where company_id=${actor.companyId} order by created_at desc,id limit 100`:view==='agent-pipelines'
 ?await db`select id,name,enabled,steps_graph,created_at from trade_business.agent_pipelines where company_id=${actor.companyId} order by created_at,id limit 100`
 :await db`select id,pipeline_id,plan_id,state,input,lease_owner,lease_until,created_at,started_at,finished_at from trade_business.agent_runs where company_id=${actor.companyId} order by created_at desc,id limit 100`}));
}
export async function aiUsageLedger(actor:BusinessActor,day:string){
 checkAdmin(actor,actor.aal);z.iso.date().parse(day);
 return readBusiness(actor,async db=>{const rows=await db`select state,count(*)::text as calls,coalesce(sum(reserved_usd_micros),0)::text as reserved_usd_micros from trade_business.risk_ai_runs where company_id=${actor.companyId} and day=${day} group by state order by state`;return {day,usage:rows};});
}

export async function runGet(actor:BusinessActor,id:string){
 checkAdmin(actor,actor.aal);z.uuid().parse(id);
 return readBusiness(actor,async db=>{
 const run=(await db`select * from trade_business.agent_runs where company_id=${actor.companyId} and id=${id}`)[0];
 const steps=await db`select * from trade_business.agent_steps where company_id=${actor.companyId} and run_id=${id} order by seq`;
 const graph=run?validateStepsGraph(run.steps_graph):[];
 const ready=run?nextReadyStep(graph,steps):undefined;
 const declarations=graph.map((s:{step_key:string})=>({...s,state:steps.find(done=>done.step_key===s.step_key)?.state??(ready?.step_key===s.step_key?'ready':'blocked')}));
 return {run,steps,declarations,...buildRunObservation(run??{},steps)};
 });
}
