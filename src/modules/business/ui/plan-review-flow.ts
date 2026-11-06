import {z} from 'zod';
export const reviewPlan=z.object({id:z.string(),pipeline_id:z.string(),version:z.number().int().positive(),input:z.object({name:z.string(),email:z.string(),subject:z.string(),body:z.string(),summary:z.string().optional()}),steps:z.string()});
export type ReviewPlan=z.infer<typeof reviewPlan>;
type Run=(action:string,input:Record<string,unknown>)=>Promise<unknown>;
// Keep the reviewed version even if the list refreshes while the panel is open.
export async function submitPlanReview(snapshot:ReviewPlan,edited:ReviewPlan,run:Run,onSaved:(plan:ReviewPlan)=>void){
 let current=snapshot;
 if(snapshot.pipeline_id!==edited.pipeline_id||snapshot.steps!==edited.steps||JSON.stringify(snapshot.input)!==JSON.stringify(edited.input)){
  const result=await run('plan_upsert',{payload:{id:snapshot.id,pipelineId:edited.pipeline_id,expectedVersion:snapshot.version,input:edited.input,steps:edited.steps}});
  if(result===undefined)return;
  const {version}=z.object({version:z.number().int().positive()}).parse(result);
  current={...edited,version};onSaved(current);
 }
 return run('plan_confirm',{payload:{id:current.id,expectedVersion:current.version}});
}
