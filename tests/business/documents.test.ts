import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales,operations,customerPayload,productPayload,companyPayload} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const runtime=vi.hoisted(()=>{const state:{db:PGlite|undefined;objects:Map<string,Uint8Array>;failBeforeUpload:boolean;delayBegin:number;release:(()=>void)|null;waiting:(()=>void)|null}={db:undefined,objects:new Map(),failBeforeUpload:false,delayBegin:0,release:null,waiting:null};return state;});
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{if(!runtime.db)throw new Error('MISSING_ENGINE');const sql=tagged(runtime.db),begin=sql.begin;return Object.assign(sql,{begin:async<T>(fn:(tx:Parameters<Parameters<typeof begin>[0]>[0])=>Promise<T>)=>{if(runtime.delayBegin>0&&--runtime.delayBegin===0)await new Promise<void>(resolve=>{runtime.release=resolve;runtime.waiting?.();});return begin(fn);}});}}));
vi.mock('@/server/auth/member-directory',()=>({assertOperationsMember:async()=>{},assertSalesOwner:async()=>{},rereadEmployee:async(a:unknown)=>a,assertActiveCompanyMember:async()=>{}}));
vi.mock('@/server/files/storage',()=>({getBusinessStorage:async()=>({upload:async(path:string,bytes:Uint8Array)=>{if(runtime.failBeforeUpload)throw new Error('STORAGE_UNKNOWN');if(runtime.objects.has(path))throw new Error('STORAGE_ALREADY_EXISTS');runtime.objects.set(path,bytes);},download:async(path:string)=>{const data=runtime.objects.get(path);if(!data)throw new Error('STORAGE_NOT_FOUND');return data;}})}));
import {saveRecord,saveCompany} from '../../src/server/business/records';
import {createOrder,transitionOrder,getOrderDetail} from '../../src/server/business/orders';
import {createDocumentDraft,confirmDocument,generateDocument,downloadDocument} from '../../src/server/documents/documents';
import {registerSignature,grantSignature,prepareSignatureUsage} from '../../src/server/documents/signatures';
import {createInternalUploadIntent,uploadFile,downloadFile} from '../../src/server/files/files';
import {setOrderSupplier} from '../../src/server/business/suppliers';
import {createPurchases,transitionPurchase,recordReceipt} from '../../src/server/business/purchases';
import {createShipment,transitionShipment} from '../../src/server/business/shipments';
import {reviseCustoms} from '../../src/server/business/customs';
import {getRefundReadiness,reviewRefundItem,exportRefundPack} from '../../src/server/refunds/refunds';
import {refundKey} from '../../src/modules/business/refund-schema';
import {voidDocument} from '../../src/server/documents/documents';
import {z} from 'zod';
let orderId='';const requestId=()=>crypto.randomUUID();
beforeEach(async()=>{runtime.db=await openBusiness(businessMigrations);runtime.objects.clear();runtime.failBeforeUpload=false;runtime.delayBegin=0;runtime.release=null;runtime.waiting=null;await saveCompany(admin,{requestId:requestId(),payload:companyPayload});
 const customer=await saveRecord(sales,{requestId:requestId(),kind:'customer',payload:customerPayload}),product=await saveRecord(admin,{requestId:requestId(),kind:'product',payload:productPayload});
 const order=await createOrder(sales,{requestId:requestId(),customerId:customer.id,currency:'USD',date:'2026-10-25',dueDate:'2026-11-25',deliveryDate:'2026-11-25',validUntil:'2026-11-25',incoterm:'FOB',namedPlace:'TEST',paymentTerms:'TEST',buyerReference:'',lines:[{productId:product.id,quantity:'2',unitPrice:'1'}]});orderId=String(order.id);
 await transitionOrder(sales,{id:orderId,expectedVersion:1,action:'submit',requestId:requestId()});await transitionOrder(admin,{id:orderId,expectedVersion:2,action:'confirm',requestId:requestId()});await transitionOrder(admin,{id:orderId,expectedVersion:3,action:'assign',operationsId:operations.id,requestId:requestId()});
});
afterEach(async()=>{await runtime.db?.close();runtime.db=undefined;});
it('requires confirmation rights and stores immutable PDF bytes once',async()=>{
 const draft=await createDocumentDraft(sales,{orderId,type:'PI',requestId:requestId()});const id=String(draft.id);
 await expect(confirmDocument(sales,{id,expectedVersion:1,requestId:requestId()})).rejects.toThrow('FORBIDDEN');
 await confirmDocument(admin,{id,expectedVersion:1,requestId:requestId()});await generateDocument(admin,id);
 const original=await downloadDocument(sales,id);await mkdir('artifacts/pdf',{recursive:true});await writeFile('artifacts/pdf/shared-PI.pdf',original.bytes);expect(new TextDecoder().decode(original.bytes.subarray(0,5))).toBe('%PDF-');
 await saveCompany(admin,{requestId:requestId(),payload:{...companyPayload,name:'Changed after confirmation'}});
 await generateDocument(admin,id);const second=await downloadDocument(sales,id);
 expect(createHash('sha256').update(second.bytes).digest('hex')).toBe(createHash('sha256').update(original.bytes).digest('hex'));expect(runtime.objects.size).toBe(1);
});
it('binds signature use to a granted employee, purpose and document version',async()=>{
 const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3r8AAAAASUVORK5CYII=','base64'));
 const intent=await createInternalUploadIntent(admin,{requestId:requestId(),orderId:null,category:'signature',name:'synthetic.png',mime:'image/png',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});await uploadFile(admin,String(intent.id),bytes);
 const asset=await registerSignature(admin,{requestId:requestId(),fileId:intent.id,name:'Synthetic only'});const signatureId=String(asset.id);
 const draft=await createDocumentDraft(operations,{orderId,type:'PI',requestId:requestId()});const id=String(draft.id);
 await expect(prepareSignatureUsage(operations,{requestId:requestId(),id,expectedVersion:1,signatureId})).rejects.toThrow('SIGNATURE_FORBIDDEN');
 await grantSignature(admin,{requestId:requestId(),id:signatureId,expectedVersion:1,userId:operations.id,purpose:'PI',enabled:true});
 const usage=await prepareSignatureUsage(operations,{requestId:requestId(),id,expectedVersion:1,signatureId});
 await grantSignature(admin,{requestId:requestId(),id:signatureId,expectedVersion:2,userId:operations.id,purpose:'PI',enabled:false});
 await expect(confirmDocument(operations,{requestId:requestId(),id,expectedVersion:1,signatureUsageIntentId:usage.id})).rejects.toThrow('SIGNATURE_FORBIDDEN');
 await grantSignature(admin,{requestId:requestId(),id:signatureId,expectedVersion:3,userId:operations.id,purpose:'PI',enabled:true});
 await expect(confirmDocument(operations,{requestId:requestId(),id,expectedVersion:1,signatureUsageIntentId:usage.id})).rejects.toThrow('SIGNATURE_FORBIDDEN');
 const refreshed=await prepareSignatureUsage(operations,{requestId:requestId(),id,expectedVersion:1,signatureId});await confirmDocument(operations,{requestId:requestId(),id,expectedVersion:1,signatureUsageIntentId:refreshed.id});
 await generateDocument(operations,id);expect((await downloadDocument(sales,id)).bytes.length).toBeGreaterThan(1000);
 await expect(downloadFile(sales,String(intent.id))).rejects.toThrow('FORBIDDEN');
});

