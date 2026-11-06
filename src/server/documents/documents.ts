import {touchUpload} from '@/server/files/lifecycle';
import {z} from 'zod';
import {documentBuyer} from '@/modules/business/customer-company';
import {createHash} from 'node:crypto';
import {uuid,version} from '@/modules/business/schemas';
import {tradeDocumentSchema,contractTermsSchema,documentLineSchema,currencyScale,type TradeDocument} from '@/modules/workspace/model';
import {lineAmountMinor} from '@/domain/money';
import {IdentityError} from '@/server/auth/employee';
import {runBusinessCommand,nextNumber,audit,type BusinessTx} from '@/server/business/commands';
import {lookupOrder,orderSnapshot,readBusiness,expectVersion,requireState} from '@/server/business/order-data';
import {purchaseRows} from '@/server/business/purchases';
import {shipmentRows} from '@/server/business/shipments';
import {effectiveCustoms} from '@/server/business/customs';
import type {BusinessActor} from '@/server/business/access';
import {createInternalUploadIntent,uploadFile,reconcileFile,recoverGeneratedFile,downloadFile,lookupFile} from '@/server/files/files';
import {renderTradeDocument} from '@/templates/trade';
import {reportArtifactFailure,type ArtifactStage} from './diagnostics';
import {documentType,lookupDocument,type DocumentRow} from './data';
import {signatureBytes,validateSignatureUsage} from './signatures';
const create=z.object({requestId:uuid,orderId:uuid,type:documentType,purchaseId:uuid.optional(),shipmentId:uuid.optional(),terms:contractTermsSchema.optional(),correctionOf:uuid.optional()}).strict().refine(v=>v.type!=='PO'||!!v.purchaseId).refine(v=>!['CI','PL'].includes(v.type)||!!v.shipmentId).refine(v=>v.type!=='SC'||!!v.terms);
async function build(tx:BusinessTx,actor:BusinessActor,doc:DocumentRow,number:string,official:boolean):Promise<TradeDocument>{
 const order=await lookupOrder(tx,actor,doc.orderId);if(official)requireState(order.state,['confirmed','fulfilling','completed']);const frozen=await orderSnapshot(tx,actor,order);
 let seller=frozen.seller,buyer=frozen.customer,lines=frozen.lines,currency=order.currency,totalMinor=frozen.totalMinor,paymentTerms=frozen.header.paymentTerms,date=frozen.header.date,shipmentNo='',portLoad='',portDischarge='',transport='';
 const revised:TradeDocument['lines']=[];for(const line of lines)revised.push({...line,...await effectiveCustoms(tx,actor,line.id,line)});lines=revised;
 if(doc.type==='PO'){
  const purchase=(await purchaseRows(tx,actor,order.id)).find(p=>p.id===doc.purchaseId);if(!purchase)throw new Error('NOT_FOUND');if(official)requireState(purchase.state,['confirmed']);
  const payload=z.object({supplier:z.unknown(),seller:z.unknown(),paymentTerms:z.string().trim().min(1)}).parse(purchase.payload);
  const {partySchema,companySchema}=await import('@/modules/workspace/model');buyer=partySchema.parse(payload.supplier);seller=companySchema.parse(payload.seller);paymentTerms=payload.paymentTerms;currency=purchase.currency;date=purchase.day;totalMinor=purchase.totalMinor;
  lines=purchase.lines.map(item=>documentLineSchema.parse({...item.snapshot,id:item.id,quantity:item.quantity,unitPrice:item.unitCost,amountMinor:item.amountMinor,packages:0,netKg:'0',grossKg:'0',cbm:'0',marks:'',dimensions:'',roundingAdjustmentMinor:'0'}));
 }
 if(doc.type==='CI'||doc.type==='PL'){
  const shipment=(await shipmentRows(tx,actor,order.id)).find(s=>s.id===doc.shipmentId);if(!shipment)throw new Error('NOT_FOUND');requireState(shipment.state,['confirmed']);
  const payload=z.object({portLoad:z.string(),portDischarge:z.string(),transport:z.string()}).parse(shipment.payload);({portLoad,portDischarge,transport}=payload);date=shipment.day;shipmentNo=shipment.no;totalMinor=shipment.totalMinor;
  lines=shipment.lines.map(item=>{const source=revised.find(l=>l.id===item.orderLineId);if(!source)throw new Error('NOT_FOUND');return documentLineSchema.parse({...source,...item.payload,id:item.id,quantity:item.quantity,amountMinor:item.amountMinor,roundingAdjustmentMinor:(BigInt(item.amountMinor)-lineAmountMinor(item.quantity,source.unitPrice,currencyScale[currency])).toString()});});
 }
 const consignee=buyer;buyer=documentBuyer(buyer,doc.type);
 return tradeDocumentSchema.parse({type:doc.type,number,date,sourceId:doc.purchaseId??doc.shipmentId??order.id,orderNo:order.no,seller,buyer,consignee,currency,lines,totalMinor,incoterm:frozen.header.incoterm,namedPlace:frozen.header.namedPlace,paymentTerms,buyerReference:doc.type==='PO'?(buyer.referenceCode??''):frozen.header.buyerReference,deliveryDate:frozen.header.deliveryDate,validUntil:frozen.header.validUntil,portLoad,portDischarge,transport,shipmentNo,templateVersion:'trade-v2',...(doc.type==='SC'?{contract:contractTermsSchema.parse(doc.terms)}:{})});
}
export async function createDocumentDraft(actor:BusinessActor,raw:unknown){const input=create.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'document.draft',payload:input},async tx=>{
 if(input.type==='PO'&&actor.role==='sales')throw new IdentityError('FORBIDDEN');await lookupOrder(tx,actor,input.orderId,actor.role==='operations'?'fulfill':'write');const id=crypto.randomUUID();
 const doc:DocumentRow={id,orderId:input.orderId,type:input.type,purchaseId:input.type==='PO'?(input.purchaseId??null):null,shipmentId:['CI','PL'].includes(input.type)?(input.shipmentId??null):null,state:'draft',version:1,terms:input.terms??null};
 if(input.correctionOf){const original=await lookupDocument(tx,actor,input.correctionOf);if(original.doc.state!=='void'||original.doc.orderId!==doc.orderId||original.doc.type!==doc.type||original.doc.purchaseId!==doc.purchaseId||original.doc.shipmentId!==doc.shipmentId)throw new Error('INVALID_INPUT');}
 const value=await build(tx,actor,doc,'DRAFT-'+id.slice(0,8),false);
 await tx`insert into trade_business.documents(company_id,id,order_id,type,purchase_id,shipment_id,terms,correction_of,created_by) values(${actor.companyId},${id},${doc.orderId},${doc.type},${doc.purchaseId},${doc.shipmentId},${input.terms?tx.json(input.terms):null},${input.correctionOf??null},${actor.id})`;
 await tx`insert into trade_business.document_versions(company_id,id,document_id,version,no,official,snapshot) values(${actor.companyId},${crypto.randomUUID()},${id},1,${value.number},false,${tx.json(value)})`;await audit(tx,actor,id,'document.draft');return {id,version:1};
 });}
