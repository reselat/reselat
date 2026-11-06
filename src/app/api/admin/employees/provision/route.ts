import {requireEmployee} from '@/server/auth/session';
import {sameOrigin} from '@/server/auth/http';
import {adminError} from '@/server/admin/errors';
import {createMemberSchema} from '@/server/admin/member-domain';
import {listProvisions,provisionMember} from '@/server/admin/provisioning';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const {employee}=await requireEmployee(true);return Response.json(await listProvisions(employee,Math.max(0,Math.min(100000,Math.floor(Number(new URL(request.url).searchParams.get('offset'))||0)))),{headers:{'cache-control':'no-store'}});}catch(e){return adminError(e);}}
export async function POST(request:Request){try{sameOrigin(request);const {employee}=await requireEmployee(true);const text=await request.text();if(text.length>4096)throw new Error('INVALID_INPUT');const result=await provisionMember(employee,createMemberSchema.parse(JSON.parse(text)));return Response.json(result,{status:result.status==='completed'?200:202,headers:{'cache-control':'no-store'}});}catch(e){return adminError(e);}}
