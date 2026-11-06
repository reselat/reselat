import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const state=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db!)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a}));
import {prospectCommand} from '@/server/business/prospecting';
beforeEach(async()=>{state.db=await openBusiness([...businessMigrations,'20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261104012000_outreach_writeback.sql','20261105160000_outreach_send.sql','20261104000000_agent_foundation.sql','20261104013000_agent_orchestration.sql','20261105090000_agent_plans.sql','20261105100000_agent_roles.sql','20261105120000_agent_step_deps.sql']);});
afterEach(async()=>{await state.db?.close();});

import {runGet} from '@/server/business/agent-reads';
import {confirmPlan,orchestrationCommand as command} from '@/server/business/orchestration';
it('claims, advances to human gate, cancels and recovers expired leases',async()=>{
 const call=(kind:string,payload:object)=>command(admin,kind,{requestId:crypto.randomUUID(),payload});
 const pipelineId=crypto.randomUUID(),owner=crypto.randomUUID();
 await call('pipeline_upsert',{id:pipelineId,name:'Test',enabled:true});
 const input={name:'Buyer',email:'test@example.com',subject:'Hello',body:'Draft'};
 const planId=crypto.randomUUID();
 await call('plan_upsert',{id:planId,pipelineId,input,steps:'建线索 → 尽调 → 草稿 → 人工审批'});
 await expect(call('run_enqueue',{pipelineId,planId})).rejects.toThrow('REVIEW_REQUIRED');
 await confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id:planId,expectedVersion:1}});
 const {id}=await call('run_enqueue',{pipelineId,planId});
 await expect(call('plan_upsert',{id:planId,pipelineId,input,steps:'Changed'})).rejects.toThrow('INVALID_TRANSITION');
 await expect(call('run_enqueue',{pipelineId:crypto.randomUUID(),planId})).rejects.toThrow();
 await call('run_claim',{id,owner});
 await expect(call('run_claim',{id,owner:crypto.randomUUID()})).rejects.toThrow('LEASE_CONFLICT');
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:input.name,email:input.email}});
 const report=await prospectCommand(admin,'diligence_save_report',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,summary:'Evidence'}});
 const draft=await prospectCommand(admin,'outreach_draft_email',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,subject:input.subject,body:input.body}});
 const queue=await prospectCommand(admin,'outreach_submit_approval',{requestId:crypto.randomUUID(),payload:{draftId:draft.id}});
 await expect(call('pipeline_advance',{id,owner,seq:1,evidence:report})).rejects.toThrow('DEPENDENCY_NOT_READY');
 await expect(call('pipeline_advance',{id,owner,seq:0,step_key:'wrong',evidence:lead})).rejects.toThrow('INVALID_TRANSITION');
 for(const [seq,evidence] of [lead,report,draft,queue].entries())await call('pipeline_advance',{id,owner,seq,evidence});
 expect((await state.db!.query('select state from trade_business.agent_runs')).rows[0]).toMatchObject({state:'awaiting_approval'});
 const before=(await state.db!.query('select count(*)::int as n from trade_business.audit_events')).rows;
 const detail=await runGet(admin,String(id));
 expect(detail.timeline.map(s=>s.role_code)).toEqual(['prospecting','diligence','outreach_draft','outreach_draft']);
 expect(detail.usage).toMatchObject({source:'placeholder',calls:0,input_tokens:0,estimated_usd_micros:0});
 expect((await state.db!.query('select count(*)::int as n from trade_business.audit_events')).rows).toEqual(before);
 await expect(runGet(sales,String(id))).rejects.toThrow();
 const otherCompany=crypto.randomUUID();
 await state.db!.exec('reset role');await state.db!.query('insert into trade_business.company_profiles(id) values($1)',[otherCompany]);await state.db!.exec('set role business_backend');
 expect(await runGet({...admin,companyId:otherCompany},String(id))).toMatchObject({steps:[],timeline:[]});
 await expect(call('run_resume',{id})).rejects.toThrow('INVALID_TRANSITION');
 await expect(call('pipeline_advance',{id,owner,seq:3,evidence:queue})).rejects.toThrow('LEASE_CONFLICT');
 await call('run_cancel',{id});
 const other=await call('run_enqueue',{pipelineId,planId});await call('run_claim',{id:other.id,owner});
 await state.db!.exec("update trade_business.agent_runs set lease_until=now()-interval '1 second' where state='running'");
 await call('run_requeue',{id:other.id});
 await expect(command({...admin,companyId:crypto.randomUUID()},'run_cancel',{requestId:crypto.randomUUID(),payload:{id:other.id}})).rejects.toThrow();
});

