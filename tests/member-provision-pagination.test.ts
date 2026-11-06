import {it,expect,vi} from 'vitest';
const lookup=vi.hoisted(()=>vi.fn(async()=>({operations:[],hasMore:true})));
vi.mock('@/server/auth/session',()=>({requireEmployee:vi.fn(async()=>({employee:{id:'actor',companyId:'company'}}))}));
vi.mock('@/server/admin/provisioning',()=>({listProvisions:lookup,provisionMember:vi.fn()}));
import {GET} from '../src/app/api/admin/employees/provision/route';
it('permits access to older recovery requests beyond the first 50 records',async()=>{
 const result=await GET(new Request('http://127.0.0.1:3000/api/admin/employees/provision?offset=50'));
 expect(result.status).toBe(200);expect(lookup).toHaveBeenCalledWith(expect.anything(),50);
 expect(await result.json()).toEqual({operations:[],hasMore:true});
});