it('blocks source revision and cancellation until formal documents are voided',async()=>{
 const draft=await createDocumentDraft(admin,{orderId,type:'PI',requestId:requestId()});await confirmDocument(admin,{id:draft.id,expectedVersion:1,requestId:requestId()});
 await expect(transitionOrder(admin,{id:orderId,expectedVersion:4,action:'revise',reason:'Synthetic correction',requestId:requestId()})).rejects.toThrow('DEPENDENCIES_EXIST');
 await expect(transitionOrder(admin,{id:orderId,expectedVersion:4,action:'cancel',reason:'Synthetic cancellation',requestId:requestId()})).rejects.toThrow('DEPENDENCIES_EXIST');
});
it('recovers an associated PDF whose upload never started',async()=>{
 const draft=await createDocumentDraft(admin,{orderId,type:'PI',requestId:requestId()});const id=String(draft.id);await confirmDocument(admin,{id,expectedVersion:1,requestId:requestId()});
 runtime.failBeforeUpload=true;await expect(generateDocument(admin,id)).rejects.toThrow('FILE_NOT_READY');expect(runtime.objects.size).toBe(0);
 runtime.failBeforeUpload=false;await generateDocument(admin,id);expect((await downloadDocument(admin,id)).bytes.length).toBeGreaterThan(1000);expect(runtime.objects.size).toBe(1);
});

