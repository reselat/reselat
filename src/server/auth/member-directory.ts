import {authDatabase} from '@/server/db/client';
import {employeeSchema,checkEmployee,IdentityError,type Employee} from './employee';
async function findMember(companyId:string,userId:string){
 const db=await authDatabase();const rows=await db`select user_id as id,company_id as "companyId",role,enabled,version,archived_at::text as "archivedAt" from trade_private.employees where company_id=${companyId} and user_id=${userId}`;
 return checkEmployee(rows[0]?employeeSchema.parse(rows[0]):null,userId,companyId);
}
export async function rereadEmployee(actor:Employee){const current=await findMember(actor.companyId,actor.id);if(current.role!==actor.role||current.version!==actor.version)throw new IdentityError('FORBIDDEN');return current;}
export async function assertActiveCompanyMember(companyId:string,userId:string){await findMember(companyId,userId);}
export async function assertOperationsMember(companyId:string,userId:string){const member=await findMember(companyId,userId);if(member.role!=='operations')throw new IdentityError('FORBIDDEN');}
export async function assertSalesOwner(companyId:string,userId:string){const member=await findMember(companyId,userId);if(member.role!=='sales'&&member.role!=='admin')throw new IdentityError('FORBIDDEN');}
