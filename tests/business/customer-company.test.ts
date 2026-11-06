import {expect,it,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales,operations,customerPayload,companyPayload,productPayload} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const runtime=vi.hoisted(()=>({db:undefined as PGlite|undefined}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{if(!runtime.db)throw new Error('MISSING_ENGINE');return tagged(runtime.db);}}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a,assertActiveCompanyMember:async()=>{},assertOperationsMember:async()=>{}}));
import {saveRecord,listRecords,saveCompany} from '@/server/business/records';
import {createOrder,transitionOrder,getOrderDetail} from '@/server/business/orders';
import {createDocumentDraft,confirmDocument} from '@/server/documents/documents';
import {businessAudit} from '@/server/business/overview';
const req=()=>crypto.randomUUID();
const companyDetails={legalName:'Synthetic Legal Co.',registrationNo:'TEST-REGISTER',registeredAddress:'Synthetic legal address',authorizedSignatory:'Test Signer',invoiceTitle:'Synthetic Invoice Co.',taxId:'TEST-TAX',invoiceAddress:'Synthetic invoice address',invoicePhone:'000',invoiceBankName:'Synthetic Buyer Bank',invoiceBankAccount:'000012345'};
it('persists customer company details through versioned saves, freezes them in invoices/contracts and denies unrelated records/global audit',async()=>{
 runtime.db=await openBusiness(businessMigrations);const db=runtime.db;
 try{
  await saveCompany(admin,{requestId:req(),payload:companyPayload});
  const customer=await saveRecord(sales,{requestId:req(),kind:'customer',payload:{...customerPayload,...companyDetails}});
  const rows=await listRecords(sales,new URLSearchParams({kind:'customer'}));expect(rows.items[0].payload).toMatchObject(companyDetails);
  await saveRecord(sales,{requestId:req(),kind:'customer',id:customer.id,expectedVersion:1,payload:{...customerPayload,phone:'001'}});
  expect((await listRecords(sales,new URLSearchParams({kind:'customer'}))).items[0].payload).toMatchObject(companyDetails);
  expect((await listRecords({...sales,id:crypto.randomUUID()},new URLSearchParams({kind:'customer'}))).items).toHaveLength(0);
  await expect(saveRecord(operations,{requestId:req(),kind:'customer',payload:{...customerPayload,...companyDetails}})).rejects.toThrow('FORBIDDEN');
  const product=await saveRecord(admin,{requestId:req(),kind:'product',payload:productPayload});
  const order=await createOrder(sales,{requestId:req(),customerId:customer.id,currency:'USD',date:'2026-10-25',dueDate:'2026-11-25',deliveryDate:'2026-11-25',validUntil:'2026-11-25',incoterm:'FOB',namedPlace:'TEST',paymentTerms:'TEST',buyerReference:'',lines:[{productId:product.id,quantity:'1',unitPrice:'10'}]});
  const orderId=String(order.id);
  await transitionOrder(sales,{requestId:req(),id:orderId,expectedVersion:1,action:'submit'});
  await transitionOrder(admin,{requestId:req(),id:orderId,expectedVersion:2,action:'confirm'});
  expect((await getOrderDetail(sales,orderId)).snapshot.customer).toMatchObject(companyDetails);
  const pi=await createDocumentDraft(sales,{requestId:req(),orderId,type:'PI'});
  await confirmDocument(admin,{requestId:req(),id:pi.id,expectedVersion:1});
  const terms={signingPlace:'TEST',quality:'TEST',packing:'TEST',shipping:'TEST',inspection:'TEST',insurance:'TEST',breach:'TEST',forceMajeure:'TEST',disputes:'TEST',effectiveness:'TEST',additional:'',status:'unsigned'};
  const sc=await createDocumentDraft(sales,{requestId:req(),orderId,type:'SC',terms});
  const snapshots=async(id:unknown)=>(await db.query<{snapshot:{buyer:Record<string,unknown>;consignee:{name:string};contract?:{status:string}}}>('select snapshot from trade_business.document_versions where document_id=$1 order by version desc limit 1',[id])).rows[0].snapshot;
  expect((await snapshots(pi.id)).buyer).toMatchObject({name:companyDetails.invoiceTitle,address:companyDetails.invoiceAddress,taxId:companyDetails.taxId});
  expect((await snapshots(pi.id)).consignee.name).toBe(customerPayload.name);
  expect((await snapshots(sc.id)).buyer).toMatchObject({name:companyDetails.legalName,address:companyDetails.registeredAddress,authorizedSignatory:companyDetails.authorizedSignatory});
  expect((await snapshots(sc.id)).contract?.status).toBe('unsigned');
  await saveRecord(sales,{requestId:req(),kind:'customer',id:customer.id,expectedVersion:2,payload:{...customerPayload,...companyDetails,invoiceTitle:'Changed after confirmation'}});
  expect((await snapshots(pi.id)).buyer.name).toBe(companyDetails.invoiceTitle);
  const later=await createDocumentDraft(sales,{requestId:req(),orderId,type:'PI'});expect((await snapshots(later.id)).buyer.name).toBe(companyDetails.invoiceTitle);
  await transitionOrder(admin,{requestId:req(),id:orderId,expectedVersion:3,action:'assign',operationsId:operations.id});
  for(const actor of [sales,operations]){await expect(businessAudit(actor)).rejects.toThrow('FORBIDDEN');await expect(businessAudit(actor,orderId)).rejects.toThrow('FORBIDDEN');}
  expect((await businessAudit(admin)).length).toBeGreaterThan(0);
 }finally{runtime.db=undefined;await db.close();}
});