it('rejects enqueue without a confirmed plan',async()=>{
 const requestId=crypto.randomUUID(),pipelineId=crypto.randomUUID();
 await command(admin,'pipeline_upsert',{requestId,payload:{id:pipelineId,name:'Gate',enabled:true}});
 await expect(command(admin,'run_enqueue',{requestId:crypto.randomUUID(),payload:{pipelineId,input:{name:'Buyer',email:'a@b.com',subject:'S',body:'B'}}})).rejects.toThrow();
});

it('blocks legacy claim and advance without plans',async()=>{
 const pipelineId=crypto.randomUUID(),id=crypto.randomUUID();
 await command(admin,'pipeline_upsert',{requestId:crypto.randomUUID(),payload:{id:pipelineId,name:'Legacy',enabled:true}});
 await state.db!.query('insert into trade_business.agent_runs(company_id,id,pipeline_id) values($1,$2,$3)',[admin.companyId,id,pipelineId]);
 for(const kind of ['run_claim','pipeline_advance'])await expect(command(admin,kind,{requestId:crypto.randomUUID(),payload:kind==='run_claim'?{id,owner:crypto.randomUUID()}:{id,owner:crypto.randomUUID(),seq:0,evidence:{id:crypto.randomUUID()}}})).rejects.toThrow('REVIEW_REQUIRED');
});
it('scopes plans by company/pipeline, freezes input, and replays enqueue once',async()=>{
 const call=(kind:string,payload:object,requestId=crypto.randomUUID())=>command(admin,kind,{requestId,payload});
 const pipelineId=crypto.randomUUID(),otherPipeline=crypto.randomUUID(),planId=crypto.randomUUID();
 for(const id of [pipelineId,otherPipeline])await call('pipeline_upsert',{id,name:'Scope',enabled:true});
 const input={name:'Buyer',email:'scope@example.com',subject:'Reviewed',body:'Frozen'};
 await call('plan_upsert',{id:planId,pipelineId,input,steps:'Reviewed steps'});
 await expect(confirmPlan(sales,{requestId:crypto.randomUUID(),payload:{id:planId,expectedVersion:1}})).rejects.toThrow();
 await expect(confirmPlan({...admin,companyId:crypto.randomUUID()},{requestId:crypto.randomUUID(),payload:{id:planId,expectedVersion:1}})).rejects.toThrow();
 await expect(call('plan_confirm',{id:planId})).rejects.toThrow('INVALID_INPUT');
 await confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id:planId,expectedVersion:1}});
 await expect(call('run_enqueue',{pipelineId:otherPipeline,planId})).rejects.toThrow('REVIEW_REQUIRED');
 await expect(call('run_enqueue',{pipelineId,planId,input:{...input,body:'tampered'}})).rejects.toThrow();
 const requestId=crypto.randomUUID(),run=await call('run_enqueue',{pipelineId,planId},requestId);
 expect(await call('run_enqueue',{pipelineId,planId},requestId)).toEqual(run);
 const rows=(await state.db!.query('select input,plan_id from trade_business.agent_runs')).rows;
 expect(rows).toEqual([{input,plan_id:planId}]);
 await state.db!.query("update trade_business.agent_runs set input='{}'::jsonb");
 await expect(call('run_claim',{id:run.id,owner:crypto.randomUUID()})).rejects.toThrow('REVIEW_REQUIRED');
});

it('rejects confirmation of a draft changed since human review',async()=>{
 const pipelineId=crypto.randomUUID(),id=crypto.randomUUID(),call=(kind:string,payload:object)=>command(admin,kind,{requestId:crypto.randomUUID(),payload});
 await call('pipeline_upsert',{id:pipelineId,name:'Version',enabled:true});
 const payload={id,pipelineId,input:{name:'A',email:'a@b.com',subject:'S',body:'B'},steps:'Reviewed'};
 await call('plan_upsert',payload);await call('plan_upsert',{...payload,steps:'Changed by agent'});
 await expect(confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id,expectedVersion:1}})).rejects.toThrow('VERSION_CONFLICT');
});

