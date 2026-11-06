import {z} from 'zod';
import {roleActions} from './roles.mjs';
export const defaultSteps=[
 {step_key:'prospect',seq:0,role_code:'prospecting',action:'leads_upsert',depends_on:[]},
 {step_key:'diligence',seq:1,role_code:'diligence',action:'diligence_save_report',depends_on:['prospect']},
 {step_key:'outreach_draft',seq:2,role_code:'outreach_draft',action:'outreach_draft_email',depends_on:['diligence']},
 {step_key:'outreach_submit',seq:3,role_code:'outreach_draft',action:'outreach_submit_approval',depends_on:['outreach_draft']},
];
const key=z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const schema=z.array(z.object({step_key:key,seq:z.number().int().min(0).max(3),role_code:z.enum(['prospecting','diligence','outreach_draft']),action:z.string(),depends_on:z.array(key).max(4)}).strict()).length(4);
export function validateStepsGraph(raw){
 const graph=schema.parse(raw),byKey=new Map(graph.map(s=>[s.step_key,s]));
 if(byKey.size!==4||new Set(graph.map(s=>s.seq)).size!==4||new Set(graph.map(s=>s.action)).size!==4)throw Error('INVALID_STEPS_GRAPH');
 for(const s of graph)if(!roleActions[s.role_code].includes(s.action)||new Set(s.depends_on).size!==s.depends_on.length||s.depends_on.some(k=>!byKey.has(k)))throw Error('INVALID_STEPS_GRAPH');
 const ancestors=(k,path=new Set())=>{
 if(path.has(k))throw Error('INVALID_STEPS_GRAPH');
 const seen=new Set(),next=new Set([...path,k]);
 for(const dep of byKey.get(k).depends_on){seen.add(dep);for(const a of ancestors(dep,next))seen.add(a);}
 return seen;
 };
 const byAction=action=>graph.find(s=>s.action===action);
 for(const s of graph)ancestors(s.step_key);
 const lead=byAction('leads_upsert'),draft=byAction('outreach_draft_email'),submit=byAction('outreach_submit_approval');
 for(const action of ['diligence_save_report','outreach_draft_email'])if(!ancestors(byAction(action).step_key).has(lead.step_key))throw Error('INVALID_STEPS_GRAPH');
 if(!ancestors(submit.step_key).has(draft.step_key)||ancestors(submit.step_key).size!==3)throw Error('INVALID_STEPS_GRAPH');
 return graph.sort((a,b)=>a.seq-b.seq);
}
export function nextReadyStep(raw,steps){
 const graph=validateStepsGraph(raw),done=new Set(steps.filter(s=>s.state==='succeeded').map(s=>s.step_key));
 return graph.find(s=>!done.has(s.step_key)&&s.depends_on.every(k=>done.has(k)));
}
export function assertReadyStep(raw,steps,seq,stepKey){
 const graph=validateStepsGraph(raw),step=graph.find(s=>s.seq===seq);
 if(!step||(stepKey!==undefined&&step.step_key!==stepKey)||steps.some(s=>s.step_key===step.step_key))throw Error('INVALID_TRANSITION');
 if(!step.depends_on.every(k=>steps.some(s=>s.step_key===k&&s.state==='succeeded')))throw Error('DEPENDENCY_NOT_READY');
 if(nextReadyStep(graph,steps)?.step_key!==step.step_key)throw Error('INVALID_TRANSITION');
 return step;
}
