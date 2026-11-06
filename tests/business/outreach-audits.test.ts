import { freshnessClaims, freshnessEvidence } from '../helpers/diligence-freshness';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const state=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db!)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a}));
import {prospectCommand,humanApprovalCommand} from '@/server/business/prospecting';
import {diligenceAuditCommand,humanDiligenceDecision} from '@/server/business/diligence-audits';
import {outreachAuditCommand,outreachAuditList} from '@/server/business/outreach-audits';
const migration='20261105140000_outreach_audits.sql';
beforeEach(async()=>{state.db=await openBusiness([...businessMigrations,'20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261104012000_outreach_writeback.sql','20261105160000_outreach_send.sql','20261105130000_diligence_audits.sql',migration,'20261105160000_followup_redraft.sql']);});
afterEach(async()=>{await state.db?.close();});
const draft={subject:'合作交流',body:'了解到贵司经营机械，期待交流需求。'};
const command=(kind:string,payload:unknown,actor=admin)=>outreachAuditCommand(actor,kind,{requestId:crypto.randomUUID(),payload});
async function acceptReport(leadId:unknown,summary='经营机械'){
 const task=await diligenceAuditCommand(admin,'diligence_audit_submit',{requestId:crypto.randomUUID(),payload:{leadId,draft:{summary,claims:[{key:'business',value:summary,sources:[]}]}}});
 await diligenceAuditCommand(admin,'diligence_audit_fuse',{requestId:crypto.randomUUID(),payload:{auditId:task.id}});
 return humanDiligenceDecision(admin,{requestId:crypto.randomUUID(),payload:{auditId:task.id,decision:'accept',human_actor_id:admin.id}});
}
async function setup(report=true){
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'buyer@example.test'}});
 if(report)await acceptReport(lead.id);
 return lead.id;
}
async function reviewed(){
 const leadId=await setup();
 const task=await command('outreach_audit_submit',{leadId,draft});
 await command('outreach_audit_record',{auditId:task.id,review:{seatId:'audit',...draft,blockers:[]}});
 return {leadId,task};
}
it('auto approves and writes back atomically with policy audit and replay',async()=>{
 const {task}=await reviewed();
 const input={requestId:crypto.randomUUID(),payload:{auditId:task.id}};
 const result=await outreachAuditCommand(admin,'outreach_audit_fuse',input);
 expect(result.status).toBe('auto_approved');
 expect(await outreachAuditCommand(admin,'outreach_audit_fuse',input)).toEqual(result);
 const drafts=(await state.db!.query<{state:string;written_back_at:unknown}>('select * from trade_business.outreach_drafts')).rows;
 expect(drafts).toHaveLength(1);
 expect(drafts[0]).toMatchObject({state:'approved'});
 expect(drafts[0].written_back_at).toBeTruthy();
 expect((await state.db!.query('select * from trade_business.followups')).rows).toHaveLength(1);
 const queue=(await state.db!.query<{id:string;state:string}>('select * from trade_business.approval_queue')).rows;
 expect(queue[0]).toMatchObject({state:'approved',human_actor_id:null,approval_gate:'auto'});
 const events=(await state.db!.query<{details:Record<string,unknown>}>("select details from trade_business.audit_events where action='outreach_approve'")).rows;
 expect(events[0].details).toMatchObject({gate:'auto',actor:'system-policy'});
 await expect(command('outreach_audit_fuse',{auditId:task.id})).rejects.toThrow('INVALID_TRANSITION');
});
it('routes no auditor to existing human queue and allows only admin decision',async()=>{
 const leadId=await setup();
 const task=await command('outreach_audit_submit',{leadId,draft});
 const result=await command('outreach_audit_fuse',{auditId:task.id});
 expect(result.status).toBe('needs_human');
 const queue=(await state.db!.query<{id:string;state:string}>('select * from trade_business.approval_queue')).rows[0];
 expect(queue.state).toBe('pending');
 const input={requestId:crypto.randomUUID(),payload:{approvalId:queue.id,human_actor_id:admin.id}};
 await expect(humanApprovalCommand(sales,'outreach_approve',input)).rejects.toThrow();
 await humanApprovalCommand(admin,'outreach_approve',input);
 expect((await state.db!.query<{state:string}>('select state from trade_business.outreach_drafts')).rows[0].state).toBe('approved');
});
it('rejects missing report and downgrades a stale report snapshot',async()=>{
 const leadId=await setup(false);
 await expect(command('outreach_audit_submit',{leadId,draft})).rejects.toThrow('DILIGENCE_REQUIRED');
 await acceptReport(leadId);
 const task=await command('outreach_audit_submit',{leadId,draft});
 await command('outreach_audit_record',{auditId:task.id,review:{seatId:'audit',...draft,blockers:[]}});
 await acceptReport(leadId,'新的背调');
 expect((await command('outreach_audit_fuse',{auditId:task.id})).status).toBe('needs_human');
 expect((await state.db!.query('select * from trade_business.business_records')).rows).toHaveLength(0);
});
it('rejects duplicate seats, non-admin and cross-company tasks',async()=>{
 const {task}=await reviewed();
 await expect(command('outreach_audit_record',{auditId:task.id,review:{seatId:'audit',...draft,blockers:[]}})).rejects.toThrow('DUPLICATE_SEAT');
 await expect(outreachAuditList(sales)).rejects.toThrow();
 await state.db!.exec('reset role');
 const other=crypto.randomUUID();
 await state.db!.query('insert into trade_business.company_profiles(id) values($1)',[other]);
 await state.db!.exec('set role business_backend');
 expect((await outreachAuditList({...admin,companyId:other})).items).toHaveLength(0);
 await expect(command('outreach_audit_fuse',{auditId:task.id},{...admin,companyId:other})).rejects.toThrow('NOT_FOUND');
});
it('rolls back auto approval and writeback on failure then retries safely',async()=>{
 const {task}=await reviewed();
 await state.db!.exec(`reset role;
 create function trade_business.fail_writeback() returns trigger language plpgsql as $$ begin if new.action='outreach_writeback' then raise exception 'SIMULATED_FAILURE'; end if; return new; end $$;
 create trigger fail_writeback before insert on trade_business.audit_events for each row execute function trade_business.fail_writeback();
 set role business_backend;`);
 const input={requestId:crypto.randomUUID(),payload:{auditId:task.id}};
 await expect(outreachAuditCommand(admin,'outreach_audit_fuse',input)).rejects.toThrow('SIMULATED_FAILURE');
 expect((await state.db!.query<{state:string;written_back_at:unknown}>('select * from trade_business.outreach_drafts')).rows).toHaveLength(0);
 expect((await state.db!.query('select * from trade_business.business_records')).rows).toHaveLength(0);
 expect((await outreachAuditList(admin)).items[0].fusion).toBeNull();
 await state.db!.exec('reset role; drop trigger fail_writeback on trade_business.audit_events; set role business_backend;');
 expect((await outreachAuditCommand(admin,'outreach_audit_fuse',input)).status).toBe('auto_approved');
});
it('requires accepted provenance and supports auto-accepted diligence',async()=>{
 const leadId=await setup(false);
 await prospectCommand(admin,'diligence_save_report',{requestId:crypto.randomUUID(),payload:{leadId,summary:'未经互审'}});
 await expect(command('outreach_audit_submit',{leadId,draft})).rejects.toThrow('DILIGENCE_REQUIRED');
 const diligenceDraft={summary:'经营机械',claims:[...freshnessClaims(),{key:'business',value:'经营机械',sources:[]}]};
 const task=await diligenceAuditCommand(admin,'diligence_audit_submit',{requestId:crypto.randomUUID(),payload:{leadId,draft:diligenceDraft,evidence:freshnessEvidence}});
 await diligenceAuditCommand(admin,'diligence_audit_record',{requestId:crypto.randomUUID(),payload:{auditId:task.id,review:{seatId:'audit',...diligenceDraft,blockers:[]}}});
 const accepted=await diligenceAuditCommand(admin,'diligence_audit_fuse',{requestId:crypto.randomUUID(),payload:{auditId:task.id}});
 const outreach=await command('outreach_audit_submit',{leadId});
 expect(outreach.reportId).toBe(accepted.reportId);
 expect((await outreachAuditList(admin)).items[0].draft.body).toContain('经营机械');
});
it.each(['unsupported','disagreement','blocker'])('keeps %s drafts in human queue',async mode=>{
 const leadId=await setup();
 const submitted=mode==='unsupported'?{...draft,body:'独家代理'}:draft;
 const task=await command('outreach_audit_submit',{leadId,draft:submitted});
 await command('outreach_audit_record',{auditId:task.id,review:{seatId:'audit',...submitted,...(mode==='disagreement'?{body:'不同意见'}:{}),blockers:mode==='blocker'?['需要核查']:[]}});
 expect((await command('outreach_audit_fuse',{auditId:task.id})).status).toBe('needs_human');
 expect((await state.db!.query<{state:string}>('select state from trade_business.approval_queue')).rows[0].state).toBe('pending');
 expect((await state.db!.query('select * from trade_business.followups')).rows).toHaveLength(0);
});
it('replays the migration and denies browser table grants',async()=>{
 const {readFile}=await import('node:fs/promises');
 await state.db!.exec('reset role; create role anon; create role authenticated;');
 await state.db!.exec(await readFile('scripts/sql/'+migration,'utf8'));
 expect((await state.db!.query<{relrowsecurity:boolean}>("select relrowsecurity from pg_class where oid='trade_business.outreach_audits'::regclass")).rows[0].relrowsecurity).toBe(true);
 for(const role of ['anon','authenticated'])expect((await state.db!.query<{allowed:boolean}>("select has_table_privilege($1,'trade_business.outreach_audits','SELECT,INSERT,UPDATE,DELETE') as allowed",[role])).rows[0].allowed).toBe(false);
});
it('writes the accepted summary even when a newer unaccepted report exists',async()=>{
 const {task,leadId}=await reviewed();
 await prospectCommand(admin,'diligence_save_report',{requestId:crypto.randomUUID(),payload:{leadId,summary:'未经接受的新摘要'}});
 expect((await command('outreach_audit_fuse',{auditId:task.id})).status).toBe('auto_approved');
 const notes=(await state.db!.query<{note:string}>('select note from trade_business.followups')).rows;
 const bound=(await outreachAuditList(admin)).items[0];
 expect(notes[0].note).toContain(`背调摘要：${bound.report_summary}`);
 expect(notes[0].note).not.toContain('未经接受');
});

