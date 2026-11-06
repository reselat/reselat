import {cleanUploadParts,isClosedUpload,touchUpload,uploadLifecycle} from './lifecycle';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {uuid} from '@/modules/business/schemas';
import type {BusinessActor} from '@/server/business/access';
import {runBusinessCommand} from '@/server/business/commands';
import {readBusiness} from '@/server/business/order-data';
import {lookupFile,reconcileFile,uploadFile} from './files';
import {getBusinessStorage} from './storage';
export const uploadChunkSize=2097152;
const partSchema=z.number().int().min(0).max(4);
export async function uploadChunk(actor:BusinessActor,id:string,part:number,bytes:Uint8Array){uuid.parse(id);partSchema.parse(part);if(!bytes.length||bytes.length>uploadChunkSize)throw new Error('FILE_LIMIT');
 const hash=createHash('sha256').update(bytes).digest('hex');const file=await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.chunk-intent',payload:{id,part,hash}},async tx=>{
  const file=await lookupFile(tx,actor,id,true);if(file.state==='stored')return {done:true,path:file.objectPath};await touchUpload(tx,actor,id);if(file.category==='export'||file.size>10485760||part>=Math.ceil(file.size/uploadChunkSize)||bytes.length!==Math.min(uploadChunkSize,file.size-part*uploadChunkSize))throw new Error('FILE_LIMIT');
  const old=await tx`select sha256 from trade_business.upload_parts where company_id=${actor.companyId} and file_id=${id} and part=${part}`;if(old[0]&&old[0].sha256!==hash)throw new Error('IDEMPOTENCY_CONFLICT');
  await tx`insert into trade_business.upload_parts(company_id,file_id,part,size,sha256) values(${actor.companyId},${id},${part},${bytes.length},${hash}) on conflict do nothing`;return {done:false,path:file.objectPath+'/parts/'+part};
 });
 if(file.done===true){await cleanUploadParts(actor,id);return {id,part};}
 try{
 const path=z.string().parse(file.path),storage=await getBusinessStorage();try{await storage.upload(path,bytes,'application/octet-stream');}catch{/* An existing object or uncertain result is verified, never overwritten. */}
 let actual:Uint8Array;try{actual=await storage.download(path);}catch{throw new Error('FILE_NOT_READY');}
 if(actual.length!==bytes.length||createHash('sha256').update(actual).digest('hex')!==hash)throw new Error('FILE_NOT_READY');
 const result=await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.chunk-stored',payload:{id,part,hash}},async tx=>{await lookupFile(tx,actor,id,true);if((await uploadLifecycle(tx,actor,id)).closed)return {id,part,closed:true};await tx`update trade_business.upload_parts set stored=true where company_id=${actor.companyId} and file_id=${id} and part=${part} and sha256=${hash}`;return {id,part,closed:false};});
 if(result.closed){await cleanUploadParts(actor,id);throw new Error('UPLOAD_CLOSED');}return {id,part};
 }catch(error){if(await isClosedUpload(actor,id).catch(()=>false))await cleanUploadParts(actor,id);throw error;}
}
export async function finishUpload(actor:BusinessActor,id:string){const data=await readBusiness(actor,async tx=>{const file=await lookupFile(tx,actor,id,true);if(file.state!=='stored'&&(await uploadLifecycle(tx,actor,id)).closed)throw new Error('UPLOAD_CLOSED');const parts=await tx`select part,size,sha256,stored from trade_business.upload_parts where company_id=${actor.companyId} and file_id=${id} order by part`;return {file,parts:z.array(z.object({part:z.number().int(),size:z.number().int(),sha256:z.string(),stored:z.boolean()})).parse(parts)};});
 if(data.file.state==='stored'){await reconcileFile(actor,id);await cleanUploadParts(actor,id);return {id};}
 if(data.file.category==='export'||data.parts.length!==Math.ceil(data.file.size/uploadChunkSize)||data.parts.some((p,i)=>!p.stored||p.part!==i))throw new Error('FILE_NOT_READY');
 try{const storage=await getBusinessStorage(),bytes=new Uint8Array(data.file.size);let offset=0;
 for(const part of data.parts){const chunk=await storage.download(data.file.objectPath+'/parts/'+part.part);if(chunk.length!==part.size||createHash('sha256').update(chunk).digest('hex')!==part.sha256)throw new Error('FILE_NOT_READY');bytes.set(chunk,offset);offset+=chunk.length;}
 if(offset!==data.file.size)throw new Error('FILE_NOT_READY');await uploadFile(actor,id,bytes);
 }catch(error){try{await reconcileFile(actor,id);}catch{throw error;}}
 await cleanUploadParts(actor,id);return {id};
}
export function streamBytes(bytes:Uint8Array){let offset=0;return new ReadableStream<Uint8Array>({pull(controller){if(offset>=bytes.length){controller.close();return;}const end=Math.min(offset+65536,bytes.length);controller.enqueue(bytes.slice(offset,end));offset=end;}});}
