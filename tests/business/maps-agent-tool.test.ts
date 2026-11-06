import {expect,it,vi} from 'vitest';
// @ts-expect-error Node MCP entry point has no declaration file.
import {createTools} from '../../scripts/agents/tools.mjs';
const company='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';

it('exposes maps_import to the prospecting role and reuses leads_upsert authority',async()=>{
 const write=vi.fn().mockResolvedValue({id:'batch'});
 const api=createTools({companyId:company,roleCode:'prospecting',read:async()=>({items:[]}),write});
 expect(api.list().filter((tool:any)=>!tool.annotations.readOnlyHint).map((tool:any)=>tool.name)).toEqual(['leads_upsert','maps_import']);
 const result=await api.call('maps_import',{company_id:company,requestId,payload:{country:'Germany',industry:'valves',maxResults:20}});
 expect(result).toEqual({id:'batch'});
 expect(write).toHaveBeenCalledWith('maps_import',{requestId,payload:{country:'Germany',industry:'valves',maxResults:20,enrich:false}},{roleCode:'prospecting'});
 for(const name of ['outreach_send','outreach_approve','outreach_reject','plan_confirm','outreach_writeback']){
  expect(api.list().some((tool:any)=>tool.name===name)).toBe(false);
  await expect(api.call(name,{company_id:company})).rejects.toThrow();
 }
});

it('fails closed when the configured prospecting role is disabled or loses leads_upsert',async()=>{
 for(const role of [{code:'prospecting',enabled:false,allowed_actions:['leads_upsert']},{code:'prospecting',enabled:true,allowed_actions:[]}]){
  const api=createTools({companyId:company,roleCode:'prospecting',read:async()=>({items:[role]}),write:async()=>{throw Error('DISPATCHED');}});
  const listed=await api.listCurrent();
  expect(listed.some((tool:any)=>tool.name==='maps_import')).toBe(false);
  await expect(api.call('maps_import',{company_id:company,requestId,payload:{country:'Germany',industry:'valves'}})).rejects.toThrow('ROLE_ACTION_DENIED');
 }
});

it('does not advertise or dispatch maps_import for other roles',async()=>{
 const write=vi.fn();
 const api=createTools({companyId:company,roleCode:'diligence',read:async()=>({items:[]}),write});
 expect(api.list().some((tool:any)=>tool.name==='maps_import')).toBe(false);
 await expect(api.call('maps_import',{company_id:company,requestId,payload:{country:'Germany',industry:'valves'}})).rejects.toThrow('ROLE_ACTION_DENIED');
 expect(write).not.toHaveBeenCalled();
});
