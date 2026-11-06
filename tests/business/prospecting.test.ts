import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const state=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>tagged(state.db!)}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a}));
import {prospectList,prospectCommand,approvalList} from '@/server/business/prospecting';
beforeEach(async()=>{state.db=await openBusiness([...businessMigrations,'20261104010000_prospecting.sql','20261104011000_human_approval.sql','20261104012000_outreach_writeback.sql','20261105160000_outreach_send.sql']);});
afterEach(async()=>{await state.db?.close();});
it('deduplicates, replays commands, audits and stops at pending human review',async()=>{
 const input={requestId:crypto.randomUUID(),payload:{name:'Test',email:'BUYER@example.com'}};
 const lead=await prospectCommand(admin,'leads_upsert',input);
 expect(await prospectCommand(admin,'leads_upsert',input)).toEqual(lead);
 expect((await prospectCommand(admin,'leads_upsert',{...input,requestId:crypto.randomUUID()})).id).toBe(lead.id);
 await expect(prospectCommand(admin,'leads_upsert',{...input,payload:{...input.payload,name:'Changed'}})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 await prospectCommand(admin,'diligence_save_report',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,summary:'Manual evidence'}});
 const draft=await prospectCommand(admin,'outreach_draft_email',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,subject:'Hello',body:'Draft'}});
 await prospectCommand(admin,'outreach_submit_approval',{requestId:crypto.randomUUID(),payload:{draftId:draft.id}});
 await prospectCommand(admin,'outreach_submit_approval',{requestId:crypto.randomUUID(),payload:{draftId:draft.id}});
 expect((await prospectList(admin,'leads')).items).toHaveLength(1);
 expect((await prospectList(admin,'diligence')).items).toHaveLength(1);
 expect((await prospectList(admin,'drafts')).items[0]).toMatchObject({state:'pending'});
 await expect(prospectList(sales,'leads')).rejects.toThrow();
 await expect(prospectList({...admin,companyId:crypto.randomUUID()},'leads')).rejects.toThrow();
 expect((await approvalList(admin)).items).toHaveLength(1);
 expect((await approvalList(admin)).items[0]).toMatchObject({state:'pending',email:'buyer@example.com'});
 await expect(prospectCommand(sales,'leads_upsert',input)).rejects.toThrow();
 await expect(prospectCommand(admin,'outreach_draft_email',{requestId:crypto.randomUUID(),payload:{leadId:crypto.randomUUID(),subject:'x',body:'y'}})).rejects.toThrow('NOT_FOUND');
 await expect(state.db!.exec("update trade_business.approval_queue set state='approved'")).rejects.toThrow();
});

it.each(['outreach_approve','outreach_reject'])('human decision %s is atomic and replayable',async kind=>{
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'test@example.com'}});
 const draft=await prospectCommand(admin,'outreach_draft_email',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,subject:'Hi',body:'Text'}});
 const queue=await prospectCommand(admin,'outreach_submit_approval',{requestId:crypto.randomUUID(),payload:{draftId:draft.id}});
 const input={requestId:crypto.randomUUID(),payload:{approvalId:queue.id,human_actor_id:admin.id}};
 await expect(prospectCommand(admin,kind,input)).rejects.toThrow();
 const {humanApprovalCommand}=await import('@/server/business/prospecting');
 await expect(humanApprovalCommand(sales,kind,input)).rejects.toThrow();
 const result=await humanApprovalCommand(admin,kind,input);
 expect(await humanApprovalCommand(admin,kind,input)).toEqual(result);
 const expected=kind==='outreach_approve'?'approved':'rejected';
 expect((await approvalList(admin,expected)).items[0]).toMatchObject({state:expected,human_actor_id:admin.id});
 expect((await state.db!.query('select state from trade_business.outreach_drafts')).rows[0]).toMatchObject({state:expected});
 await expect(humanApprovalCommand(admin,kind,{...input,requestId:crypto.randomUUID()})).rejects.toThrow('INVALID_TRANSITION');
 await expect(humanApprovalCommand(admin,kind,{...input,payload:{...input.payload,human_actor_id:crypto.randomUUID()}})).rejects.toThrow();
});

