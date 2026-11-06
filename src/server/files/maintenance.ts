import {z} from 'zod';
import {createHash} from 'node:crypto';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from '@/server/business/access';
import {audit,runBusinessCommand} from '@/server/business/commands';
import {readBusiness} from '@/server/business/order-data';
import {commandFingerprint} from '@/server/business/command-values';
import {uuid} from '@/modules/business/schemas';
import {lookupFile} from './files';
import {uploadLifecycle,cleanUploadParts} from './lifecycle';
import {getBusinessStorage} from './storage';
import {objectKey,partKeys} from './part-paths';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export async function listUploadMaintenance(actor:BusinessActor,offset=0){checkAdmin(actor,actor.aal);offset=z.number().int().min(0).max(100000).parse(offset);return readBusiness(actor,async tx=>{const rows=await tx`select f.id,f.name,f.category,f.state,u.closed_at::text as closed,u.last_activity_at::text as activity,u.cleanup_pending as pending,u.cleanup_error as error from trade_business.file_assets f join trade_business.upload_intents u on u.company_id=f.company_id and u.file_id=f.id where f.company_id=${actor.companyId} order by f.created_at,f.id limit 21 offset ${offset}`;const totals=await tx`select count(*)::int as files,coalesce(sum(f.size),0)::text as bytes,count(*) filter(where u.cleanup_pending)::int as pending from trade_business.file_assets f join trade_business.upload_intents u on u.company_id=f.company_id and u.file_id=f.id where f.company_id=${actor.companyId}`;return {items:rows.slice(0,20),hasMore:rows.length>20,totals:totals[0]};});}
async function inspect(actor:BusinessActor,id:string){
 const data=await readBusiness(actor,async tx=>{const file=await lookupFile(tx,actor,id,true),life=await uploadLifecycle(tx,actor,id);const refs=await tx`select (exists(select 1 from trade_business.document_versions where company_id=${actor.companyId} and file_id=${id}) or exists(select 1 from trade_business.refund_exports where company_id=${actor.companyId} and file_id=${id}) or exists(select 1 from trade_business.refund_item_files where company_id=${actor.companyId} and file_id=${id})) as referenced, (exists(select 1 from trade_business.refund_exports where company_id=${actor.companyId} and file_id=${id} and claim_until>clock_timestamp()) or exists(select 1 from trade_business.document_versions v join trade_business.document_jobs j on j.company_id=v.company_id and j.version_id=v.id where v.company_id=${actor.companyId} and v.file_id=${id} and j.claim_until>clock_timestamp())) as active`;return {file,life,referenced:Boolean(refs[0].referenced),active:Boolean(refs[0].active)};});
 if(data.file.objectPath!==objectKey(actor.companyId,id))throw new Error('FILE_NOT_READY');const storage=await getBusinessStorage();
 let final:{present:boolean;hash:string;size:number};try{const bytes=await storage.download(data.file.objectPath);final={present:true,hash:sha(bytes),size:bytes.length};}catch(e){if(!(e instanceof Error)||e.message!=='STORAGE_NOT_FOUND')throw e;final={present:false,hash:'',size:0};}
 let parts=0,partBytes=0;for(const path of partKeys(actor.companyId,id)){try{const bytes=await storage.download(path);parts++;partBytes+=bytes.length;}catch(e){if(!(e instanceof Error)||e.message!=='STORAGE_NOT_FOUND')throw e;}}
 const valid=final.present&&final.hash===data.file.sha256&&final.size===data.file.size;
 const expired=Date.now()-new Date(data.life.activity).getTime()>=86400000;
 let action:'parts'|'recover'|'expire'|'expire-export'|'review'|'active'='review';
 if(data.file.state==='stored')action=valid?'parts':'review';
 else if(data.active)action='active';
 else if(valid)action='recover';
 else if(!expired&&!data.life.closed)action='active';
 else if(!data.referenced){if(!final.present)action='expire';else if(data.file.category==='export')action='expire-export';}
 const version=commandFingerprint({...data,final,parts,partBytes,action});return {id,name:data.file.name,action,version,parts,partBytes,finalBytes:final.size,referenced:data.referenced,activity:data.life.activity};
}
export async function previewUploadMaintenance(actor:BusinessActor,id:string){checkAdmin(actor,actor.aal);return inspect(actor,uuid.parse(id));}
export async function executeUploadMaintenance(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=z.object({id:uuid,version:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(raw);const preview=await inspect(actor,input.id);if(preview.version!==input.version)throw new Error('VERSION_CONFLICT');if(['review','active'].includes(preview.action))throw new Error('FILE_NOT_READY');
 if(preview.action==='parts'){const cleaned=await cleanUploadParts(actor,input.id);return {cleaned};}
 if(preview.action==='recover'){await recoverExistingObject(actor,input.id);return {recovered:true,cleaned:await cleanUploadParts(actor,input.id)};}
 // Keep the company lock through destructive I/O: no new reference or upload can be approved concurrently.
 await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.expire.close',payload:input},async tx=>{
  const file=await lookupFile(tx,actor,input.id,true),life=await uploadLifecycle(tx,actor,input.id);if(file.state==='stored'||life.activity!==preview.activity)throw new Error('VERSION_CONFLICT');
  const refs=await tx`select (exists(select 1 from trade_business.document_versions where company_id=${actor.companyId} and file_id=${input.id}) or exists(select 1 from trade_business.refund_exports where company_id=${actor.companyId} and file_id=${input.id}) or exists(select 1 from trade_business.refund_item_files where company_id=${actor.companyId} and file_id=${input.id})) as referenced`;if(refs[0].referenced)throw new Error('FILE_NOT_READY');
  if(!life.closed&&Date.now()-new Date(life.activity).getTime()<86400000)throw new Error('VERSION_CONFLICT');
  await tx`update trade_business.upload_intents set closed_at=coalesce(closed_at,clock_timestamp()),cleanup_pending=true where company_id=${actor.companyId} and file_id=${input.id}`;
  return {id:input.id};
 });
 try{return await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.expire.delete',payload:input},async tx=>{
  const file=await lookupFile(tx,actor,input.id,true),life=await uploadLifecycle(tx,actor,input.id);if(file.state==='stored'||!life.closed)throw new Error('VERSION_CONFLICT');
  const refs=await tx`select (exists(select 1 from trade_business.document_versions where company_id=${actor.companyId} and file_id=${input.id}) or exists(select 1 from trade_business.refund_exports where company_id=${actor.companyId} and file_id=${input.id}) or exists(select 1 from trade_business.refund_item_files where company_id=${actor.companyId} and file_id=${input.id})) as referenced`;if(refs[0].referenced)throw new Error('FILE_NOT_READY');
  const storage=await getBusinessStorage();let bytes:Uint8Array|undefined;try{bytes=await storage.download(file.objectPath);}catch(e){if(!(e instanceof Error)||e.message!=='STORAGE_NOT_FOUND')throw e;}
  if(bytes&&sha(bytes)===file.sha256&&bytes.length===file.size)throw new Error('VERSION_CONFLICT');
  if(bytes&&file.category!=='export')throw new Error('FILE_NOT_READY');
  // Ordinary final objects are never removed. Export removal requires no references and explicit preview approval.
  if(file.category==='export')await storage.removeAbandonedExportObject(actor.companyId,input.id);
  await storage.removeUploadParts(actor.companyId,input.id);
  await tx`delete from trade_business.upload_parts where company_id=${actor.companyId} and file_id=${input.id}`;
  await tx`update trade_business.upload_intents set cleanup_pending=false,cleanup_error=null where company_id=${actor.companyId} and file_id=${input.id}`;
  await audit(tx,actor,input.id,'file.expired');return {cleaned:true,expired:true};
 });}catch{await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.expire.retry',payload:input},async tx=>{await tx`update trade_business.upload_intents set cleanup_pending=true,cleanup_error='CLEANUP_RETRY' where company_id=${actor.companyId} and file_id=${input.id}`;return {id:input.id};});return {cleaned:false,expired:true};}
}

async function recoverExistingObject(actor:BusinessActor,id:string){checkAdmin(actor,actor.aal);return runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.recover-existing',payload:{id}},async tx=>{
 const file=await lookupFile(tx,actor,id,true);if(file.objectPath!==objectKey(actor.companyId,id))throw new Error('FILE_NOT_READY');
 const bytes=await (await getBusinessStorage()).download(file.objectPath);if(bytes.length!==file.size||sha(bytes)!==file.sha256)throw new Error('FILE_NOT_READY');
 await tx`update trade_business.file_assets set state='stored' where company_id=${actor.companyId} and id=${id}`;
 await tx`update trade_business.upload_intents set closed_at=coalesce(closed_at,clock_timestamp()),cleanup_pending=true where company_id=${actor.companyId} and file_id=${id}`;
 await audit(tx,actor,id,'file.recovered');return {id};
 });}