const confirm=z.object({requestId:uuid,id:uuid,expectedVersion:version,signatureUsageIntentId:uuid.optional()}).strict();
export async function confirmDocument(actor:BusinessActor,raw:unknown){const input=confirm.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'document.confirm',payload:input},async tx=>{
 const {doc,order}=await lookupDocument(tx,actor,input.id);expectVersion(doc.version,input.expectedVersion);requireState(doc.state,['draft']);
 if(actor.role==='admin')await lookupOrder(tx,actor,order.id,'confirm');else if(actor.role==='operations'&&input.signatureUsageIntentId)await lookupOrder(tx,actor,order.id,'fulfill');else throw new IdentityError('FORBIDDEN');
 const usage=input.signatureUsageIntentId?await validateSignatureUsage(tx,actor,doc,input.signatureUsageIntentId):null;
 const no=await nextNumber(tx,actor.companyId,doc.type,order.day),value=await build(tx,actor,doc,no,true),versionId=crypto.randomUUID();
 await tx`insert into trade_business.document_versions(company_id,id,document_id,version,no,official,snapshot,signature_usage_id) values(${actor.companyId},${versionId},${doc.id},${doc.version+1},${no},true,${tx.json(value)},${usage?.id??null})`;
 if(usage)await tx`update trade_business.signature_usages set state='used',document_version_id=${versionId} where company_id=${actor.companyId} and id=${usage.id}`;
 await tx`insert into trade_business.document_jobs(company_id,version_id) values(${actor.companyId},${versionId})`;
 await tx`update trade_business.documents set state='confirmed',version=version+1 where company_id=${actor.companyId} and id=${doc.id}`;
 await tx`insert into trade_business.order_document_locks(company_id,order_id,document_id) values(${actor.companyId},${order.id},${doc.id})`;
 if(doc.purchaseId)await tx`insert into trade_business.purchase_document_locks(company_id,purchase_id,document_id) values(${actor.companyId},${doc.purchaseId},${doc.id})`;
 if(doc.shipmentId)await tx`insert into trade_business.shipment_document_locks(company_id,shipment_id,document_id) values(${actor.companyId},${doc.shipmentId},${doc.id})`;
 await audit(tx,actor,doc.id,'document.confirm',{version:doc.version+1,signed:!!usage});return {id:doc.id,version:doc.version+1,versionId};
 });}
