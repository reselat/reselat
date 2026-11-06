import {z} from 'zod';
import {requireEmployee} from '@/server/auth/session';
import {checkAdmin,IdentityError} from '@/server/auth/employee';
import {accountError} from '@/server/auth/http';
import {businessDatabase} from '@/server/db/client';
import {projectRecord} from '@/server/workspace/records';
import {actorFor,bodyOf,businessError} from '@/server/business/http';
import {saveRecord} from '@/server/business/records';
import {reportDatabaseFailure} from '@/server/db/diagnostics';
const kindSchema=z.enum(['customer','product','supplier']);
const rowSchema=z.object({id:z.string(),companyId:z.string(),ownerId:z.string().nullable(),kind:kindSchema,version:z.number(),payload:z.record(z.string(),z.unknown())});
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const {employee,aal}=await requireEmployee();if(employee.role==='admin')checkAdmin(employee,typeof aal==='string'?aal:undefined);const url=new URL(request.url),kind=kindSchema.parse(url.searchParams.get('kind'));if(kind==='supplier'&&employee.role!=='admin')throw new IdentityError('FORBIDDEN');const offset=z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get('offset')??0);const db=await businessDatabase();const rows=await db`select r.id,r.company_id as "companyId",r.owner_id as "ownerId",r.kind,r.payload,r.version from trade_business.business_records r where r.company_id=${employee.companyId} and r.kind=${kind} and (${employee.role==='admin'} or r.kind='product' or r.owner_id=${employee.id} or exists(select 1 from trade_business.record_shares s where s.company_id=r.company_id and s.kind=r.kind and s.record_id=r.id and s.user_id=${employee.id})) order by r.created_at,r.id limit 50 offset ${offset}`;return Response.json({records:rows.map(r=>{const parsed=rowSchema.parse(r);return {...projectRecord(employee,parsed),version:parsed.version};})},{headers:{'cache-control':'no-store'}});}catch(e){reportDatabaseFailure('records.request',e);return accountError(e);}}
const command=z.object({kind:kindSchema,payload:z.unknown(),id:z.string().uuid().optional(),version:z.number().int().positive().optional(),requestId:z.string().uuid().optional()}).strict();
export async function POST(request:Request){try{const actor=await actorFor(request),body=await bodyOf(request,command);const result=await saveRecord(actor,{kind:body.kind,payload:body.payload,requestId:body.requestId??crypto.randomUUID(),...(body.id?{id:body.id,expectedVersion:body.version}:{})});return Response.json({ok:true,code:'SAVED',id:result.id},{headers:{'cache-control':'no-store'}});}catch(error){return businessError(error);}}
