import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales,operations,companyPayload,customerPayload,productPayload} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const runtime=vi.hoisted(()=>({db:undefined as PGlite|undefined,objects:new Map<string,Uint8Array>()}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{if(!runtime.db)throw new Error('MISSING_ENGINE');return tagged(runtime.db);}}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a,assertActiveCompanyMember:async()=>{},assertOperationsMember:async()=>{}}));
vi.mock('@/server/files/storage',()=>({getBusinessStorage:async()=>({upload:async(path:string,bytes:Uint8Array)=>{if(runtime.objects.has(path))throw new Error('STORAGE_ALREADY_EXISTS');runtime.objects.set(path,bytes);},download:async(path:string)=>{const bytes=runtime.objects.get(path);if(!bytes)throw new Error('STORAGE_NOT_FOUND');return bytes;}})}));
import {saveCompany,saveRecord} from '@/server/business/records';
import {createPurchases} from '@/server/business/purchases';
import {createDocumentDraft} from '@/server/documents/documents';
import {createOrder,getOrderDetail,transitionOrder} from '@/server/business/orders';
import {uploadChunk,finishUpload} from '@/server/files/chunks';
import {createUploadIntent,downloadFile,uploadFile} from '@/server/files/files';
import {attachOrigin,detachOrigin,listRecordOrigins,listOrderOrigins} from '@/server/files/origins';
const req=()=>crypto.randomUUID(),bytes=new TextEncoder().encode('%PDF-1.4\nSynthetic CO only\n%%EOF');
let productId='',customerId='',supplierId='';
beforeEach(async()=>{runtime.db=await openBusiness(businessMigrations);runtime.objects.clear();await saveCompany(admin,{requestId:req(),payload:companyPayload});supplierId=String((await saveRecord(admin,{requestId:req(),kind:'supplier',payload:{...customerPayload,referenceCode:'SUP-TEST'}})).id);productId=String((await saveRecord(admin,{requestId:req(),kind:'product',payload:{...productPayload,supplierId,hsCode:'1234567890'}})).id);customerId=String((await saveRecord(sales,{requestId:req(),kind:'customer',payload:{...customerPayload,referenceCode:'CUST-TEST'}})).id);});
afterEach(async()=>{await runtime.db?.close();runtime.db=undefined;});
async function certificate(kind:'product'|'supplier',recordId:string){const file=await createUploadIntent(admin,{requestId:req(),orderId:null,category:'origin',recordKind:kind,recordId,name:'synthetic-CO.pdf',mime:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});await uploadFile(admin,String(file.id),bytes);return String(file.id);}
async function order(type:'normal'|'sample'='sample'){return String((await createOrder(sales,{requestId:req(),customerId,orderType:type,currency:'USD',date:'2026-10-25',dueDate:'2026-11-25',deliveryDate:'2026-11-25',validUntil:'2026-11-25',incoterm:'FOB',namedPlace:'TEST',paymentTerms:'TEST',lines:[{productId,quantity:'1',unitPrice:'1'}]})).id);}
it('links immutable product and supplier CO files to the frozen order without granting master-file access to sales',async()=>{
 const productFile=await certificate('product',productId),supplierFile=await certificate('supplier',supplierId);
 await attachOrigin(admin,{requestId:req(),kind:'product',recordId:productId,fileId:productFile,expectedVersion:1});await attachOrigin(admin,{requestId:req(),kind:'supplier',recordId:supplierId,fileId:supplierFile,expectedVersion:1});
 const id=await order();const detail=await getOrderDetail(sales,id);expect(detail.snapshot.header.orderType).toBe('sample');expect(detail.snapshot.header.buyerReference).toBe('CUST-TEST');expect(detail.lines[0].snapshot.hsCode).toBe('1234567890');
 expect((await listOrderOrigins(sales,id)).map(f=>f.id).sort()).toEqual([productFile,supplierFile].sort());
 await expect(downloadFile(sales,productFile)).rejects.toThrow('FORBIDDEN');expect((await downloadFile(sales,productFile,false,undefined,id)).bytes).toEqual(bytes);
 await expect(downloadFile({...sales,id:crypto.randomUUID()},productFile,false,undefined,id)).rejects.toThrow('FORBIDDEN');
 await transitionOrder(sales,{requestId:req(),id,expectedVersion:1,action:'submit'});await mkdir('artifacts/ui-co',{recursive:true});await writeFile('artifacts/ui-co/submitted-order.json',JSON.stringify(await getOrderDetail(admin,id)));await writeFile('artifacts/ui-co/order-origins.json',JSON.stringify(await listOrderOrigins(admin,id)));await transitionOrder(admin,{requestId:req(),id,expectedVersion:2,action:'confirm'});
 await detachOrigin(admin,{requestId:req(),kind:'product',recordId:productId,fileId:productFile,expectedVersion:2});
 expect((await listRecordOrigins(admin,'product',productId)).files.find(f=>f.id===productFile)?.active).toBe(false);expect((await listOrderOrigins(sales,id)).map(f=>f.id)).toContain(productFile);expect((await downloadFile(sales,productFile,false,undefined,id)).bytes).toEqual(bytes);
});
it('rejects unrelated files, sales uploads, cross-company access and stale association changes',async()=>{
 const fileId=await certificate('product',productId);
 await expect(attachOrigin(admin,{requestId:req(),kind:'supplier',recordId:supplierId,fileId,expectedVersion:1})).rejects.toThrow('FORBIDDEN');
 await expect(attachOrigin(sales,{requestId:req(),kind:'product',recordId:productId,fileId,expectedVersion:1})).rejects.toThrow('FORBIDDEN');
 await expect(attachOrigin({...admin,companyId:crypto.randomUUID()},{requestId:req(),kind:'product',recordId:productId,fileId,expectedVersion:1})).rejects.toThrow();
 await attachOrigin(admin,{requestId:req(),kind:'product',recordId:productId,fileId,expectedVersion:1});
 await expect(detachOrigin(admin,{requestId:req(),kind:'product',recordId:productId,fileId,expectedVersion:1})).rejects.toThrow('VERSION_CONFLICT');
 await expect(listRecordOrigins(sales,'product',productId)).rejects.toThrow('FORBIDDEN');
 await expect(listRecordOrigins(operations,'supplier',supplierId)).rejects.toThrow('FORBIDDEN');
 const id=await order('normal');await expect(downloadFile(sales,await certificate('supplier',supplierId),false,undefined,id)).rejects.toThrow('FORBIDDEN');
});
it('requires both master association columns at the database boundary',async()=>{
 const db=runtime.db;if(!db)throw new Error('MISSING_ENGINE');
 await expect(db.query("insert into trade_business.file_assets(company_id,id,category,record_id,name,mime,size,sha256,object_path,created_by) values($1,$2,'origin',$3,'scope.pdf','application/pdf',12,$4,$5,$6)",[admin.companyId,req(),productId,'a'.repeat(64),'synthetic-invalid/'+req(),admin.id])).rejects.toThrow();
});

