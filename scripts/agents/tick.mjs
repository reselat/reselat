import {nextReadyStep} from './step-graph.mjs';
import {loadTradeSkills} from './skills.mjs';
import {resolveRole,assertRoleAction} from './roles.mjs';
import {existsSync} from 'node:fs';
export const hostStopped=()=>process.env.AGENT_STOP==='1'||existsSync(process.env.AGENT_STOP_FILE??'.agent-stop');
import {randomUUID,createHash} from 'node:crypto';
const requestId=(id,seq)=>{const h=createHash('sha256').update(`${id}:${seq}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
export function createTick({read,write,owner=randomUUID(),stopped=hostStopped}){
return async function tick(){
 if(stopped())return;
 const {items}=await read(new URLSearchParams({view:'agent-runs'}));
 for(const item of items){
 if(stopped())return;
 if(item.state!=='queued')continue;
 await write('run_claim',{requestId:randomUUID(),payload:{id:item.id,owner}});
 while(!stopped()){
 const {run,steps}=await read(new URLSearchParams({view:'agent-run',id:item.id}));
 if(run.state!=='running'||run.lease_owner!==owner)break;
 const step=nextReadyStep(run.steps_graph,steps);
 if(!step)break;
 const {seq,step_key,role_code:roleCode,action}=step,p=run.input;
 const leadId=steps.find(s=>s.kind==='leads_upsert'&&s.state==='succeeded')?.evidence.id;
 const draftId=steps.find(s=>s.kind==='outreach_draft_email'&&s.state==='succeeded')?.evidence.id;
 const payloads={leads_upsert:{name:p.name,email:p.email},diligence_save_report:{leadId,summary:p.summary??'未提供尽调摘要；需人工核查'},outreach_draft_email:{leadId,subject:p.subject,body:p.body},outreach_submit_approval:{draftId}};
 const payload=payloads[action];
 const {items:roles}=await read(new URLSearchParams({view:'agent-roles'}));
 loadTradeSkills(roleCode); // Validate/load repository instructions; deterministic Host has no model executor.
 assertRoleAction(resolveRole(roles,roleCode),action);
 if(stopped())return;
 const result=await write(action,{requestId:requestId(item.id,seq),payload},{roleCode});
 if(stopped())return;
 await write('pipeline_advance',{requestId:randomUUID(),payload:{id:item.id,owner,seq,step_key,evidence:{id:result.value?.id??result.id}}});
 }
 }
}
}
