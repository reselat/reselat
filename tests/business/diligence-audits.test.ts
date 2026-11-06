import { freshnessClaims, freshnessEvidence } from '../helpers/diligence-freshness';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const state=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db!)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a}));
import {prospectCommand} from '@/server/business/prospecting';
import {diligenceAuditCommand,diligenceAuditList,humanDiligenceDecision} from '@/server/business/diligence-audits';
const migration='20261105130000_diligence_audits.sql';
beforeEach(async()=>{state.db=await openBusiness([...businessMigrations,'20261104010000_prospecting.sql',migration]);});
afterEach(async()=>{await state.db?.close();});
const command=(kind:string,payload:unknown,actor=admin)=>diligenceAuditCommand(actor,kind,{requestId:crypto.randomUUID(),payload});
const draft={summary:'经营机械',claims:[...freshnessClaims(),{key:'business',value:'机械',sources:[]}]};
async function submit(){
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'buyer@example.test'}});
 return command('diligence_audit_submit',{leadId:lead.id,draft,evidence:freshnessEvidence});
}
it('auto saves exactly once, freezes seats and supports request replay',async()=>{
 const task=await submit();
 await command('diligence_audit_record',{auditId:task.id,review:{seatId:'audit',...draft,blockers:[]}});
 const input={requestId:crypto.randomUUID(),payload:{auditId:task.id}};
 const result=await diligenceAuditCommand(admin,'diligence_audit_fuse',input);
 expect(result.status).toBe('auto_accepted');
 expect(await diligenceAuditCommand(admin,'diligence_audit_fuse',input)).toEqual(result);
 await expect(command('diligence_audit_fuse',{auditId:task.id})).rejects.toThrow('INVALID_TRANSITION');
 await expect(command('diligence_audit_record',{auditId:task.id,review:{seatId:'other',...draft,blockers:[]}})).rejects.toThrow('INVALID_TRANSITION');
 expect((await state.db!.query('select * from trade_business.diligence_reports')).rows).toHaveLength(1);
 expect((await diligenceAuditList(admin)).items[0]).toMatchObject({status:'auto_accepted'});
});
it.each(['accept','reject'])('routes low confidence to authenticated human %s',async decision=>{
 const task=await submit();
 expect((await command('diligence_audit_fuse',{auditId:task.id})).status).toBe('needs_human');
 expect((await state.db!.query('select * from trade_business.diligence_reports')).rows).toHaveLength(0);
 const input={requestId:crypto.randomUUID(),payload:{auditId:task.id,decision,human_actor_id:admin.id}};
 await expect(humanDiligenceDecision(sales,input)).rejects.toThrow();
 await expect(humanDiligenceDecision(admin,{...input,payload:{...input.payload,human_actor_id:crypto.randomUUID()}})).rejects.toThrow();
 const result=await humanDiligenceDecision(admin,input);
 expect(await humanDiligenceDecision(admin,input)).toEqual(result);
 await expect(humanDiligenceDecision(admin,{...input,requestId:crypto.randomUUID()})).rejects.toThrow('INVALID_TRANSITION');
 expect((await state.db!.query('select * from trade_business.diligence_reports')).rows).toHaveLength(decision==='accept'?1:0);
 expect((await diligenceAuditList(admin)).items[0]).toMatchObject({human_actor_id:admin.id,human_decision:decision,status:decision==='accept'?'needs_human':'rejected_by_policy'});
});
it('rejects duplicate seats, foreign-company IDs and unauthorized callers',async()=>{
 const task=await submit();
 const review={seatId:'audit',...draft,blockers:[]};
 await command('diligence_audit_record',{auditId:task.id,review});
 await expect(command('diligence_audit_record',{auditId:task.id,review})).rejects.toThrow('DUPLICATE_SEAT');
 await expect(diligenceAuditList(sales)).rejects.toThrow();
 // A real second company must see an empty list and cannot mutate the first company's task.
 await state.db!.exec('reset role');
 const other=crypto.randomUUID();
 await state.db!.query('insert into trade_business.company_profiles(id) values($1)',[other]);
 await state.db!.exec('set role business_backend');
 expect((await diligenceAuditList({...admin,companyId:other})).items).toHaveLength(0);
 await expect(command('diligence_audit_fuse',{auditId:task.id},{...admin,companyId:other})).rejects.toThrow('NOT_FOUND');
 await expect(command('diligence_audit_submit',{leadId:task.id,draft},{...admin,companyId:other})).rejects.toThrow('NOT_FOUND');
});
it('rolls back report and gate state when later audit write fails',async()=>{
 const task=await submit();
 await command('diligence_audit_record',{auditId:task.id,review:{seatId:'audit',...draft,blockers:[]}});
 await state.db!.exec(`reset role;
 create function trade_business.fail_audit() returns trigger language plpgsql as $$ begin raise exception 'SIMULATED_FAILURE'; end $$;
 create trigger fail_audit before insert on trade_business.audit_events for each row execute function trade_business.fail_audit();
 set role business_backend;`);
 const input={requestId:crypto.randomUUID(),payload:{auditId:task.id}};
 await expect(diligenceAuditCommand(admin,'diligence_audit_fuse',input)).rejects.toThrow('SIMULATED_FAILURE');
 expect((await state.db!.query('select * from trade_business.diligence_reports')).rows).toHaveLength(0);
 expect((await diligenceAuditList(admin)).items[0].fusion).toBeNull();
 await state.db!.exec('reset role; drop trigger fail_audit on trade_business.audit_events; set role business_backend;');
 expect((await diligenceAuditCommand(admin,'diligence_audit_fuse',input)).status).toBe('auto_accepted');
});
it('keeps migration replayable with RLS and no browser-role privileges',async()=>{
 const {readFile}=await import('node:fs/promises');
 await state.db!.exec('reset role; create role anon; create role authenticated;');
 await state.db!.exec(await readFile('scripts/sql/'+migration,'utf8'));
 expect((await state.db!.query("select relrowsecurity from pg_class where oid='trade_business.diligence_audits'::regclass")).rows[0]).toMatchObject({relrowsecurity:true});
 for(const role of ['anon','authenticated']){
  expect((await state.db!.query("select has_table_privilege($1,'trade_business.diligence_audits','SELECT,INSERT,UPDATE,DELETE') as allowed",[role])).rows[0]).toMatchObject({allowed:false});
 }
});

it('persists unknown activity without vetoing an otherwise eligible report',async()=>{
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'buyer@example.test'}});
 const websiteOnly={summary:'官网有更新',claims:[freshnessClaims()[0]]};
 const task=await command('diligence_audit_submit',{leadId:lead.id,draft:websiteOnly,evidence:freshnessEvidence});
 await command('diligence_audit_record',{auditId:task.id,review:{...websiteOnly,seatId:'audit',blockers:[]}});
 expect(await command('diligence_audit_fuse',{auditId:task.id})).toMatchObject({status:'auto_accepted',reportId:expect.any(String)});
 const stored=(await diligenceAuditList(admin)).items[0];
 expect(stored.fusion).toMatchObject({status:'auto_accepted',confidence:'low',activity_tier:'unknown'});
 expect(stored.fusion.summary).toContain('活跃度未知，建议人工补证');
 expect(stored.draft.claims[0].observed_at).toBe(websiteOnly.claims[0].observed_at);
 expect((await state.db!.query('select * from trade_business.diligence_reports')).rows).toHaveLength(1);
});