it('uses the normal chunked upload and rejects forged master pointers or an unarchived attachment',async()=>{
 const input={requestId:req(),orderId:null,category:'origin',recordKind:'product',recordId:productId,name:'synthetic-chunk-CO.pdf',mime:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const file=await createUploadIntent(operations,input),fileId=String(file.id);
 await expect(attachOrigin(operations,{requestId:req(),kind:'product',recordId:productId,fileId,expectedVersion:1})).rejects.toThrow('FILE_NOT_READY');
 await uploadChunk(operations,fileId,0,bytes);await finishUpload(operations,fileId);await attachOrigin(operations,{requestId:req(),kind:'product',recordId:productId,fileId,expectedVersion:1});
 expect((await listRecordOrigins(operations,'product',productId)).files[0].active).toBe(true);
 await expect(saveRecord(admin,{requestId:req(),kind:'product',id:productId,expectedVersion:2,payload:{...productPayload,originCertificateIds:[req()]}})).rejects.toThrow('FORBIDDEN');
 await expect(createUploadIntent(sales,{...input,requestId:req()})).rejects.toThrow('FORBIDDEN');
});

it('includes the actual procurement supplier CO and its reference without exposing procurement documents to sales',async()=>{
 const supplier=await saveRecord(admin,{requestId:req(),kind:'supplier',payload:{...customerPayload,name:'Actual synthetic supplier',referenceCode:'SUP-ACTUAL'}}),sid=String(supplier.id),fileId=await certificate('supplier',sid);
 await attachOrigin(admin,{requestId:req(),kind:'supplier',recordId:sid,fileId,expectedVersion:1});
 const id=await order();await transitionOrder(sales,{requestId:req(),id,expectedVersion:1,action:'submit'});await transitionOrder(admin,{requestId:req(),id,expectedVersion:2,action:'confirm'});const detail=await getOrderDetail(admin,id);
 const purchase=await createPurchases(admin,{requestId:req(),orderId:id,orderVersion:detail.order.sourceVersion,groups:[{supplierId:sid,currency:'CNY',date:'2026-10-25',dueDate:'2026-11-25',paymentTerms:'TEST',lines:[{orderLineId:detail.lines[0].id,quantity:'1',unitCost:'4'}]}]});
 expect((await listOrderOrigins(sales,id)).map(f=>f.id)).toContain(fileId);expect((await downloadFile(sales,fileId,false,undefined,id)).bytes).toEqual(bytes);
 await detachOrigin(admin,{requestId:req(),kind:'supplier',recordId:sid,fileId,expectedVersion:2});expect((await listOrderOrigins(sales,id)).map(f=>f.id)).toContain(fileId);
 const po=await createDocumentDraft(admin,{requestId:req(),orderId:id,type:'PO',purchaseId:z.array(z.string().uuid()).parse(purchase.ids)[0]});const db=runtime.db;if(!db)throw new Error('MISSING_ENGINE');
 const row=await db.query<{snapshot:{buyerReference:string}}>('select snapshot from trade_business.document_versions where document_id=$1',[po.id]);expect(row.rows[0].snapshot.buyerReference).toBe('SUP-ACTUAL');
 await expect(createDocumentDraft(sales,{requestId:req(),orderId:id,type:'PO',purchaseId:z.array(z.string().uuid()).parse(purchase.ids)[0]})).rejects.toThrow('FORBIDDEN');
});
