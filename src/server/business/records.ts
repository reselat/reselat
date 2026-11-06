import {z} from 'zod';
import {readBusiness} from './order-data';
import {suggestCustomerStage} from '@/modules/business/customer-stage';
import {IdentityError} from '@/server/auth/employee';
import {assertScope,projectFields,type BusinessActor} from './access';
import {runBusinessCommand,audit,type BusinessTx} from './commands';
import {partySchema,productSchema,customsSchema,companySchema} from '@/modules/workspace/model';
import {uuid,version,decimal,commandMeta} from '@/modules/business/schemas';
export const recordCommand=z.object({...commandMeta,id:uuid.optional(),expectedVersion:version.optional(),kind:z.enum(['customer','product','supplier']),payload:z.record(z.string(),z.unknown()),review:z.boolean().optional()}).strict();
const rowSchema=z.object({id:uuid,companyId:uuid,ownerId:uuid.nullable(),kind:z.enum(['customer','product','supplier']),payload:z.record(z.string(),z.unknown()),version:z.number().int(),reviewedAt:z.string().nullable(),customerCode:z.string().nullable().optional()});
export async function lookupRecord(tx:BusinessTx,companyId:string,id:string,kind:'customer'|'product'|'supplier'){
 const rows=await tx`select id,company_id as "companyId",owner_id as "ownerId",kind,payload,version,customer_code as "customerCode",reviewed_at::text as "reviewedAt" from trade_business.business_records where company_id=${companyId} and id=${id} and kind=${kind}`;
 if(!rows[0])throw new Error('NOT_FOUND');return rowSchema.parse(rows[0]);
}
export async function recordScope(tx:BusinessTx,actor:BusinessActor,id:string){const row=await lookupRecord(tx,actor.companyId,id,'customer');const shares=await tx`select user_id from trade_business.record_shares where company_id=${actor.companyId} and kind='customer' and record_id=${id}`;return {...row,sharedWith:shares.map(r=>String(r.user_id))};}
export async function saveRecord(actor:BusinessActor,raw:unknown){const input=recordCommand.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'record.save',payload:input},async tx=>{return saveRecordInTransaction(tx,actor,input);
 });}
