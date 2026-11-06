import {it,expect} from 'vitest';
// @ts-expect-error Node entry point
import {createTools} from '../scripts/agents/tools.mjs';
const id='11111111-1111-4111-8111-111111111111';
it('limits MCP writes to the selected role before dispatch',async()=>{
 const calls:string[]=[];
 const api=createTools({companyId:id,roleCode:'diligence',read:async()=>({items:[]}),write:async(k:string)=>{calls.push(k);return {id};}});
 expect(api.list().filter((t:any)=>!t.annotations.readOnlyHint).map((t:any)=>t.name)).toEqual(['diligence_save_report']);
 await expect(api.call('leads_upsert',{company_id:id,requestId:id,payload:{name:'Buyer',email:'a@b.com'}})).rejects.toThrow('ROLE_ACTION_DENIED');
 expect(calls).toEqual([]);
 await api.call('diligence_save_report',{company_id:id,requestId:id,payload:{leadId:id,summary:'Evidence'}});
 expect(calls).toEqual(['diligence_save_report']);
});
it('fails closed when a configured role is disabled or reduced',async()=>{
 const api=createTools({companyId:id,roleCode:'prospecting',read:async()=>({items:[{code:'prospecting',enabled:false,allowed_actions:['leads_upsert']}]}),write:async()=>{throw Error('DISPATCHED');}});
 await expect(api.call('leads_upsert',{company_id:id,requestId:id,payload:{name:'Buyer',email:'a@b.com'}})).rejects.toThrow('ROLE_ACTION_DENIED');
});
it('advertises current company prompt and removes revoked tools',async()=>{
 const api=createTools({companyId:id,roleCode:'outreach_draft',read:async()=>({items:[{code:'outreach_draft',enabled:true,system_prompt:'本公司草稿助手，需人工审批',allowed_actions:['outreach_draft_email']}]}),write:async()=>({id})});
 const tools=await api.listCurrent();
 expect(tools.filter((t:any)=>!t.annotations.readOnlyHint).map((t:any)=>t.name)).toEqual(['outreach_draft_email']);
 expect(tools.find((t:any)=>t.name==='outreach_draft_email').description).toContain('本公司草稿助手');
});
