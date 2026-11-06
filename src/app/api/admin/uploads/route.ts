import {actorFor,bodyOf,businessError,response} from '@/server/business/http';
import {listUploadMaintenance,previewUploadMaintenance,executeUploadMaintenance} from '@/server/files/maintenance';
import {z} from 'zod';
export const dynamic='force-dynamic';export const maxDuration=300;
export async function GET(request:Request){try{const actor=await actorFor(request),p=new URL(request.url).searchParams;return response(p.get('id')?await previewUploadMaintenance(actor,p.get('id')!):await listUploadMaintenance(actor,z.coerce.number().int().parse(p.get('offset')??0)));}catch(e){return businessError(e);}}
export async function POST(request:Request){try{const actor=await actorFor(request);return response(await executeUploadMaintenance(actor,await bodyOf(request,z.object({id:z.string().uuid(),version:z.string()}).strict())));}catch(e){return businessError(e);}}