it('confirms edited review with the upsert version and freezes the edited run input',async()=>{
 const pipelineId=crypto.randomUUID(),id=crypto.randomUUID();
 const call=(kind:string,payload:object)=>command(admin,kind,{requestId:crypto.randomUUID(),payload});
 await call('pipeline_upsert',{id:pipelineId,name:'Editable',enabled:true});
 const input={name:'Buyer',email:'review@example.com',subject:'Before',body:'Draft',summary:'Evidence'};
 await call('plan_upsert',{id,pipelineId,input,steps:'Before'});
 const saved=await call('plan_upsert',{id,pipelineId,input:{...input,subject:'Reviewed'},steps:'Reviewed',expectedVersion:1});
 expect(saved).toMatchObject({id,version:2});
 await expect(call('run_enqueue',{pipelineId,planId:id})).rejects.toThrow('REVIEW_REQUIRED');
 await confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id,expectedVersion:(saved as {version:number}).version}});
 await call('run_enqueue',{pipelineId,planId:id});
 expect((await state.db!.query('select input from trade_business.agent_runs')).rows).toEqual([{input:{...input,subject:'Reviewed'}}]);
});

it('rejects stale edits as well as confirmation after a concurrent revision',async()=>{
 const pipelineId=crypto.randomUUID(),id=crypto.randomUUID();
 const call=(kind:string,payload:object)=>command(admin,kind,{requestId:crypto.randomUUID(),payload});
 await call('pipeline_upsert',{id:pipelineId,name:'Concurrent',enabled:true});
 const payload={id,pipelineId,input:{name:'A',email:'a@b.com',subject:'S',body:'B'},steps:'First'};
 await call('plan_upsert',payload);
 await call('plan_upsert',{...payload,steps:'Concurrent',expectedVersion:1});
 await expect(call('plan_upsert',{...payload,steps:'Stale',expectedVersion:1})).rejects.toThrow('VERSION_CONFLICT');
 await expect(confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id,expectedVersion:1}})).rejects.toThrow('VERSION_CONFLICT');
 expect((await state.db!.query('select steps,version,state from trade_business.agent_plans')).rows).toEqual([{steps:'Concurrent',version:2,state:'draft'}]);
 await call('plan_upsert',{...payload,steps:'Changed after save',expectedVersion:2});
 await expect(confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id,expectedVersion:2}})).rejects.toThrow('VERSION_CONFLICT');
 await expect(call('run_enqueue',{pipelineId,planId:id})).rejects.toThrow('REVIEW_REQUIRED');
});

it('validates pipeline declarations and enforces configured role permissions at advance',async()=>{
 const call=(kind:string,payload:object,requestId=crypto.randomUUID())=>command(admin,kind,{requestId,payload});
 const pipelineId=crypto.randomUUID(),planId=crypto.randomUUID(),owner=crypto.randomUUID();
 await call('pipeline_upsert',{id:pipelineId,name:'Roles',enabled:true});
 const graph=(await state.db!.query<{steps_graph:any[]}>('select steps_graph from trade_business.agent_pipelines')).rows[0].steps_graph;
 for(const change of [(g:any[])=>{g[0].action='outreach_send';},(g:any[])=>{g[0].role_code='unknown';}]){
 const bad=structuredClone(graph);change(bad);
 await expect(call('pipeline_upsert',{id:pipelineId,name:'Invalid',enabled:true,stepsGraph:bad})).rejects.toThrow();
 }
 await call('plan_upsert',{id:planId,pipelineId,input:{name:'Buyer',email:'role@example.test',subject:'S',body:'B'},steps:'Explanation'});
 await confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id:planId,expectedVersion:1}});
 const {id}=await call('run_enqueue',{pipelineId,planId});await call('run_claim',{id,owner});
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'role@example.test'}});
 await state.db!.query("insert into trade_business.agent_roles(company_id,id,code,display_name,system_prompt,allowed_actions,enabled) values($1,$2,'prospecting','Disabled','Stop',array['leads_upsert'],false)",[admin.companyId,crypto.randomUUID()]);
 await expect(call('pipeline_advance',{id,owner,seq:0,evidence:lead})).rejects.toThrow('ROLE_ACTION_DENIED');
 expect((await state.db!.query('select * from trade_business.agent_steps')).rows).toEqual([]);
 await state.db!.query('update trade_business.agent_roles set enabled=true');
 const requestId=crypto.randomUUID(),payload={id,owner,seq:0,step_key:'prospect',evidence:lead};
 const first=await call('pipeline_advance',payload,requestId);
 expect(await call('pipeline_advance',payload,requestId)).toEqual(first);
 await expect(call('pipeline_advance',payload)).rejects.toThrow('INVALID_TRANSITION');
 const detail=await runGet(admin,String(id));
 expect(detail.declarations).toMatchObject([{step_key:'prospect',role_code:'prospecting',state:'succeeded'},{step_key:'diligence',depends_on:['prospect'],state:'ready'},{state:'blocked'},{state:'blocked'}]);
});
