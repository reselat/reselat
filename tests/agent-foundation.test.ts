import {describe,it,expect,vi} from 'vitest';
// @ts-expect-error Independent Node entry point has no declaration file.
import {createTools} from '../scripts/agents/tools.mjs';
// @ts-expect-error Independent Node entry point has no declaration file.
import {createHost} from '../scripts/agents/host.mjs';
const company='11111111-1111-4111-8111-111111111111';
describe('P0 readonly bridge',()=>{
 it('rejects cross-company, arbitrary query and writes before dispatch',async()=>{const read=vi.fn();const api=createTools({companyId:company,read});for(const [name,args] of [['customers_list',{company_id:'22222222-2222-4222-8222-222222222222'}],['customers_list',{company_id:company,sql:'select 1'}],['customer.save',{company_id:company}],['orders_get',{company_id:company,id:'bad'}]])await expect(api.call(name,args)).rejects.toThrow();expect(read).not.toHaveBeenCalled();});
 it('maps customer list to scoped existing GET view',async()=>{const read=vi.fn().mockResolvedValue({items:[]});const api=createTools({companyId:company,read});await api.call('customers_list',{company_id:company});expect(read.mock.calls[0][0].toString()).toBe('view=records&kind=customer');expect(api.list()).toHaveLength(13);});
 it('keeps host idle and lists empty stubs',async()=>{const host=createHost(company);expect(host.heartbeat()).toMatchObject({companyId:company,state:'idle'});expect(await host.listRuns()).toEqual([]);expect(await host.listPipelines()).toEqual([]);});
});

it('P0.1 validates detail and ledger arguments',async()=>{const read=vi.fn().mockResolvedValue({items:[]});const api=createTools({companyId:company,read});await api.call('customers_get',{company_id:company,id:company});await api.call('ai_usage_ledger',{company_id:company,day:'2026-11-04'});for(const name of ['customers_get','ai_usage_ledger'])await expect(api.call(name,{company_id:'22222222-2222-4222-8222-222222222222',id:company})).rejects.toThrow();await expect(api.call('customers_get',{company_id:company,id:'bad'})).rejects.toThrow();await expect(api.call('ai_usage_ledger',{company_id:company,day:'bad'})).rejects.toThrow();});

it('host lists business views',async()=>{const host=createHost(company,async(p:URLSearchParams)=>({items:[{view:p.get('view')}]}));expect(await host.listRuns()).toEqual({items:[{view:'agent-runs'}]});expect(await host.listPipelines()).toEqual({items:[{view:'agent-pipelines'}]});});

it('role-scoped MCP excludes legacy general writes and approval writeback',async()=>{
 const write=vi.fn();const api=createTools({companyId:company,read:vi.fn(),write});
 for(const name of ['customers_save_draft','followup_add','outreach_writeback','outreach_send','outreach_approve','outreach_reject'])await expect(api.call(name,{company_id:company})).rejects.toThrow('UNKNOWN_TOOL');
 expect(write).not.toHaveBeenCalled();
});

it('MCP exposes role reads but never orchestration or human authority',async()=>{
 const read=vi.fn(),write=vi.fn();const api=createTools({companyId:company,read,write});
 const names=api.list().map((t:any)=>t.name);
 for(const name of ['agent_roles_list','pipelines_list','runs_list','run_get'])expect(names).toContain(name);
 for(const name of ['pipeline_upsert','run_enqueue','run_cancel','plan_upsert','role_upsert','plan_confirm','run_claim','pipeline_advance','run_resume','outreach_approve','outreach_reject','outreach_send']){expect(names).not.toContain(name);await expect(api.call(name,{company_id:company})).rejects.toThrow('UNKNOWN_TOOL');}
 expect(names.some((name:string)=>/smtp/i.test(name))).toBe(false);expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
