import {actorFor,businessError,response} from '@/server/business/http';
import {checkAdmin} from '@/server/auth/employee';
import {readPdfBody} from '@/server/assistant/pdf-input';
import {attachPdf,downloadPdf} from '@/server/assistant/pdf';
export async function POST(request:Request){try{const actor=await actorFor(request);checkAdmin(actor,actor.aal);return response(await attachPdf(actor,new URL(request.url),await readPdfBody(request)));}catch(e){return businessError(e);}}
export async function GET(request:Request){try{const actor=await actorFor(request),bytes=await downloadPdf(actor,new URL(request.url).searchParams.get('id')??'');return new Response(bytes as BodyInit,{headers:{'content-type':'application/pdf','content-disposition':'attachment; filename="source.pdf"','cache-control':'private, no-store','x-content-type-options':'nosniff'}});}catch(e){return businessError(e);}}
