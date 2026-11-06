import {checkIntentLimit,touchUpload,uploadLifecycle} from './lifecycle';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {uuid} from '@/modules/business/schemas';
import {checkAdmin,IdentityError} from '@/server/auth/employee';
import {runBusinessCommand,audit,type BusinessTx} from '@/server/business/commands';
import {lookupOrder,readBusiness} from '@/server/business/order-data';
import type {BusinessActor} from '@/server/business/access';
import {getBusinessStorage} from './storage';
import {checkOriginManager,orderOriginReferences} from './origins';
import {lookupRecord} from '@/server/business/records';
import {validateFile} from './validation';
export const fileRow=z.object({id:uuid,orderId:uuid.nullable(),recordKind:z.enum(['product','supplier']).nullable().optional(),recordId:uuid.nullable().optional(),category:z.enum(['customer','purchase','customs','document','signature','export','origin']),name:z.string(),mime:z.enum(['application/pdf','image/png','image/jpeg','text/csv','application/zip']),size:z.number().int(),sha256:z.string(),objectPath:z.string(),state:z.enum(['pending','uploading','stored','needs_reconciliation']),createdBy:uuid});
export type FileRow=z.infer<typeof fileRow>;
const intent=z.object({requestId:uuid,orderId:uuid.nullable(),recordKind:z.enum(['product','supplier']).nullable().optional(),recordId:uuid.nullable().optional(),category:z.enum(['customer','purchase','customs','document','signature','export','origin']),name:z.string().min(1).max(180).refine(v=>!/[\x00-\x1f\x7f/\\]/.test(v)&&!v.includes('..')),mime:z.enum(['application/pdf','image/png','image/jpeg','text/csv','application/zip']),size:z.number().int().positive().max(52428800),sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function checkFileScope(tx:BusinessTx,actor:BusinessActor,file:Pick<FileRow,'orderId'|'category'|'id'|'recordKind'|'recordId'>,write=false,originOrderId?:string){
 if(file.category==='origin'){
  if(!file.recordKind||!file.recordId||file.orderId!==null)throw new Error('INVALID_INPUT');
  if(originOrderId&&!write){const order=await lookupOrder(tx,actor,uuid.parse(originOrderId)),references=await orderOriginReferences(tx,actor,order);if(!references.some(ref=>ref.id===file.id))throw new IdentityError('FORBIDDEN');return;}
  checkOriginManager(actor,file.recordKind);await lookupRecord(tx,actor.companyId,file.recordId,file.recordKind);return;
 }
 if(file.category==='signature'){checkAdmin(actor,actor.aal);if(file.orderId!==null)throw new Error('INVALID_INPUT');return;}
 if(!file.orderId)throw new Error('INVALID_INPUT');const order=await lookupOrder(tx,actor,file.orderId,write?(actor.role==='operations'?'fulfill':'write'):'read');
 if(['purchase','export'].includes(file.category)&&(actor.role==='sales'||(actor.role==='operations'&&order.operationsId!==actor.id)))throw new IdentityError('FORBIDDEN');
}
export async function lookupFile(tx:BusinessTx,actor:BusinessActor,id:string,write=false,originOrderId?:string){
 const rows=await tx`select id,order_id as "orderId",record_kind as "recordKind",record_id as "recordId",category,name,mime,size,sha256,object_path as "objectPath",state,created_by as "createdBy" from trade_business.file_assets where company_id=${actor.companyId} and id=${uuid.parse(id)}`;
 if(!rows[0])throw new Error('NOT_FOUND');const file=fileRow.parse(rows[0]);await checkFileScope(tx,actor,file,write,originOrderId);return file;
}
async function newIntent(actor:BusinessActor,raw:unknown,internal:boolean){const input=intent.parse(raw);if(!internal&&!['customer','purchase','customs','origin'].includes(input.category))throw new IdentityError('FORBIDDEN');if(input.category!=='export'&&input.size>10485760)throw new Error('FILE_LIMIT');if(input.category==='signature'&&(input.size>2097152||!['image/png','image/jpeg'].includes(input.mime)))throw new Error('FILE_LIMIT');
 return runBusinessCommand(actor,{requestId:input.requestId,kind:'file.intent',payload:input},async tx=>{
  const id=crypto.randomUUID();await checkFileScope(tx,actor,{...input,id},true);await checkIntentLimit(tx,actor);const path=actor.companyId+'/'+id;
  await tx`insert into trade_business.file_assets(company_id,id,order_id,record_kind,record_id,category,name,mime,size,sha256,object_path,created_by) values(${actor.companyId},${id},${input.orderId},${input.recordKind??null},${input.recordId??null},${input.category},${input.name},${input.mime},${input.size},${input.sha256},${path},${actor.id})`;
  await tx`insert into trade_business.upload_intents(company_id,id,file_id,created_by) values(${actor.companyId},${id},${id},${actor.id})`;await audit(tx,actor,id,'file.intent');return {id};
 });}
export const createUploadIntent=(actor:BusinessActor,input:unknown)=>newIntent(actor,input,false);
export const createInternalUploadIntent=(actor:BusinessActor,input:unknown)=>newIntent(actor,input,true);
async function state(actor:BusinessActor,id:string,value:'uploading'|'stored'|'needs_reconciliation'){
 return runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.'+value,payload:{id}},async tx=>{
  const file=await lookupFile(tx,actor,id,true);if(file.state!=='stored')await touchUpload(tx,actor,id);if(file.state!=='stored')await tx`update trade_business.file_assets set state=${value} where company_id=${actor.companyId} and id=${id}`;
  if(value==='stored')await tx`update trade_business.upload_intents set closed_at=coalesce(closed_at,clock_timestamp()),cleanup_pending=cleanup_pending or exists(select 1 from trade_business.upload_parts p where p.company_id=${actor.companyId} and p.file_id=${id}) where company_id=${actor.companyId} and file_id=${id}`;
  await audit(tx,actor,id,'file.'+value);return {id};
 });
}
export async function uploadFile(actor:BusinessActor,id:string,bytes:Uint8Array){const file=await readBusiness(actor,tx=>lookupFile(tx,actor,id,true));const verified=validateFile(file,bytes,file.category==='signature',file.category==='export');
 if(verified.sha256!==file.sha256||verified.size!==file.size)throw new Error('FILE_LIMIT');if(file.state==='stored')return {id};
 await readBusiness(actor,async tx=>{if((await uploadLifecycle(tx,actor,id)).closed)throw new Error('UPLOAD_CLOSED');});
 const storage=await getBusinessStorage();await state(actor,id,'uploading');
 try{await storage.upload(file.objectPath,bytes,file.mime);}catch{
  await state(actor,id,'needs_reconciliation');throw new Error('FILE_NOT_READY');
 }
 try{const actual=await storage.download(file.objectPath);if(actual.length!==file.size||createHash('sha256').update(actual).digest('hex')!==file.sha256)throw new Error('FILE_NOT_READY');await state(actor,id,'stored');return {id};}
 catch{await state(actor,id,'needs_reconciliation');throw new Error('FILE_NOT_READY');}
}
export async function reconcileFile(actor:BusinessActor,id:string){const file=await readBusiness(actor,async tx=>{const file=await lookupFile(tx,actor,id,true);if(file.state!=='stored'&&(await uploadLifecycle(tx,actor,id)).closed)throw new Error('UPLOAD_CLOSED');return file;});const storage=await getBusinessStorage();let bytes:Uint8Array;
 try{bytes=await storage.download(file.objectPath);}catch{throw new Error('FILE_NOT_READY');}
 if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('FILE_NOT_READY');await state(actor,id,'stored');return {id};
}
// Only an explicit object-not-found response permits a same-path upload. Unknown outcomes remain reserved.
export async function recoverGeneratedFile(actor:BusinessActor,id:string,regenerate:()=>Promise<Uint8Array>){
 const file=await readBusiness(actor,async tx=>{const file=await lookupFile(tx,actor,id,true);if(file.state!=='stored'&&(await uploadLifecycle(tx,actor,id)).closed)throw new Error('UPLOAD_CLOSED');return file;});const storage=await getBusinessStorage();let bytes:Uint8Array;
 try{bytes=await storage.download(file.objectPath);}catch(error){if(!(error instanceof Error)||error.message!=='STORAGE_NOT_FOUND')throw new Error('FILE_NOT_READY');return uploadFile(actor,id,await regenerate());}
 if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('FILE_NOT_READY');await state(actor,id,'stored');return {id};
}
export async function downloadFile(actor:BusinessActor,id:string,signatureInternal=false,historicalDocumentId?:string,originOrderId?:string){const file=await readBusiness(actor,async tx=>{const file=await lookupFile(tx,actor,id,false,originOrderId);const voided=await tx`select d.id from trade_business.document_versions v join trade_business.documents d on d.company_id=v.company_id and d.id=v.document_id where v.company_id=${actor.companyId} and v.file_id=${id} and d.state='void'`;if(voided.some(row=>row.id!==historicalDocumentId))throw new Error('FILE_NOT_READY');return file;});
 if(file.category==='signature'&&!signatureInternal)throw new IdentityError('FORBIDDEN');if(file.state!=='stored')throw new Error('FILE_NOT_READY');
 const storage=await getBusinessStorage();const bytes=await storage.download(file.objectPath);if(bytes.length!==file.size||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('FILE_NOT_READY');
 return {bytes,name:file.name,mime:file.mime,sha256:file.sha256};
}
export async function listFiles(actor:BusinessActor,orderId:string){return readBusiness(actor,async tx=>{
 const order=await lookupOrder(tx,actor,uuid.parse(orderId));const rows=await tx`select id,order_id as "orderId",record_kind as "recordKind",record_id as "recordId",category,name,mime,size,sha256,object_path as "objectPath",state,created_by as "createdBy" from trade_business.file_assets where company_id=${actor.companyId} and order_id=${orderId} and category<>'signature' order by created_at desc,id limit 100`;
 return rows.map(row=>fileRow.parse(row)).filter(file=>!['purchase','export'].includes(file.category)||actor.role==='admin'||(actor.role==='operations'&&order.operationsId===actor.id)).map(({objectPath:omitted,...metadata})=>{void omitted;return metadata;});
 });}
