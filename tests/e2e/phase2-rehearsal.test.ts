// @ts-expect-error Shared Node graph declarations
import {defaultSteps} from '../../scripts/agents/step-graph.mjs';
import {readFileSync,mkdtempSync,writeFileSync,unlinkSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {it,expect,vi} from 'vitest';
import {tagged,admin,companyId} from '../helpers/business-db';
const state=vi.hoisted(()=>({db:undefined as any}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a}));
// @ts-expect-error Node rehearsal module
import {migrate} from '../../scripts/rehearsal/migrate.mjs';
// @ts-expect-error Node host module
import {createTick} from '../../scripts/agents/tick.mjs';
import {orchestrationCommand,confirmPlan} from '@/server/business/orchestration';
import {prospectCommand,humanApprovalCommand} from '@/server/business/prospecting';
import {agentRoles,assertAgentWrite} from '@/server/business/agent-roles';
import {outreachWriteback} from '@/server/business/outreach-writeback';
it.each([false,true])('local Host handles declaration order (reordered=%s), replay and human gate',async(reordered)=>{
 const db=state.db=await migrate();
 try{
 await db.query('insert into trade_business.company_profiles(id) values($1)',[companyId]);await db.exec('set role business_backend');
 const calls:string[]=[];
 const write=async(kind:string,input:any,context?:{roleCode:string})=>{if(context)await assertAgentWrite(admin,context.roleCode,kind);calls.push(kind);return (kind.startsWith('plan_')||kind.startsWith('run_')||kind.startsWith('pipeline_')?orchestrationCommand:prospectCommand)(admin,kind,input);};
 const call=(kind:string,payload:any)=>write(kind,{requestId:crypto.randomUUID(),payload});
 const pipelineId=crypto.randomUUID();await call('pipeline_upsert',{id:pipelineId,name:'Rehearsal',enabled:true});
 const planId=crypto.randomUUID();await call('plan_upsert',{id:planId,pipelineId,input:{name:'Test',email:'buyer@example.test',subject:'Draft',body:'Review'},steps:'线索、尽调、草稿、人工审批'});
 await expect(call('run_enqueue',{pipelineId,planId})).rejects.toThrow();
 await confirmPlan(admin,{requestId:crypto.randomUUID(),payload:{id:planId,expectedVersion:1}});
 if(reordered){
 const graph=structuredClone(defaultSteps);graph[0].seq=3;graph[1].seq=0;graph[2].seq=1;graph[3].seq=2;
 graph[2].depends_on=['prospect'];graph[3].depends_on=['diligence','outreach_draft'];
 await call('pipeline_upsert',{id:pipelineId,name:'DAG',enabled:true,stepsGraph:graph});
 }
 const {id}=await call('run_enqueue',{pipelineId,planId});
 // Editing the pipeline must not change the run snapshot.
 await call('pipeline_upsert',{id:pipelineId,name:'Changed',enabled:true,stepsGraph:defaultSteps});
 const read=async(p:URLSearchParams)=>p.get('view')==='agent-roles'?agentRoles(admin):p.get('view')==='agent-runs'?{items:(await db.query('select * from trade_business.agent_runs')).rows}:{run:(await db.query('select * from trade_business.agent_runs where id=$1',[p.get('id')])).rows[0],steps:(await db.query('select * from trade_business.agent_steps where run_id=$1 order by seq',[p.get('id')])).rows};
 const dir=mkdtempSync(join(tmpdir(),'agent-stop-'));
 const stop=join(dir,'stop');
 try{
 vi.stubEnv('AGENT_STOP_FILE',stop);vi.stubEnv('AGENT_STOP','1');
 await createTick({read,write})();expect(calls).not.toContain('run_claim');
 vi.stubEnv('AGENT_STOP','0');writeFileSync(stop,'stop');
 await createTick({read,write})();expect(calls).not.toContain('run_claim');expect(calls).not.toContain('pipeline_advance');
 unlinkSync(stop);
 }finally{rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();}
 // Crash after every business commit, before advance; replay under a new owner.
 const committed=new Map<string,unknown>();
 const crashWrite=async(kind:string,input:any,context?:{roleCode:string})=>{
 if(kind==='pipeline_advance')throw Error('simulated crash');
 const result=await write(kind,input,context);
 if(!kind.startsWith('run_')){if(committed.has(input.requestId))expect(result).toEqual(committed.get(input.requestId));else committed.set(input.requestId,result);}
 return result;
 };
 for(let step=0;step<4;step++){
 await expect(createTick({read,write:crashWrite,owner:crypto.randomUUID()})()).rejects.toThrow('simulated crash');
 await db.query("update trade_business.agent_runs set lease_until=now()-interval '1 second' where id=$1",[id]);
 await call('run_requeue',{id});
 const replay=async(kind:string,input:any,context?:{roleCode:string})=>{
 const result=await write(kind,input,context);
 if(committed.has(input.requestId))expect(result).toEqual(committed.get(input.requestId));
 if(kind==='pipeline_advance')throw Error('stop after advance');
 return result;
 };
 await expect(createTick({read,write:replay,owner:crypto.randomUUID()})()).rejects.toThrow('stop after advance');
 if(step<3){await db.query("update trade_business.agent_runs set lease_until=now()-interval '1 second' where id=$1",[id]);await call('run_requeue',{id});}
 }
 for(const table of ['leads','diligence_reports','outreach_drafts','approval_queue'])expect((await db.query(`select count(*)::int as n from trade_business.${table}`)).rows[0].n).toBe(1);
 await createTick({read,write})();expect((await db.query('select state from trade_business.agent_runs where id=$1',[id])).rows[0].state).toBe('awaiting_approval');
 await expect(call('run_resume',{id})).rejects.toThrow();
 const approvalId=(await db.query('select id from trade_business.approval_queue')).rows[0].id;
 await humanApprovalCommand(admin,'outreach_approve',{requestId:crypto.randomUUID(),payload:{approvalId,human_actor_id:admin.id}});
 await outreachWriteback(admin,{requestId:crypto.randomUUID(),payload:{approvalId}});await call('run_resume',{id});
 expect((await db.query('select state from trade_business.agent_runs where id=$1',[id])).rows[0].state).toBe('succeeded');
 expect(calls.some(k=>/smtp|outreach_send|outreach_approve/.test(k))).toBe(false);
 }finally{await db.close();}
},30000);