it('redrafts due writeback into human queue once and enforces customer cap',async()=>{
 const {scanDueFollowups,followupRedraftSummary}=await import('@/server/business/followup-redraft');
 const {task}=await reviewed();
 await command('outreach_audit_fuse',{auditId:task.id});
 const scan=()=>scanDueFollowups(admin,{requestId:crypto.randomUUID(),payload:{today:'2099-01-01'}});
 expect(await scan()).toMatchObject({processed:1});
 expect((await followupRedraftSummary(admin)).drafts).toHaveLength(1);
 expect(await scan()).toMatchObject({processed:0,skipped:1});
 const drafts=(await state.db!.query("select * from trade_business.outreach_drafts where followup_id is not null")).rows;
 expect(drafts).toHaveLength(1);
 expect(drafts[0]).toMatchObject({state:'pending',followup_round:1});
 for(let i=0;i<2;i++){
 await state.db!.query("insert into trade_business.followups(id,company_id,customer_id,actor_id,day,note,next_day,created_at) select gen_random_uuid(),company_id,customer_id,actor_id,day,'next',next_day,created_at+interval '1 day' from trade_business.followups order by created_at desc limit 1");
 expect(await scan()).toMatchObject(i===0?{processed:1}:{processed:0,skipped:1});
 }
 expect((await state.db!.query("select * from trade_business.outreach_drafts where followup_id is not null")).rows).toHaveLength(2);
});
