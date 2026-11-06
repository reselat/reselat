import {beforeEach,expect,it,vi} from 'vitest';
import {admin} from './helpers/business-db';
const calls=vi.hoisted(()=>({command:vi.fn(),decision:vi.fn(),list:vi.fn(),employee:vi.fn()}));
vi.mock('@/server/auth/session',()=>({requireEmployee:calls.employee}));
vi.mock('@/server/business/outreach-audits',()=>({outreachAuditCommand:calls.command,outreachAuditList:calls.list}));
vi.mock('@/server/business/prospecting',()=>({humanApprovalCommand:calls.decision}));
import {POST} from '@/app/api/workspace/business/route';
beforeEach(()=>{
 vi.clearAllMocks();
 vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3000');
 calls.employee.mockResolvedValue({employee:admin,aal:'aal2'});
 calls.command.mockResolvedValue({id:'test'});
 calls.decision.mockResolvedValue({id:'test'});
});
function request(action:string,agent=false,origin='http://127.0.0.1:3000'){
 return new Request('http://127.0.0.1:3000/api/workspace/business',{method:'POST',headers:{origin,'content-type':'application/json',...(agent?{'x-agent-company-id':admin.companyId}:{})},body:JSON.stringify({action,input:{requestId:crypto.randomUUID(),payload:{}}})});
}
it.each(['outreach_audit_submit','outreach_audit_record','outreach_audit_fuse'])('allows Host/admin pipeline command %s',async action=>{
 expect((await POST(request(action,true))).status).toBe(200);
 expect(calls.command).toHaveBeenCalledOnce();
 expect(calls.decision).not.toHaveBeenCalled();
});
it('rejects Agent human decisions before execution and accepts authenticated human routing',async()=>{
 expect((await POST(request('outreach_approve',true))).status).toBe(400);
 expect(calls.decision).not.toHaveBeenCalled();
 expect((await POST(request('outreach_approve'))).status).toBe(200);
 expect(calls.decision).toHaveBeenCalledOnce();
});
it('rejects cross-origin human decisions before any command',async()=>{
 expect((await POST(request('outreach_approve',false,'https://other.example.test'))).status).toBe(403);
 expect(calls.decision).not.toHaveBeenCalled();
});
