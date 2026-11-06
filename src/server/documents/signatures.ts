import {z} from 'zod';
import {createHash} from 'node:crypto';
import {uuid,version} from '@/modules/business/schemas';
import {checkAdmin} from '@/server/auth/employee';
import {assertActiveCompanyMember} from '@/server/auth/member-directory';
import {audit,runBusinessCommand,type BusinessTx} from '@/server/business/commands';
import {expectVersion,lookupOrder,readBusiness,requireState} from '@/server/business/order-data';
import type {BusinessActor} from '@/server/business/access';
import {lookupFile,fileRow} from '@/server/files/files';
import {getBusinessStorage} from '@/server/files/storage';
import {documentType,lookupDocument,type DocumentRow} from './data';
const register=z.object({requestId:uuid,fileId:uuid,name:z.string().trim().min(1).max(120)}).strict();
export async function registerSignature(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=register.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'signature.register',payload:input},async tx=>{
 const file=await lookupFile(tx,actor,input.fileId);if(file.category!=='signature'||file.state!=='stored')throw new Error('FILE_NOT_READY');const existing=await tx`select id,version from trade_business.signatures where company_id=${actor.companyId} and file_id=${file.id}`;if(existing[0])return {id:uuid.parse(existing[0].id),version:Number(existing[0].version)};const id=crypto.randomUUID();
 await tx`insert into trade_business.signatures(company_id,id,file_id,name,created_by) values(${actor.companyId},${id},${file.id},${input.name},${actor.id})`;await audit(tx,actor,id,'signature.register');return {id,version:1};
 });}
const grant=z.object({requestId:uuid,id:uuid,expectedVersion:version,userId:uuid,purpose:documentType,enabled:z.boolean()}).strict();
export async function grantSignature(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=grant.parse(raw);await assertActiveCompanyMember(actor.companyId,input.userId);return runBusinessCommand(actor,{requestId:input.requestId,kind:'signature.grant',payload:input},async tx=>{
 const rows=await tx`select version from trade_business.signatures where company_id=${actor.companyId} and id=${input.id}`;if(!rows[0])throw new Error('NOT_FOUND');expectVersion(Number(rows[0].version),input.expectedVersion);
 await tx`insert into trade_business.signature_grants(company_id,signature_id,user_id,purpose,enabled) values(${actor.companyId},${input.id},${input.userId},${input.purpose},${input.enabled}) on conflict(company_id,signature_id,user_id,purpose) do update set enabled=excluded.enabled,version=trade_business.signature_grants.version+1`;
 await tx`update trade_business.signatures set version=version+1 where company_id=${actor.companyId} and id=${input.id}`;await audit(tx,actor,input.id,'signature.grant',{userId:input.userId,purpose:input.purpose,enabled:input.enabled});return {id:input.id,version:input.expectedVersion+1};
 });}
export async function setSignatureEnabled(actor:BusinessActor,raw:unknown){checkAdmin(actor,actor.aal);const input=z.object({requestId:uuid,id:uuid,expectedVersion:version,enabled:z.boolean()}).strict().parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'signature.enable',payload:input},async tx=>{
 const rows=await tx`update trade_business.signatures set enabled=${input.enabled},version=version+1 where company_id=${actor.companyId} and id=${input.id} and version=${input.expectedVersion} returning id`;if(!rows.length)throw new Error('VERSION_CONFLICT');await audit(tx,actor,input.id,'signature.enable',{enabled:input.enabled});return {id:input.id};
 });}
