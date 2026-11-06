import {z} from 'zod';
import {createHash} from 'node:crypto';
import type {BusinessActor} from '@/server/business/access';
import {runBusinessCommand,type BusinessTx} from '@/server/business/commands';
import {readBusiness} from '@/server/business/order-data';
import {getBusinessStorage} from './storage';
import {lookupFile} from './files';
import {objectKey} from './part-paths';
export async function uploadLifecycle(tx:BusinessTx,actor:BusinessActor,id:string){const rows=await tx`select closed_at::text as closed,last_activity_at::text as activity,cleanup_pending as pending from trade_business.upload_intents where company_id=${actor.companyId} and file_id=${id}`;if(!rows[0])throw new Error('NOT_FOUND');return z.object({closed:z.string().nullable(),activity:z.string(),pending:z.boolean()}).parse(rows[0]);}
export async function touchUpload(tx:BusinessTx,actor:BusinessActor,id:string){const life=await uploadLifecycle(tx,actor,id);if(life.closed)throw new Error('UPLOAD_CLOSED');await tx`update trade_business.upload_intents set last_activity_at=clock_timestamp() where company_id=${actor.companyId} and file_id=${id}`;}
export async function checkIntentLimit(tx:BusinessTx,actor:BusinessActor){const rows=await tx`select count(*)::int as company,count(*) filter(where u.created_by=${actor.id})::int as member from trade_business.upload_intents u join trade_business.file_assets f on f.company_id=u.company_id and f.id=u.file_id where u.company_id=${actor.companyId} and ((u.closed_at is null and f.state<>'stored') or u.cleanup_pending)`;if(Number(rows[0].company)>=20||Number(rows[0].member)>=5)throw new Error('UPLOAD_LIMIT');}
// Returns false on any uncertain cleanup. The archived object is never removed here.
export async function cleanUploadParts(actor:BusinessActor,id:string):Promise<boolean>{
 try{
  const ready=await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.cleanup.begin',payload:{id}},async tx=>{await lookupFile(tx,actor,id,true);const rows=await tx`select state,size,sha256,object_path as path from trade_business.file_assets where company_id=${actor.companyId} and id=${id}`;if(!rows[0])throw new Error('NOT_FOUND');const life=await uploadLifecycle(tx,actor,id);if(rows[0].state!=='stored'&&!life.closed)throw new Error('FILE_NOT_READY');await tx`update trade_business.upload_intents set cleanup_pending=true where company_id=${actor.companyId} and file_id=${id}`;return {state:String(rows[0].state),size:Number(rows[0].size),sha256:String(rows[0].sha256),path:String(rows[0].path)};});
  if(ready.path!==objectKey(actor.companyId,id))throw new Error('FILE_NOT_READY');const storage=await getBusinessStorage();
  if(ready.state==='stored'){const bytes=await storage.download(String(ready.path));if(bytes.length!==ready.size||createHash('sha256').update(bytes).digest('hex')!==ready.sha256)throw new Error('FILE_NOT_READY');}
  await storage.removeUploadParts(actor.companyId,id);
  await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.cleanup.done',payload:{id}},async tx=>{await tx`delete from trade_business.upload_parts where company_id=${actor.companyId} and file_id=${id}`;await tx`update trade_business.upload_intents set cleanup_pending=false,cleanup_error=null where company_id=${actor.companyId} and file_id=${id}`;return {id};});return true;
 }catch{
  try{await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'file.cleanup.retry',payload:{id}},async tx=>{await tx`update trade_business.upload_intents set cleanup_pending=true,cleanup_error='CLEANUP_RETRY' where company_id=${actor.companyId} and file_id=${id}`;return {id};});}catch{/* Remains discoverable through the durable file/intent path. */}return false;
 }
}
export async function isClosedUpload(actor:BusinessActor,id:string){return readBusiness(actor,async tx=>Boolean((await uploadLifecycle(tx,actor,id)).closed));}