const storedVersion=z.object({id:uuid,version:z.number().int(),no:z.string(),official:z.boolean(),snapshot:tradeDocumentSchema,phase:z.enum(['pending','rendering','stored','needs_reconciliation']),fileId:uuid.nullable(),createdAt:z.string(),signatureUsageId:uuid.nullable()});
async function currentVersion(tx:BusinessTx,actor:BusinessActor,id:string){const {doc}=await lookupDocument(tx,actor,id);const rows=await tx`select id,version,no,official,snapshot,phase,file_id as "fileId",created_at::text as "createdAt",signature_usage_id as "signatureUsageId" from trade_business.document_versions where company_id=${actor.companyId} and document_id=${doc.id} and version=${doc.version}`;if(!rows[0])throw new Error('NOT_FOUND');return {doc,value:storedVersion.parse(rows[0])};}
export async function generateDocument(actor:BusinessActor,id:string){let initial=await readBusiness(actor,tx=>currentVersion(tx,actor,id));requireState(initial.doc.state,['confirmed']);if(initial.value.phase==='stored')return {id};
 // A durable claim excludes parallel renders. A stale claim is recoverable explicitly after its lease expires.
 const claimId=crypto.randomUUID();const claimed=await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'document.claim',payload:{id}},async tx=>{
  const current=await currentVersion(tx,actor,id);requireState(current.doc.state,['confirmed']);if(current.value.phase==='stored')return {id,stored:true};const claims=await tx`update trade_business.document_jobs set claim_id=${claimId},claim_until=now()+interval '2 minutes' where company_id=${actor.companyId} and version_id=${current.value.id} and (claim_until is null or claim_until<now()) returning version_id`;
  if(!claims.length)throw new Error('FILE_NOT_READY');await tx`update trade_business.document_versions set phase='rendering' where company_id=${actor.companyId} and id=${current.value.id}`;return {id,stored:false};
 });
 if(claimed.stored)return {id};initial=await readBusiness(actor,tx=>currentVersion(tx,actor,id));
 let stage:ArtifactStage='signature';const render=async()=>{stage='signature';const signature=initial.value.signatureUsageId?await signatureBytes(actor,id,initial.value.id):undefined;stage='render';return renderTradeDocument(initial.value.snapshot,{mode:'confirmed',version:initial.value.version,createdAt:initial.value.createdAt,signature});};
 let fileId=initial.value.fileId;
 try{
  if(fileId)await recoverGeneratedFile(actor,fileId,render);
  else{
   const bytes=await render();
   stage='intent';const created=await createInternalUploadIntent(actor,{requestId:crypto.randomUUID(),orderId:initial.doc.orderId,category:initial.doc.type==='PO'?'purchase':'document',name:initial.value.no+'.pdf',mime:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});fileId=uuid.parse(created.id);
   stage='associate';await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'document.file-intent',payload:{id,fileId}},async tx=>{await touchUpload(tx,actor,uuid.parse(fileId));await lookupDocument(tx,actor,id);const claims=await tx`select claim_id from trade_business.document_jobs where company_id=${actor.companyId} and version_id=${initial.value.id}`;if(claims[0]?.claim_id!==claimId)throw new Error('FILE_NOT_READY');const updated=await tx`update trade_business.document_versions set file_id=${fileId} where company_id=${actor.companyId} and id=${initial.value.id} and file_id is null returning id`;if(!updated.length)throw new Error('FILE_NOT_READY');return {id};});
   stage='upload';try{await uploadFile(actor,fileId,bytes);}catch{await reconcileFile(actor,fileId);}
  }
  stage='complete';await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'document.stored',payload:{id,fileId}},async tx=>{
   const current=await currentVersion(tx,actor,id);requireState(current.doc.state,['confirmed']);const file=await lookupFile(tx,actor,uuid.parse(fileId));if(current.value.fileId!==fileId||file.orderId!==current.doc.orderId||file.state!=='stored')throw new Error('FILE_NOT_READY');
   const claims=await tx`select claim_id from trade_business.document_jobs where company_id=${actor.companyId} and version_id=${current.value.id}`;if(claims[0]?.claim_id!==claimId)throw new Error('FILE_NOT_READY');
   await tx`update trade_business.document_versions set phase='stored' where company_id=${actor.companyId} and id=${current.value.id}`;await tx`update trade_business.document_jobs set claim_id=null,claim_until=null where company_id=${actor.companyId} and version_id=${current.value.id}`;await audit(tx,actor,id,'document.stored');return {id};
  });return {id};
 }catch(error){
  reportArtifactFailure('document.generate',stage,error);await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'document.reconcile',payload:{id}},async tx=>{await lookupDocument(tx,actor,id);const owner=await tx`select claim_id from trade_business.document_jobs where company_id=${actor.companyId} and version_id=${initial.value.id}`;if(owner[0]?.claim_id!==claimId)return {id};await tx`update trade_business.document_versions set phase='needs_reconciliation' where company_id=${actor.companyId} and id=${initial.value.id} and phase<>'stored'`;await tx`update trade_business.document_jobs set claim_id=null,claim_until=null where company_id=${actor.companyId} and version_id=${initial.value.id} and claim_id=${claimId}`;return {id};});
  throw new Error('FILE_NOT_READY');
 }
}
export async function downloadDocument(actor:BusinessActor,id:string,history=false){const current=await readBusiness(actor,tx=>currentVersion(tx,actor,id));
 if(current.doc.state==='draft'){const bytes=await renderTradeDocument(current.value.snapshot,{mode:'draft',version:current.value.version,createdAt:current.value.createdAt});return {bytes,name:current.value.no+'.pdf',mime:'application/pdf'};}
 if((current.doc.state==='void'&&!history)||current.value.phase!=='stored'||!current.value.fileId)throw new Error('FILE_NOT_READY');const result=await downloadFile(actor,current.value.fileId,false,current.doc.state==='void'?id:undefined);return {...result,name:(current.doc.state==='void'?'VOID-':'')+result.name};
}
export async function voidDocument(actor:BusinessActor,raw:unknown){const input=z.object({requestId:uuid,id:uuid,expectedVersion:version,reason:z.string().trim().min(1).max(500)}).strict().parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'document.void',payload:input},async tx=>{
 const {doc}=await lookupDocument(tx,actor,input.id);await lookupOrder(tx,actor,doc.orderId,'confirm');expectVersion(doc.version,input.expectedVersion);requireState(doc.state,['draft','confirmed']);
 await tx`update trade_business.documents set state='void' where company_id=${actor.companyId} and id=${doc.id}`;await tx`update trade_business.order_document_locks set active=false where company_id=${actor.companyId} and document_id=${doc.id}`;await tx`update trade_business.purchase_document_locks set active=false where company_id=${actor.companyId} and document_id=${doc.id}`;await tx`update trade_business.shipment_document_locks set active=false where company_id=${actor.companyId} and document_id=${doc.id}`;await audit(tx,actor,doc.id,'document.void');return {id:doc.id};
 });}
export async function listDocuments(actor:BusinessActor,orderId:string){return readBusiness(actor,async tx=>{
 const order=await lookupOrder(tx,actor,uuid.parse(orderId));const rows=await tx`select d.id,d.type,d.state,d.version,d.correction_of as "correctionOf",v.no,v.phase,(v.signature_usage_id is not null) as "imageApplied" from trade_business.documents d join trade_business.document_versions v on v.company_id=d.company_id and v.document_id=d.id and v.version=d.version where d.company_id=${actor.companyId} and d.order_id=${orderId} and (${actor.role==='admin'} or d.type<>'PO' or (${actor.role==='operations'} and ${order.operationsId===actor.id})) order by d.created_at desc,d.id`;
 return z.array(z.object({id:uuid,type:documentType,state:z.string(),version:z.number().int(),no:z.string(),phase:z.string(),imageApplied:z.boolean(),correctionOf:uuid.nullable()})).parse(rows);
 });}
