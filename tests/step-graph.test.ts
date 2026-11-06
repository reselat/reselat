import {it,expect} from 'vitest';
// @ts-expect-error Shared Node graph policy
import {defaultSteps,validateStepsGraph,nextReadyStep,assertReadyStep} from '../scripts/agents/step-graph.mjs';
it('declares role handoffs and selects only succeeded dependencies',()=>{
 const graph=validateStepsGraph(defaultSteps);
 expect(nextReadyStep(graph,[]).step_key).toBe('prospect');
 expect(()=>assertReadyStep(graph,[],1,'diligence')).toThrow('DEPENDENCY_NOT_READY');
 expect(()=>assertReadyStep(graph,[],0,'wrong')).toThrow('INVALID_TRANSITION');
 expect(nextReadyStep(graph,[{step_key:'prospect',state:'failed'}]).step_key).toBe('prospect');
 expect(nextReadyStep(graph,[{step_key:'prospect',state:'succeeded'}]).step_key).toBe('diligence');
});
it('rejects cycles, missing refs, duplicate keys and role or forbidden actions',()=>{
 for(const mutate of [
 (g:any[])=>{g[0].depends_on=['outreach_submit'];},
 (g:any[])=>{g[1].depends_on=['missing'];},
 (g:any[])=>{g[1].step_key='prospect';},
 (g:any[])=>{g[0].role_code='diligence';},
 ...['plan_confirm','run_claim','pipeline_advance','run_resume','outreach_approve','outreach_reject','outreach_send'].map(action=>(g:any[])=>{g[0].action=action;}),
 ]){const g=structuredClone(defaultSteps);mutate(g);expect(()=>validateStepsGraph(g)).toThrow();}
});
