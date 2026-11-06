import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const state=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db!)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a}));
import {roleUpsert,agentRoles,assertAgentWrite} from '@/server/business/agent-roles';
import {prospectCommand} from '@/server/business/prospecting';
beforeEach(async()=>{state.db=await openBusiness([...businessMigrations,'20261104000000_agent_foundation.sql','20261104010000_prospecting.sql','20261105100000_agent_roles.sql']);});
afterEach(async()=>{await state.db?.close();});
const payload=()=>({id:crypto.randomUUID(),code:'prospecting',displayName:'获客配置',systemPrompt:'仅处理本公司；需人工审批；不发送',allowedActions:['leads_upsert'],enabled:true});
it('saves, versions, audits and isolates company roles with idempotency',async()=>{
 const p=payload(),input={requestId:crypto.randomUUID(),payload:p};
 const result=await roleUpsert(admin,input);expect(await roleUpsert(admin,input)).toEqual(result);
 expect((await agentRoles(admin)).items.find((r:any)=>r.code==='prospecting')).toMatchObject({id:p.id,version:1});
 await roleUpsert(admin,{requestId:crypto.randomUUID(),payload:{...p,enabled:false}});
 expect((await agentRoles(admin)).items.find((r:any)=>r.code==='prospecting')).toMatchObject({version:2,enabled:false});
 await expect(assertAgentWrite(admin,'prospecting','leads_upsert')).rejects.toThrow('ROLE_ACTION_DENIED');
 const other=crypto.randomUUID();await state.db!.exec('reset role');await state.db!.query('insert into trade_business.company_profiles(id) values($1)',[other]);await state.db!.exec('set role business_backend');
 await assertAgentWrite({...admin,companyId:other},'prospecting','leads_upsert');
 await expect(roleUpsert(sales,input)).rejects.toThrow();
 expect((await state.db!.query("select count(*)::int as n from trade_business.audit_events where action='role_upsert'")).rows[0]).toEqual({n:2});
});
it('rejects forbidden and other-role actions, unknown/missing role, and disabled writes',async()=>{
 for(const action of ['plan_confirm','outreach_approve','outreach_reject','outreach_send','run_claim','role_upsert','diligence_save_report'])await expect(roleUpsert(admin,{requestId:crypto.randomUUID(),payload:{...payload(),allowedActions:[action]}})).rejects.toThrow();
 await expect(assertAgentWrite(admin,undefined,'leads_upsert')).rejects.toThrow();
 await expect(assertAgentWrite(admin,'diligence','leads_upsert')).rejects.toThrow();
 await roleUpsert(admin,{requestId:crypto.randomUUID(),payload:{...payload(),allowedActions:[]}});
 await expect(prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'a@b.com'}},'prospecting')).rejects.toThrow('ROLE_ACTION_DENIED');
 expect((await state.db!.query('select count(*)::int as n from trade_business.leads')).rows[0]).toEqual({n:0});
});
it('database rejects unsafe actions independently and has backend-only RLS',async()=>{
 await expect(state.db!.query("insert into trade_business.agent_roles(company_id,id,code,display_name,system_prompt,allowed_actions) values($1,$2,'prospecting','X','X',array['outreach_approve'])",[admin.companyId,crypto.randomUUID()])).rejects.toThrow();
 expect((await state.db!.query("select relrowsecurity from pg_class where oid='trade_business.agent_roles'::regclass")).rows[0]).toEqual({relrowsecurity:true});
});