const asset=z.object({id:uuid,fileId:uuid,enabled:z.boolean(),sha256:z.string(),state:z.string(),version:z.number().int()});
async function authorizeAsset(tx:BusinessTx,actor:BusinessActor,id:string,purpose:z.infer<typeof documentType>){
 const rows=await tx`select s.id,s.file_id as "fileId",s.enabled,s.version,f.sha256,f.state from trade_business.signatures s join trade_business.file_assets f on f.company_id=s.company_id and f.id=s.file_id where s.company_id=${actor.companyId} and s.id=${id}`;
 if(!rows[0])throw new Error('SIGNATURE_FORBIDDEN');const value=asset.parse(rows[0]);if(!value.enabled||value.state!=='stored')throw new Error('SIGNATURE_FORBIDDEN');
 let grantVersion=0;if(actor.role==='admin')checkAdmin(actor,actor.aal);else{
  if(actor.role!=='operations')throw new Error('SIGNATURE_FORBIDDEN');const grants=await tx`select version from trade_business.signature_grants where company_id=${actor.companyId} and signature_id=${id} and user_id=${actor.id} and purpose=${purpose} and enabled`;if(!grants[0])throw new Error('SIGNATURE_FORBIDDEN');grantVersion=Number(grants[0].version);
 }return {...value,grantVersion};
}
const prepare=z.object({requestId:uuid,id:uuid,expectedVersion:version,signatureId:uuid}).strict();
export async function prepareSignatureUsage(actor:BusinessActor,raw:unknown){const input=prepare.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'signature.prepare',payload:input},async tx=>{
 const {doc}=await lookupDocument(tx,actor,input.id);await lookupOrder(tx,actor,doc.orderId,actor.role==='admin'?'confirm':'fulfill');requireState(doc.state,['draft']);expectVersion(doc.version,input.expectedVersion);
 const signature=await authorizeAsset(tx,actor,input.signatureId,doc.type),id=crypto.randomUUID();
 await tx`insert into trade_business.signature_usages(company_id,id,signature_id,document_id,expected_document_version,actor_id,grant_version,file_id,file_hash) values(${actor.companyId},${id},${signature.id},${doc.id},${doc.version},${actor.id},${signature.grantVersion},${signature.fileId},${signature.sha256})`;
 await audit(tx,actor,id,'signature.prepare');return {id};
 });}
export async function validateSignatureUsage(tx:BusinessTx,actor:BusinessActor,doc:DocumentRow,usageId:string){
 const rows=await tx`select id,signature_id as "signatureId",document_id as "documentId",expected_document_version as version,actor_id as "actorId",grant_version as "grantVersion",file_id as "fileId",file_hash as "fileHash",state from trade_business.signature_usages where company_id=${actor.companyId} and id=${usageId}`;
 const parsed=z.object({id:uuid,signatureId:uuid,documentId:uuid,version:z.number().int(),actorId:uuid,grantVersion:z.number().int(),fileId:uuid,fileHash:z.string(),state:z.string()}).safeParse(rows[0]);if(!parsed.success)throw new Error('SIGNATURE_FORBIDDEN');const usage=parsed.data;
 if(usage.documentId!==doc.id||usage.version!==doc.version||usage.actorId!==actor.id||usage.state!=='prepared')throw new Error('SIGNATURE_FORBIDDEN');
 const current=await authorizeAsset(tx,actor,usage.signatureId,doc.type);if(current.grantVersion!==usage.grantVersion||current.sha256!==usage.fileHash||current.fileId!==usage.fileId)throw new Error('SIGNATURE_FORBIDDEN');return usage;
}
export async function signatureBytes(actor:BusinessActor,documentId:string,versionId:string){const file=await readBusiness(actor,async tx=>{
 await lookupDocument(tx,actor,documentId);const rows=await tx`select f.id,f.order_id as "orderId",f.category,f.name,f.mime,f.size,f.sha256,f.object_path as "objectPath",f.state,f.created_by as "createdBy" from trade_business.signature_usages u join trade_business.file_assets f on f.company_id=u.company_id and f.id=u.file_id where u.company_id=${actor.companyId} and u.document_id=${documentId} and u.document_version_id=${versionId} and u.state='used' and f.sha256=u.file_hash`;
 return rows[0]?fileRow.parse(rows[0]):null;
 });if(!file)return undefined;if(file.state!=='stored'||(file.mime!=='image/png'&&file.mime!=='image/jpeg'))throw new Error('FILE_NOT_READY');const storage=await getBusinessStorage(),bytes=await storage.download(file.objectPath);
 if(createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error('FILE_NOT_READY');return {bytes,mime:file.mime};
}
export async function listSignatures(actor:BusinessActor){if(actor.role==='sales')return [];return readBusiness(actor,async tx=>{
 const rows=await tx`select s.id,s.name,s.enabled,s.version,g.user_id as "userId",g.purpose,g.enabled as "grantEnabled" from trade_business.signatures s left join trade_business.signature_grants g on g.company_id=s.company_id and g.signature_id=s.id where s.company_id=${actor.companyId} and (${actor.role==='admin'} or (g.user_id=${actor.id} and g.enabled and s.enabled)) order by s.name,s.id`;
 return z.array(z.object({id:uuid,name:z.string(),enabled:z.boolean(),version:z.number().int(),userId:uuid.nullable(),purpose:documentType.nullable(),grantEnabled:z.boolean().nullable()})).parse(rows);
 });}