it('keeps refund archives frozen, detects stale customs PDFs and blocks void PDF downloads',async()=>{
 let detail=await getOrderDetail(admin,orderId);const lineId=detail.lines[0].id;
 const customs={hsCode:'1234567890',taxCommodityCode:'1234567890',refundRate:'13',declarationName:'Synthetic',declarationElements:'Synthetic',classificationSource:'Synthetic verification',classificationDate:'2026-10-25',classificationStatus:'reviewed'};
 await reviseCustoms(admin,{requestId:requestId(),orderId,lineId,expectedVersion:detail.order.version,reason:'Synthetic initial review',customs});
 detail=await getOrderDetail(admin,orderId);const supplier=await saveRecord(admin,{requestId:requestId(),kind:'supplier',payload:{...customerPayload,name:'Synthetic supplier'}});await setOrderSupplier(admin,{requestId:requestId(),orderId,supplierId:supplier.id,expectedVersion:detail.order.version,enabled:true});
 const purchase=await createPurchases(operations,{requestId:requestId(),orderId,orderVersion:detail.order.sourceVersion,groups:[{supplierId:supplier.id,currency:'CNY',date:'2026-10-25',dueDate:'2026-11-25',paymentTerms:'TEST',lines:[{orderLineId:lineId,quantity:'2',unitCost:'1'}]}]});const purchaseId=z.array(z.string()).parse(purchase.ids)[0];await transitionPurchase(operations,{requestId:requestId(),id:purchaseId,expectedVersion:1,action:'submit'});await transitionPurchase(admin,{requestId:requestId(),id:purchaseId,expectedVersion:2,action:'confirm'});
 const po=await createDocumentDraft(admin,{requestId:requestId(),orderId,type:'PO',purchaseId});await confirmDocument(admin,{requestId:requestId(),id:po.id,expectedVersion:1});await generateDocument(admin,String(po.id));await mkdir('artifacts/pdf',{recursive:true});await writeFile('artifacts/pdf/shared-PO.pdf',(await downloadDocument(admin,String(po.id))).bytes);await expect(transitionPurchase(admin,{requestId:requestId(),id:purchaseId,expectedVersion:3,action:'cancel',reason:'Synthetic'})).rejects.toThrow('DEPENDENCIES_EXIST');
 detail=await getOrderDetail(admin,orderId);expect(JSON.stringify((await getOrderDetail(operations,orderId)).purchases)).not.toContain('TEST ONLY');
 const receipt=await recordReceipt(operations,{requestId:requestId(),purchaseId,date:'2026-10-25',lines:[{purchaseLineId:detail.purchases[0].lines[0].id,quantity:'2'}]});const receiptId=z.array(z.string()).parse(receipt.lineIds)[0];
 const shipment=await createShipment(operations,{requestId:requestId(),orderId,date:'2026-10-25',portLoad:'TEST A',portDischarge:'TEST B',transport:'SEA',lines:[{orderLineId:lineId,quantity:'2',packages:1,netKg:'1',grossKg:'2',cbm:'1',marks:'TEST',dimensions:'TEST',sources:[{receiptLineId:receiptId,quantity:'2'}]}]});await transitionShipment(admin,{requestId:requestId(),id:shipment.id,expectedVersion:1,action:'confirm'});
 let ciId='';for(const type of ['CI','PL']){const doc=await createDocumentDraft(admin,{requestId:requestId(),orderId,type,shipmentId:shipment.id});await confirmDocument(admin,{requestId:requestId(),id:doc.id,expectedVersion:1});await generateDocument(admin,String(doc.id));await writeFile('artifacts/pdf/shared-'+type+'.pdf',(await downloadDocument(admin,String(doc.id))).bytes);if(type==='CI')ciId=String(doc.id);}
 for(const key of refundKey.options)await reviewRefundItem(admin,{requestId:requestId(),orderId,key,expectedVersion:0,status:'not_applicable',reference:'',reason:'Synthetic mechanical test only',fileIds:[]});expect((await getRefundReadiness(admin,orderId)).complete).toBe(true);
 const command={requestId:requestId(),orderId,format:'zip'};const exported=await exportRefundPack(admin,command);expect(await exportRefundPack(admin,command)).toEqual(exported);
 detail=await getOrderDetail(admin,orderId);await reviseCustoms(admin,{requestId:requestId(),orderId,lineId,expectedVersion:detail.order.version,reason:'Synthetic correction',customs:{...customs,hsCode:'1234567891'}});const report=await getRefundReadiness(admin,orderId);expect(report.complete).toBe(false);expect(report.warnings.some(w=>w.includes('归类资料已过期'))).toBe(true);
 const pdf=await downloadDocument(admin,ciId);await voidDocument(admin,{requestId:requestId(),id:ciId,expectedVersion:2,reason:'Synthetic correction'});await expect(downloadDocument(admin,ciId)).rejects.toThrow('FILE_NOT_READY');const history=await downloadDocument(admin,ciId,true);expect(history.bytes).toEqual(pdf.bytes);expect(history.name).toMatch(/^VOID-/);await expect(createDocumentDraft(admin,{requestId:requestId(),orderId,type:'PI',correctionOf:ciId})).rejects.toThrow('INVALID_INPUT');const correction=await createDocumentDraft(admin,{requestId:requestId(),orderId,type:'CI',shipmentId:shipment.id,correctionOf:ciId});expect(correction.id).not.toBe(ciId);
});

