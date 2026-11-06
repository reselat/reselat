import {cookies,headers} from 'next/headers';
import {localActors,localCompanyId,localTestEnabled,localTestAuthority} from './guard';
import {localDatabase} from './database';
import {IdentityError,employeeSchema,checkEmployee,checkAdmin} from '@/server/auth/employee';
import type {authClient} from '@/server/auth/supabase';
export async function localSession(admin=false){
 if(!localTestEnabled())throw new IdentityError('FORBIDDEN');if(!localTestAuthority((await headers()).get('host')))throw new IdentityError('FORBIDDEN');
 const role=(await cookies()).get('reselat-local-role')?.value;if(!role||!Object.hasOwn(localActors,role))throw new IdentityError('UNAUTHENTICATED');const id=localActors[role as keyof typeof localActors],db=await localDatabase('identity');
 const rows=await db`select user_id as id,company_id as "companyId",role,enabled,version,archived_at::text as "archivedAt" from trade_private.employees where company_id=${localCompanyId} and user_id=${id}`;
 const employee=checkEmployee(rows[0]?employeeSchema.parse(rows[0]):null,id,localCompanyId),aal=employee.role==='admin'?'aal2':'aal1';if(admin)checkAdmin(employee,aal);
 // This identity is explicitly virtual; no real authentication service or credentials are used.
 const auth={auth:{getUser:async()=>({data:{user:{id,email:role+'@local.example.test',user_metadata:{},factors:[]}},error:null})}} as unknown as Awaited<ReturnType<typeof authClient>>;
 return {employee,aal,auth};
}
