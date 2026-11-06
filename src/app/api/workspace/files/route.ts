import {z} from 'zod';
import {actorFor,businessError} from '@/server/business/http';
import {downloadFile} from '@/server/files/files';
import {uploadChunk,streamBytes,uploadChunkSize} from '@/server/files/chunks';
import {boundedFileBody,attachmentHeaders} from '@/server/files/validation';
import {uuid} from '@/modules/business/schemas';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:Request){try{const actor=await actorFor(request),params=new URL(request.url).searchParams;
 const documentId=params.get('documentId');let result;
 if(documentId){const {downloadDocument}=await import('@/server/documents/documents');result=await downloadDocument(actor,uuid.parse(documentId),params.get('history')==='1');}
 else result=await downloadFile(actor,uuid.parse(params.get('id')),false,undefined,params.get('orderId')?uuid.parse(params.get('orderId')):undefined);
 return new Response(streamBytes(result.bytes),{headers:attachmentHeaders(result.name,result.mime)});
 }catch(error){return businessError(error);}}
export async function POST(request:Request){try{const actor=await actorFor(request),bytes=await boundedFileBody(request,uploadChunkSize+16384);
 const form=await new Request('http://multipart.invalid',{method:'POST',headers:{'content-type':request.headers.get('content-type')??''},body:bytes}).formData();
 const id=uuid.parse(form.get('id')),part=z.coerce.number().int().min(0).max(4).parse(form.get('part')),blob=form.get('chunk');if(!(blob instanceof Blob))throw new Error('FILE_LIMIT');
 await uploadChunk(actor,id,part,new Uint8Array(await blob.arrayBuffer()));return Response.json({ok:true,data:{id,part}},{headers:{'cache-control':'no-store'}});
 }catch(error){return businessError(error);}}