it('restores synthetic database and private objects together with unchanged downloadable hashes',async()=>{
 const draft=await createDocumentDraft(admin,{orderId,type:'PI',requestId:requestId()}),id=String(draft.id);await confirmDocument(admin,{id,expectedVersion:1,requestId:requestId()});await generateDocument(admin,id);const before=await downloadDocument(admin,id);
 if(!runtime.db)throw new Error('MISSING_ENGINE');const database=await runtime.db.dumpDataDir(),objects=new Map([...runtime.objects].map(([path,bytes])=>[path,bytes.slice()]));await runtime.db.close();runtime.db=new PGlite({loadDataDir:database});await runtime.db.exec('set role business_backend');runtime.objects=objects;
 expect((await downloadDocument(admin,id)).bytes).toEqual(before.bytes);expect(runtime.objects.size).toBe(1);
});

it('does not regress a PDF stored while a previous request was waiting to claim',async()=>{
 const draft=await createDocumentDraft(admin,{orderId,type:'PI',requestId:requestId()}),id=String(draft.id);await confirmDocument(admin,{id,expectedVersion:1,requestId:requestId()});
 let arrived:(()=>void)|undefined;const waiting=new Promise<void>(resolve=>{arrived=resolve;});runtime.waiting=()=>arrived?.();runtime.delayBegin=2;
 const delayed=generateDocument(admin,id);await waiting;await generateDocument(admin,id);const before=await downloadDocument(admin,id);runtime.release?.();await delayed;expect((await downloadDocument(admin,id)).bytes).toEqual(before.bytes);expect(runtime.objects.size).toBe(1);
});

it('renders an official unsigned sales contract with explicit frozen terms',async()=>{
 const terms={signingPlace:'TEST',quality:'Synthetic specification',packing:'Synthetic packing',shipping:'Synthetic shipping',inspection:'Synthetic inspection',insurance:'Synthetic insurance',breach:'Synthetic remedies',forceMajeure:'Synthetic notice',disputes:'Synthetic forum for testing',effectiveness:'Synthetic signatures required',additional:'Synthetic only',status:'unsigned'};
 const draft=await createDocumentDraft(admin,{orderId,type:'SC',requestId:requestId(),terms});await confirmDocument(admin,{id:draft.id,expectedVersion:1,requestId:requestId()});await generateDocument(admin,String(draft.id));await mkdir('artifacts/pdf',{recursive:true});await writeFile('artifacts/pdf/shared-SC.pdf',(await downloadDocument(sales,String(draft.id))).bytes);
});
