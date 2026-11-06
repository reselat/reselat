import {it,expect,vi,beforeEach} from 'vitest';
import {IdentityError} from '../src/server/auth/employee';
const requireEmployee=vi.hoisted(()=>vi.fn());
vi.mock('@/server/auth/session',()=>({requireEmployee}));
vi.mock('@/server/admin/auth-admin',()=>({authAdmin:vi.fn(),createAuthAccount:vi.fn(),confirmProvisionIdentity:vi.fn()}));
import {GET,PATCH} from '../src/app/api/admin/employees/route';
import {POST as create,GET as provisions} from '../src/app/api/admin/employees/provision/route';
import {POST as recover} from '../src/app/api/admin/employees/provision/[id]/route';
import {GET as audit} from '../src/app/api/admin/audit/route';
beforeEach(()=>{vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3000');requireEmployee.mockReset();});
it.each(['UNAUTHENTICATED','FORBIDDEN','MFA_REQUIRED'] as const)('denies all management endpoints for %s before database or Auth writes',async code=>{
 requireEmployee.mockRejectedValue(new IdentityError(code));
 const request=()=>new Request('http://127.0.0.1:3000/api/admin/employees',{method:'POST',headers:{origin:'http://127.0.0.1:3000','content-type':'application/json'},body:'{}'});
 const responses=await Promise.all([GET(request()),PATCH(request()),create(request()),provisions(request()),recover(request(),{params:Promise.resolve({id:'00000000-0000-4000-8000-000000000001'})}),audit(request())]);
 for(const response of responses)expect(response.status).toBe(code==='UNAUTHENTICATED'?401:403);
 expect(requireEmployee.mock.calls.every(args=>args[0]===true)).toBe(true);
});
it('rejects cross-origin writes before identity lookup',async()=>{const response=await create(new Request('http://127.0.0.1:3000/api/admin/employees/provision',{method:'POST',headers:{origin:'https://other.example.test'},body:'{}'}));expect(response.status).toBe(403);expect(requireEmployee).not.toHaveBeenCalled();});