it.each([false,true])('approved writeback is atomic and reuses customer=%s',async reuse=>{
 const {saveRecord}=await import('@/server/business/records');
 const {outreachWriteback}=await import('@/server/business/outreach-writeback');
 const {humanApprovalCommand}=await import('@/server/business/prospecting');
 const existing=reuse?await saveRecord(admin,{requestId:crypto.randomUUID(),kind:'customer',payload:{name:'Existing',email:'BUYER@test.com',address:'x',country:'',phone:'',contact:''}}):undefined;
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'buyer@test.com'}});
 const draft=await prospectCommand(admin,'outreach_draft_email',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,subject:'Approved subject',body:'Text'}});
 const queue=await prospectCommand(admin,'outreach_submit_approval',{requestId:crypto.randomUUID(),payload:{draftId:draft.id}});
 const input={requestId:crypto.randomUUID(),payload:{approvalId:queue.id}};
 await expect(outreachWriteback(admin,input)).rejects.toThrow('INVALID_TRANSITION');
 await expect(outreachWriteback({...admin,companyId:crypto.randomUUID()},input)).rejects.toThrow();
 await humanApprovalCommand(admin,'outreach_approve',{requestId:crypto.randomUUID(),payload:{approvalId:queue.id,human_actor_id:admin.id}});
 const result=await outreachWriteback(admin,input);
 expect(await outreachWriteback(admin,input)).toEqual(result);
 await expect(outreachWriteback(admin,{...input,requestId:crypto.randomUUID()})).rejects.toThrow('INVALID_TRANSITION');
 const written=(await approvalList(admin,'approved')).items[0];
 expect(written).toMatchObject({customer_id:result.customerId,state:'approved'});
 expect(written.written_back_at).toBeTruthy();
 expect((await approvalList(admin,'pending')).items).toHaveLength(0);
 if(existing)expect(result.customerId).toBe(existing.id);
 const customers=await state.db!.query("select customer_code,payload from trade_business.business_records where kind='customer'");
 expect(customers.rows).toHaveLength(1);
 expect((customers.rows[0] as {customer_code:string}).customer_code).toBe('CUS-00000001');
 const followups=await state.db!.query("select note,day,next_day from trade_business.followups");
 expect(followups.rows).toHaveLength(1);
 expect(String((followups.rows[0] as {note:string}).note)).toContain('[AI辅助] 已批邮件主题：Approved subject');
});

it('persists Maps metadata through upsert and list',async()=>{
 const payload={name:'Map buyer',email:'MAP@example.com',source:'maps',placeId:'fixture-place',mapsUrl:'https://maps.google.com/?q=fixture',notes:'fixture'};
 const first=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload});
 const second=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{...payload,notes:'updated'}});
 expect(second.id).toBe(first.id);
 expect((await prospectList(admin,'leads')).items[0]).toMatchObject({source:'maps',email:'map@example.com',place_id:'fixture-place',maps_url:payload.mapsUrl,notes:'updated'});
});

it('human Brevo send requires approval and persists one receipt',async()=>{
 const {outreachSendBrevo}=await import('@/server/business/outreach-send');
 vi.stubEnv('BREVO_API_KEY','fixture');vi.stubEnv('BREVO_SENDER_EMAIL','sender@example.com');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({messageId:'mock-receipt'})}));
 try{
 const lead=await prospectCommand(admin,'leads_upsert',{requestId:crypto.randomUUID(),payload:{name:'Buyer',email:'buyer@example.com'}});
 const draft=await prospectCommand(admin,'outreach_draft_email',{requestId:crypto.randomUUID(),payload:{leadId:lead.id,subject:'Hi',body:'Hello'}});
 const queue=await prospectCommand(admin,'outreach_submit_approval',{requestId:crypto.randomUUID(),payload:{draftId:draft.id}});
 const input={requestId:crypto.randomUUID(),payload:{approvalId:queue.id}};
 await expect(outreachSendBrevo(admin,input)).rejects.toThrow('INVALID_TRANSITION');
 const {humanApprovalCommand}=await import('@/server/business/prospecting');
 await humanApprovalCommand(admin,'outreach_approve',{requestId:crypto.randomUUID(),payload:{approvalId:queue.id,human_actor_id:admin.id}});
 await outreachSendBrevo(admin,input);
 expect((await approvalList(admin)).items[0]).toMatchObject({brevo_message_id:'mock-receipt'});
 await expect(outreachSendBrevo(admin,input)).rejects.toThrow('BREVO_ALREADY_STARTED');
 }finally{vi.unstubAllGlobals();vi.unstubAllEnvs();}
});