export async function saveRecordInTransaction(tx:BusinessTx,actor:BusinessActor,input:z.infer<typeof recordCommand>){
 if('customerCode' in input.payload||'customer_code' in input.payload)throw new IdentityError('FORBIDDEN');
 if('originCertificateIds' in input.payload)throw new IdentityError('FORBIDDEN');
 const id=input.id??crypto.randomUUID();let previous:Awaited<ReturnType<typeof lookupRecord>>|undefined;
 if(input.id){previous=await lookupRecord(tx,actor.companyId,id,input.kind);if(previous.version!==input.expectedVersion)throw new Error('VERSION_CONFLICT');}
 if(input.kind==='customer'){if(actor.role==='operations')throw new IdentityError('FORBIDDEN');if(previous)assertScope(actor,await recordScope(tx,actor,id),'write');}
 else if(input.kind==='supplier'){if(actor.role!=='admin')throw new IdentityError('FORBIDDEN');}
 else if(actor.role==='sales')throw new IdentityError('FORBIDDEN');
 const payload=input.kind==='product'?productSchema.parse({supplierId:'',costPrice:'0',purchaseCurrency:'CNY',...previous?.payload,...input.payload,...(actor.role==='operations'?{classificationStatus:'pending'}:{}),id}):partySchema.parse({...previous?.payload,...input.payload,id});
 if(input.kind==='product'){
  const product=productSchema.parse(payload);decimal.parse(product.unitPrice);decimal.parse(product.costPrice);if(product.supplierId)await lookupRecord(tx,actor.companyId,uuid.parse(product.supplierId),'supplier');const info=customsSchema.parse(payload);if(actor.role!=='admin'&&(input.review||info.classificationStatus==='reviewed'||'costPrice' in input.payload||'supplierId' in input.payload||'purchaseCurrency' in input.payload))throw new IdentityError('FORBIDDEN');
  if(info.classificationStatus==='reviewed'&&!input.review)throw new Error('REVIEW_REQUIRED');if(input.review&&info.classificationStatus!=='reviewed')throw new Error('REVIEW_REQUIRED');
 }
 const reviewed=input.kind==='product'&&input.review===true;
 if(previous)await tx`update trade_business.business_records set payload=${tx.json(payload)},version=version+1,reviewed_by=${reviewed?actor.id:null},reviewed_at=${reviewed?new Date():null} where company_id=${actor.companyId} and id=${id} and kind=${input.kind}`;
 else{let customerCode:string|null=null;if(input.kind==='customer'){const rows=await tx`insert into trade_business.number_counters(company_id,kind,value) values(${actor.companyId},'CUSTOMER_CODE',1) on conflict(company_id,kind) do update set value=trade_business.number_counters.value+1 returning value::text`;const value=String(rows[0].value);if(value.length>8)throw new Error('CUSTOMER_CODE_LIMIT');customerCode='CUS-'+value.padStart(8,'0');}await tx`insert into trade_business.business_records(id,company_id,kind,owner_id,payload,reviewed_by,reviewed_at,customer_code) values(${id},${actor.companyId},${input.kind},${actor.id},${tx.json(payload)},${reviewed?actor.id:null},${reviewed?new Date():null},${customerCode})`;}
 await audit(tx,actor,id,'record.save',{kind:input.kind});return {id};
}
export async function listRecords(actor:BusinessActor,params:URLSearchParams){const kind=z.enum(['customer','product','supplier']).parse(params.get('kind'));if(kind==='supplier'&&actor.role!=='admin')throw new IdentityError('FORBIDDEN');const offset=z.coerce.number().int().min(0).max(100000).parse(params.get('offset')??0),search=(params.get('search')||'').slice(0,100);
 return readBusiness(actor,async db=>{const rows=await db`select r.id,r.company_id as "companyId",r.owner_id as "ownerId",r.kind,r.payload,r.version,r.customer_code as "customerCode",r.reviewed_at::text as "reviewedAt" from trade_business.business_records r where r.company_id=${actor.companyId} and r.kind=${kind} and (${search}='' or position(lower(${search}) in lower(coalesce(r.payload->>'name','')||coalesce(r.payload->>'nameEn','')||coalesce(r.payload->>'nameZh','')||coalesce(r.payload->>'sku','')||coalesce(r.customer_code,'')))>0) and (${actor.role==='admin'} or r.kind='product' or (${actor.role==='sales'} and r.owner_id=${actor.id}) or exists(select 1 from trade_business.record_shares s where s.company_id=r.company_id and s.kind=r.kind and s.record_id=r.id and s.user_id=${actor.id})) order by r.created_at,r.id limit 51 offset ${offset}`;
 return {items:rows.slice(0,50).map(row=>{const r=rowSchema.parse(row);return {...r,payload:projectFields(r.payload,actor.role,r.kind)};}),hasMore:rows.length>50};});}
export async function getCompany(actor:BusinessActor){return readBusiness(actor,async db=>{const rows=await db`select legal_profile from trade_business.company_profiles where id=${actor.companyId}`;const company=companySchema.safeParse(rows[0]?.legal_profile);if(!company.success)return null;return actor.role==='admin'?company.data:{...company.data,bankAccount:'',bankName:'',swift:''};});}
export async function saveCompany(actor:BusinessActor,input:{requestId:string;payload:unknown}){if(actor.role!=='admin')throw new IdentityError('FORBIDDEN');const payload=companySchema.parse(input.payload);return runBusinessCommand(actor,{requestId:input.requestId,kind:'company.save',payload},async tx=>{await tx`update trade_business.company_profiles set legal_profile=${tx.json(payload)} where id=${actor.companyId}`;await audit(tx,actor,actor.companyId,'company.save');return {saved:true};});}

export async function customerStageSuggestion(actor:BusinessActor,id:string){return readBusiness(actor,async tx=>{const scope=await recordScope(tx,actor,uuid.parse(id));assertScope(actor,scope,'read');const rows=await tx`select day::text,coalesce(payload->>'orderType','normal')='sample' as sample from trade_business.orders where company_id=${actor.companyId} and customer_id=${id} and state='completed' order by day,id`;return suggestCustomerStage(z.array(z.object({day:z.string(),sample:z.boolean()})).parse(rows));});}

export async function getCustomer(actor:BusinessActor,id:string){return readBusiness(actor,async tx=>{const row=await recordScope(tx,actor,uuid.parse(id));assertScope(actor,row,'read');const {sharedWith,...record}=row;return {...record,payload:projectFields(row.payload,actor.role,'customer')};});}
