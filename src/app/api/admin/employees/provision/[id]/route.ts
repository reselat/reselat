import {z} from 'zod';
import {requireEmployee} from '@/server/auth/session';
import {sameOrigin} from '@/server/auth/http';
import {adminError} from '@/server/admin/errors';
import {recoverProvision} from '@/server/admin/provisioning';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){try{sameOrigin(request);const {employee}=await requireEmployee(true);const id=z.string().uuid().parse((await context.params).id);const text=await request.text();if(text.length>1024)throw new Error('INVALID_INPUT');const body=z.object({userId:z.string().uuid().optional()}).strict().parse(JSON.parse(text));return Response.json(await recoverProvision(employee,id,body.userId),{headers:{'cache-control':'no-store'}});}catch(e){return adminError(e);}}