// Executing the handbook catches dependency order / constraint-name mistakes.
it('handbook rollback removes the complete phase2 schema and permits a fresh forward migration',async()=>{
 const db=await migrate();
 try{
 const handbook=readFileSync('docs/development/二期-生产上线手册.md','utf8');
 const sql=handbook.split('```sql')[2].split('```')[0];
 expect(sql).not.toMatch(/\bCASCADE\b/i);
 await db.exec(sql);
 const remaining=await db.query("select tablename from pg_tables where schemaname='trade_business' and tablename in ('agent_plans','agent_roles','agent_steps','agent_runs','agent_pipelines','leads','diligence_reports','diligence_audits','outreach_audits','outreach_drafts','approval_queue')");
 expect(remaining.rows).toEqual([]);
 for(const file of ['20261104000000_agent_foundation.sql','20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261104012000_outreach_writeback.sql','20261105160000_outreach_send.sql','20261104013000_agent_orchestration.sql','20261105090000_agent_plans.sql','20261105100000_agent_roles.sql','20261105120000_agent_step_deps.sql','20261105130000_diligence_audits.sql','20261105140000_outreach_audits.sql','20261105170000_leads_maps.sql'])await db.exec(readFileSync('scripts/sql/'+file,'utf8'));
 const checks=await db.query("select pg_get_constraintdef(oid) as definition from pg_constraint where connamespace='trade_business'::regnamespace and conrelid in ('trade_business.agent_plans'::regclass,'trade_business.agent_roles'::regclass,'trade_business.agent_runs'::regclass)");
 const definitions=checks.rows.map((r:any)=>r.definition).join('\n');
 expect(definitions).toContain('FOREIGN KEY (company_id, plan_id)');
 expect(definitions).toContain('confirmed_by IS NOT NULL');
 expect(definitions).toContain('allowed_actions <@');
 const policies=await db.query("select tablename, roles from pg_policies where schemaname='trade_business' and tablename in ('agent_plans','agent_roles')");
 expect(policies.rows).toHaveLength(2);
 for(const row of policies.rows)expect(row.roles).toEqual(['business_backend']);
 for(const table of ['agent_plans','agent_roles']){
 const grant=await db.query("select has_table_privilege('business_backend',$1,'SELECT') as read,has_table_privilege('business_backend',$1,'INSERT') as insert,has_table_privilege('business_backend',$1,'UPDATE') as update,has_table_privilege('business_backend',$1,'DELETE') as delete",['trade_business.'+table]);
 expect(grant.rows[0]).toEqual({read:true,insert:true,update:true,delete:false});
 }
 const columns=await db.query("select column_name from information_schema.columns where table_schema='trade_business' and table_name='agent_runs'");
 expect(columns.rows.map((r:any)=>r.column_name)).toEqual(expect.arrayContaining(['plan_id','steps_graph']));
 const indexes=await db.query("select indexname from pg_indexes where schemaname='trade_business' and tablename='agent_steps'");
 expect(indexes.rows.map((r:any)=>r.indexname)).toContain('agent_steps_run_key');
 }finally{await db.close();}
},30000);
