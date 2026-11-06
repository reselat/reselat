import {z} from 'zod';
import {uuid,version} from '@/modules/business/schemas';
import {IdentityError} from '@/server/auth/employee';
import {runBusinessCommand,audit,type BusinessTx} from '@/server/business/commands';
import {lookupRecord} from '@/server/business/records';
import {lookupOrder,orderSnapshot,readBusiness,type OrderRow} from '@/server/business/order-data';
import type {BusinessActor} from '@/server/business/access';
import {fileRow} from './files';
import {originRef,originIds} from '@/modules/business/origin-schema';
export function checkOriginManager(actor:BusinessActor,kind:string){if(actor.role==='admin'||(actor.role==='operations'&&kind==='product'))return;throw new IdentityError('FORBIDDEN');}
async function recordOrigins(tx:BusinessTx,actor:BusinessActor,kind:'product'|'supplier',id:string,ids:string[]){
 const result:z.infer<typeof originRef>[]=[];
 for(const fileId of ids){const rows=await tx`select id,name,mime,size,sha256 from trade_business.file_assets where company_id=${actor.companyId} and id=${fileId} and category='origin' and record_kind=${kind} and record_id=${id} and state='stored'`;if(!rows[0])throw new Error('FILE_NOT_READY');result.push(originRef.parse({...rows[0],source:kind}));}
 return result;
}
export async function collectSupplierOrigins(tx:BusinessTx,actor:BusinessActor,supplier:Record<string,unknown>){return recordOrigins(tx,actor,'supplier',uuid.parse(supplier.id),originIds.parse(supplier.originCertificateIds??[]));}
export async function collectOrigins(tx:BusinessTx,actor:BusinessActor,product:Record<string,unknown>){
 const result=await recordOrigins(tx,actor,'product',uuid.parse(product.id),originIds.parse(product.originCertificateIds??[]));
 if(product.supplierId){const supplier=await lookupRecord(tx,actor.companyId,uuid.parse(product.supplierId),'supplier');result.push(...await collectSupplierOrigins(tx,actor,supplier.payload));}
 return [...new Map(result.map(file=>[file.id,file])).values()];
}
export async function orderOriginReferences(tx:BusinessTx,actor:BusinessActor,order:OrderRow){
 const frozen=await orderSnapshot(tx,actor,order),files=new Map<string,z.infer<typeof originRef>>();
 for(const line of frozen.lines)for(const ref of line.originCertificates??[])files.set(ref.id,originRef.parse(ref));
 const purchases=await tx`select payload->'originCertificates' as refs from trade_business.purchase_orders where company_id=${actor.companyId} and order_id=${order.id} and state<>'cancelled'`;
 for(const row of purchases)for(const ref of z.array(originRef).parse(row.refs??[]))files.set(ref.id,ref);
 return [...files.values()];
}
const change=z.object({requestId:uuid,kind:z.enum(['product','supplier']),recordId:uuid,fileId:uuid,expectedVersion:version}).strict();
async function setOrigin(actor:BusinessActor,raw:unknown,active:boolean){const input=change.parse(raw);checkOriginManager(actor,input.kind);return runBusinessCommand(actor,{requestId:input.requestId,kind:active?'origin.attach':'origin.detach',payload:input},async tx=>{
 const record=await lookupRecord(tx,actor.companyId,input.recordId,input.kind);if(record.version!==input.expectedVersion)throw new Error('VERSION_CONFLICT');
 const rows=await tx`select id,state from trade_business.file_assets where company_id=${actor.companyId} and id=${input.fileId} and category='origin' and record_kind=${input.kind} and record_id=${record.id}`;
 if(!rows[0])throw new IdentityError('FORBIDDEN');if(active&&rows[0].state!=='stored')throw new Error('FILE_NOT_READY');
 const previous=originIds.parse(record.payload.originCertificateIds??[]),ids=active?[...new Set([...previous,input.fileId])]:previous.filter(id=>id!==input.fileId);originIds.parse(ids);
 await tx`update trade_business.business_records set payload=${tx.json({...record.payload,originCertificateIds:ids})},version=version+1 where company_id=${actor.companyId} and kind=${input.kind} and id=${record.id}`;
 await audit(tx,actor,record.id,active?'origin.attach':'origin.detach',{fileId:input.fileId,kind:input.kind});return {version:record.version+1};
 });}
export const attachOrigin=(actor:BusinessActor,raw:unknown)=>setOrigin(actor,raw,true);
export const detachOrigin=(actor:BusinessActor,raw:unknown)=>setOrigin(actor,raw,false);
export async function listRecordOrigins(actor:BusinessActor,kind:'product'|'supplier',id:string){checkOriginManager(actor,kind);return readBusiness(actor,async tx=>{
 const record=await lookupRecord(tx,actor.companyId,uuid.parse(id),kind),ids=originIds.parse(record.payload.originCertificateIds??[]);
 const rows=await tx`select id,order_id as "orderId",category,record_kind as "recordKind",record_id as "recordId",name,mime,size,sha256,object_path as "objectPath",state,created_by as "createdBy" from trade_business.file_assets where company_id=${actor.companyId} and category='origin' and record_kind=${kind} and record_id=${id} order by (id::text in (select jsonb_array_elements_text(${tx.json(ids)}::jsonb))) desc,created_at desc,id limit 100`;
 return {version:record.version,files:rows.map(row=>{const file=fileRow.parse(row);return {id:file.id,name:file.name,mime:file.mime,size:file.size,state:file.state,active:ids.includes(file.id)};})};
 });}
export async function listOrderOrigins(actor:BusinessActor,id:string){return readBusiness(actor,async tx=>{const order=await lookupOrder(tx,actor,uuid.parse(id));return orderOriginReferences(tx,actor,order);});}
