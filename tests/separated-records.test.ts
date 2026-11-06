import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({identity:vi.fn(),business:vi.fn(),requireEmployee:vi.fn()}));
vi.mock('@/server/db/client',()=>({authDatabase:mocks.identity,businessDatabase:mocks.business}));
vi.mock('@/server/auth/session',()=>({requireEmployee:mocks.requireEmployee}));
import {rereadEmployee,assertActiveCompanyMember} from '../src/server/auth/member-directory';
import {GET,POST} from '../src/app/api/workspace/records/route';
const id='00000000-0000-4000-8000-000000000001',company='00000000-0000-4000-8000-000000000002';
const actor={id,companyId:company,role:'sales' as const,enabled:true,version:1};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3000');});
it('denies business access before connecting when identity verification is unavailable',async()=>{
 mocks.requireEmployee.mockRejectedValue(new Error('synthetic identity outage'));
 const read=await GET(new Request('http://127.0.0.1:3000/api/workspace/records?kind=customer'));
 const write=await POST(new Request('http://127.0.0.1:3000/api/workspace/records',{method:'POST',headers:{origin:'http://127.0.0.1:3000'},body:'{}'}));
 expect(read.ok).toBe(false);expect(write.ok).toBe(false);expect(mocks.business).not.toHaveBeenCalled();
});
it('rejects role/version changes, disabled, archived, absent and cross-company identities',async()=>{
 for(const row of [{...actor,version:2},{...actor,role:'admin'},{...actor,enabled:false},{...actor,archivedAt:'2026-01-01'},{...actor,companyId:id},null]){
  mocks.identity.mockResolvedValue(vi.fn(async()=>row?[row]:[]));
  await expect(rereadEmployee(actor)).rejects.toThrow();
 }
});
it('verifies a new owner or share in the identity database and permits a matching active member',async()=>{
 mocks.identity.mockResolvedValue(vi.fn(async()=>[actor]));await expect(assertActiveCompanyMember(company,id)).resolves.toBeUndefined();
 mocks.identity.mockResolvedValue(vi.fn(async()=>[]));await expect(assertActiveCompanyMember(company,id)).rejects.toThrow();
 expect(mocks.business).not.toHaveBeenCalled();
});
