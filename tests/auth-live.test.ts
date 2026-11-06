import {it,expect} from 'vitest';
import {checkEmployee,checkAdmin,parseRoleChange} from '@/server/auth/employee';
const employee={id:'u1',companyId:'c1',role:'admin' as const,enabled:true,version:1};
it('rejects missing membership, disabled employee and company mismatch',()=>{expect(()=>checkEmployee(null,'u1','c1')).toThrow();expect(()=>checkEmployee({...employee,enabled:false},'u1','c1')).toThrow();expect(()=>checkEmployee(employee,'u1','other')).toThrow();expect(()=>checkEmployee(employee,'other','c1')).toThrow();});
it('requires fresh admin membership and verified MFA for administration',()=>{expect(()=>checkAdmin(employee,'aal1')).toThrow();expect(()=>checkAdmin({...employee,role:'sales'},'aal2')).toThrow();expect(()=>checkAdmin(employee,'aal2')).not.toThrow();});
it('accepts only the three roles and requires concurrency version',()=>{expect(parseRoleChange({role:'operations',enabled:true,version:1}).role).toBe('operations');expect(()=>parseRoleChange({role:'finance',enabled:true,version:1})).toThrow();expect(()=>parseRoleChange({role:'admin',enabled:true})).toThrow();expect(()=>parseRoleChange({role:'admin',enabled:true,version:1,companyId:'other'})).toThrow();});
