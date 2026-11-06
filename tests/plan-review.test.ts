import {it,expect,vi} from 'vitest';
import {submitPlanReview} from '@/modules/business/ui/plan-review-flow';
const snapshot={id:'plan',pipeline_id:'pipeline',version:3,input:{name:'Buyer',email:'a@b.com',subject:'S',body:'B',summary:'Evidence'},steps:'Review'};
it('saves edits before confirming the returned version',async()=>{
 const run=vi.fn().mockResolvedValueOnce({id:'plan',version:4}).mockResolvedValueOnce({id:'plan'});
 const saved=vi.fn();
 await submitPlanReview(snapshot,{...snapshot,input:{...snapshot.input,body:'Edited'}},run,saved);
 expect(run.mock.calls).toEqual([
 ['plan_upsert',{payload:{id:'plan',pipelineId:'pipeline',expectedVersion:3,input:{...snapshot.input,body:'Edited'},steps:'Review'}}],
 ['plan_confirm',{payload:{id:'plan',expectedVersion:4}}]
 ]);
 expect(saved).toHaveBeenCalledWith(expect.objectContaining({version:4}));
});
it('confirms an unchanged snapshot without upsert',async()=>{
 const run=vi.fn().mockResolvedValue({});
 await submitPlanReview(snapshot,snapshot,run,vi.fn());
 expect(run.mock.calls).toEqual([['plan_confirm',{payload:{id:'plan',expectedVersion:3}}]]);
});
it('stops on a failed or uncertain save',async()=>{
 const run=vi.fn().mockResolvedValue(undefined);
 expect(await submitPlanReview(snapshot,{...snapshot,steps:'Edited'},run,vi.fn())).toBeUndefined();
 expect(run).toHaveBeenCalledTimes(1);
});
it('does not confirm when the save response has no valid version',async()=>{
 const run=vi.fn().mockResolvedValue({id:'plan'});
 await expect(submitPlanReview(snapshot,{...snapshot,steps:'Edited'},run,vi.fn())).rejects.toThrow();
 expect(run).toHaveBeenCalledTimes(1);
});
it('stops when confirmation rejects a concurrently revised saved version',async()=>{
 const run=vi.fn().mockResolvedValueOnce({id:'plan',version:4}).mockResolvedValueOnce(undefined);
 const saved=vi.fn();
 expect(await submitPlanReview(snapshot,{...snapshot,steps:'Edited'},run,saved)).toBeUndefined();
 expect(run).toHaveBeenLastCalledWith('plan_confirm',{payload:{id:'plan',expectedVersion:4}});
 expect(saved).toHaveBeenCalledWith(expect.objectContaining({version:4,steps:'Edited'}));
 expect(run).toHaveBeenCalledTimes(2);
});
