import {requireEmployee} from '@/server/auth/session';
import {authDatabase} from '@/server/db/client';
import {sameOrigin,accountError} from '@/server/auth/http';
import {profileSchema} from '@/modules/account/profile-schema';
import {bodyOf} from '@/server/business/http';
export const dynamic='force-dynamic';
export async function GET(){try{const {employee,auth}=await requireEmployee();const {data,error}=await auth.auth.getUser();if(error||!data.user)throw new Error('UNAUTHENTICATED');const db=await authDatabase();const rows=await db`select display_name as name from trade_private.employees where company_id=${employee.companyId} and user_id=${employee.id}`;return Response.json({name:rows[0].name,phone:typeof data.user.user_metadata?.contact_phone==='string'?data.user.user_metadata.contact_phone:'',email:data.user.email??'',pendingEmail:data.user.new_email??''},{headers:{'cache-control':'no-store'}});}catch(e){return accountError(e);}}
export async function PATCH(request:Request){try{sameOrigin(request);const {employee,auth}=await requireEmployee();const input=await bodyOf(request,profileSchema);const db=await authDatabase();
// Contact metadata is never used for authorization. Role and company remain in the identity database.
const {error}=await auth.auth.updateUser({data:{contact_phone:input.phone}});if(error)throw new Error('PROFILE_UPDATE_FAILED');
await db.begin(async tx=>{const rows=await tx`select user_id from trade_private.employees where company_id=${employee.companyId} and user_id=${employee.id} and enabled and archived_at is null for update`;if(!rows.length)throw new Error('UNAUTHENTICATED');await tx`update trade_private.employees set display_name=${input.name},version=version+1 where company_id=${employee.companyId} and user_id=${employee.id}`;await tx`insert into trade_private.audit_events(company_id,actor_id,subject_id,action,details) values(${employee.companyId},${employee.id},${employee.id},'account.profile',${tx.json({})})`;});return Response.json({ok:true},{headers:{'cache-control':'no-store'}});}catch(e){return accountError(e);}}
