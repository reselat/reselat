import {z} from 'zod';
import {prepareShipment} from '@/modules/business/shipment-form';
import {mkdir,writeFile} from 'node:fs/promises';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales,operations,companyId,customerPayload,productPayload,companyPayload} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const engines=vi.hoisted(()=>new Map<string,PGlite>());
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{const db=engines.get('business');if(!db)throw new Error('MISSING_ENGINE');return tagged(db);}}));
vi.mock('@/server/auth/member-directory',()=>({assertOperationsMember:async()=>{},assertSalesOwner:async()=>{},rereadEmployee:async(actor:{enabled:boolean;archivedAt?:string|null})=>{if(!actor.enabled||actor.archivedAt)throw new Error('FORBIDDEN');return actor;},assertActiveCompanyMember:async(company:string,id:string)=>{if(company!==companyId||![admin.id,sales.id,operations.id].includes(id))throw new Error('FORBIDDEN');}}));
import {saveRecord,saveCompany} from '../../src/server/business/records';
import {createOrder,transitionOrder,getOrderDetail} from '../../src/server/business/orders';
import {setOrderSupplier} from '../../src/server/business/suppliers';
import {createPurchases,transitionPurchase,recordReceipt} from '../../src/server/business/purchases';
import {createShipment,transitionShipment} from '../../src/server/business/shipments';
import {submitPayment,transitionPayment} from '../../src/server/business/payments';
import {addFollowup,setCustomerAccess,previewTransfer,transferCustomer} from '../../src/server/business/customers';
import {dashboard,collectionRows} from '../../src/server/business/overview';
const requestId=()=>crypto.randomUUID();
let customerId='',productId='',supplierId='';
const draft=()=>({requestId:requestId(),customerId,currency:'USD',date:'2026-10-25',dueDate:'2026-11-25',deliveryDate:'2026-11-25',validUntil:'2026-11-25',incoterm:'FOB',namedPlace:'TEST PORT',paymentTerms:'30 days',buyerReference:'TEST',lines:[{productId,quantity:'10',unitPrice:'1.2345'}]});
beforeEach(async()=>{
 const db=await openBusiness(businessMigrations);engines.set('business',db);
 await saveCompany(admin,{requestId:requestId(),payload:companyPayload});
 customerId=String((await saveRecord(sales,{requestId:requestId(),kind:'customer',payload:customerPayload})).id);
 productId=String((await saveRecord(admin,{requestId:requestId(),kind:'product',payload:productPayload})).id);
 supplierId=String((await saveRecord(admin,{requestId:requestId(),kind:'supplier',payload:{...customerPayload,name:'Synthetic supplier'}})).id);
});
afterEach(async()=>{const db=engines.get('business');engines.clear();await db?.close();});
async function confirmed(){const created=await createOrder(sales,draft());const id=String(created.id);await transitionOrder(sales,{id,expectedVersion:1,action:'submit',requestId:requestId()});await transitionOrder(admin,{id,expectedVersion:2,action:'confirm',requestId:requestId()});await transitionOrder(admin,{id,expectedVersion:3,action:'assign',operationsId:operations.id,requestId:requestId()});return getOrderDetail(admin,id);}

it('freezes server prices, blocks read-only shares, stale writes and unauthorized confirmation',async()=>{
 const input=draft(),created=await createOrder(sales,input);expect(await createOrder(sales,input)).toEqual(created);
 const id=String(created.id),detail=await getOrderDetail(sales,id);expect(detail.order.totalMinor).toBe('1235');
 await expect(transitionOrder(sales,{id,expectedVersion:1,action:'confirm',requestId:requestId()})).rejects.toThrow('FORBIDDEN');
 await expect(createOrder(sales,{...draft(),id,expectedVersion:99})).rejects.toThrow('VERSION_CONFLICT');
 await setCustomerAccess(admin,{customerId,userId:operations.id,enabled:true,expectedVersion:1,requestId:requestId()});
 await expect(createOrder(operations,draft())).rejects.toThrow('FORBIDDEN');
 await expect(getOrderDetail({...sales,companyId:crypto.randomUUID()},id)).rejects.toThrow();
});
it('moves unfinished orders with customer ownership and refuses old transfer previews',async()=>{
 const created=await createOrder(sales,draft()),id=String(created.id);
 const preview=await previewTransfer(admin,customerId,admin.id);
 await addFollowup(sales,{customerId,date:'2026-10-25',note:'Synthetic note',nextDate:'2026-11-01',expectedVersion:1,requestId:requestId()});
 await expect(transferCustomer(admin,{customerId,targetUserId:admin.id,previewVersion:preview.version,requestId:requestId()})).rejects.toThrow('VERSION_CONFLICT');
 const current=await previewTransfer(admin,customerId,admin.id);
 await transferCustomer(admin,{customerId,targetUserId:admin.id,previewVersion:current.version,requestId:requestId()});
 await expect(getOrderDetail(sales,id)).rejects.toThrow('FORBIDDEN');
 expect((await getOrderDetail(admin,id)).order.ownerId).toBe(admin.id);
});
it('runs purchase, receipts, two shipments and payment reversal with quantity and amount protection',async()=>{
 const detail=await confirmed(),orderId=detail.order.id,lineId=detail.lines[0].id;
 await setOrderSupplier(admin,{orderId,supplierId,expectedVersion:detail.order.version,enabled:true,requestId:requestId()});
 const input={orderId,orderVersion:detail.order.sourceVersion,requestId:requestId(),groups:[{supplierId,currency:'CNY',date:'2026-10-25',dueDate:'2026-11-25',paymentTerms:'TEST',lines:[{orderLineId:lineId,quantity:'10',unitCost:'2'}]}]};
 const created=await createPurchases(operations,input);expect(await createPurchases(operations,input)).toEqual(created);
 await expect(createPurchases(operations,{...input,requestId:requestId()})).rejects.toThrow('QUANTITY_EXCEEDED');
 const purchaseId=z.array(z.string()).parse(created.ids)[0];await transitionPurchase(operations,{id:purchaseId,expectedVersion:1,action:'submit',requestId:requestId()});
 await transitionPurchase(admin,{id:purchaseId,expectedVersion:2,action:'confirm',requestId:requestId()});
 let updated=await getOrderDetail(admin,orderId);const purchaseLineId=updated.purchases[0].lines[0].id;
 const receipt=await recordReceipt(operations,{purchaseId,date:'2026-10-25',requestId:requestId(),lines:[{purchaseLineId,quantity:'10'}]});
 await expect(recordReceipt(operations,{purchaseId,date:'2026-10-25',requestId:requestId(),lines:[{purchaseLineId,quantity:'1'}]})).rejects.toThrow('QUANTITY_EXCEEDED');
 const shipment=(quantity:string)=>({orderId,date:'2026-10-25',portLoad:'TEST A',portDischarge:'TEST B',transport:'SEA',requestId:requestId(),lines:[{orderLineId:lineId,quantity,packages:1,netKg:'1',grossKg:'2',cbm:'1',marks:'TEST',dimensions:'TEST',sources:[{receiptLineId:z.array(z.string()).parse(receipt.lineIds)[0],quantity}]}]});
 const browserForm=new FormData();for(const [key,value] of Object.entries({date:'2026-10-25',portLoad:'TEST A',portDischarge:'TEST B',transport:'SEA'}))browserForm.set(key,value);browserForm.set('source_'+z.array(z.string()).parse(receipt.lineIds)[0],'4');for(const [key,value] of Object.entries({packages:'1',netKg:'1',grossKg:'2',cbm:'1',marks:'TEST',dimensions:'30*30*30'}))browserForm.set(key+'_'+lineId,value);
 const first=await createShipment(operations,{...prepareShipment(await getOrderDetail(admin,orderId),browserForm),requestId:requestId()});await transitionShipment(admin,{id:String(first.id),expectedVersion:1,action:'confirm',requestId:requestId()});
 const second=await createShipment(operations,shipment('6'));await transitionShipment(admin,{id:String(second.id),expectedVersion:1,action:'confirm',requestId:requestId()});
 await expect(createShipment(operations,shipment('1'))).rejects.toThrow('QUANTITY_EXCEEDED');
 updated=await getOrderDetail(admin,orderId);expect(updated.shipments.reduce((n,s)=>n+BigInt(s.totalMinor),0n)).toBe(1235n);
 const paid=await submitPayment(sales,{kind:'sale',refId:orderId,amount:'12.35',currency:'USD',date:'2026-10-25',reference:'TEST-1',note:'TEST',requestId:requestId()});
 await transitionPayment(admin,{id:String(paid.id),expectedVersion:1,action:'confirm',requestId:requestId()});
 const excess=await submitPayment(sales,{kind:'sale',refId:orderId,amount:'0.01',currency:'USD',date:'2026-10-25',reference:'TEST-2',note:'TEST',requestId:requestId()});
 await expect(transitionPayment(admin,{id:String(excess.id),expectedVersion:1,action:'confirm',requestId:requestId()})).rejects.toThrow('AMOUNT_EXCEEDED');
 const beforeCompletion=await dashboard(sales,'2026-12-01');expect(beforeCompletion.balances.USD.receivable).toBe('0');expect(beforeCompletion.balances.CNY).toBeUndefined();expect((await collectionRows(operations,'shipments',new URLSearchParams())).items).toHaveLength(2);
 await transitionPayment(admin,{id:String(excess.id),expectedVersion:1,action:'void',reason:'Synthetic rejected excess',requestId:requestId()});
 const purchasePaid=await submitPayment(admin,{kind:'purchase',refId:purchaseId,amount:'20.00',currency:'CNY',date:'2026-10-25',reference:'TEST-PURCHASE-1',note:'TEST',requestId:requestId()});await transitionPayment(admin,{id:String(purchasePaid.id),expectedVersion:1,action:'confirm',requestId:requestId()});
 updated=await getOrderDetail(admin,orderId);await transitionOrder(admin,{id:orderId,expectedVersion:updated.order.version,action:'complete',requestId:requestId()});
 await expect(transitionShipment(admin,{id:String(second.id),expectedVersion:2,action:'cancel',reason:'Synthetic',requestId:requestId()})).rejects.toThrow('INVALID_TRANSITION');
 updated=await getOrderDetail(admin,orderId);await transitionOrder(admin,{id:orderId,expectedVersion:updated.order.version,action:'reopen',reason:'Synthetic correction',requestId:requestId()});
 await transitionPayment(admin,{id:String(paid.id),expectedVersion:2,action:'void',reason:'Synthetic reversal',requestId:requestId()});
 expect((await getOrderDetail(sales,orderId)).payments.some(p=>p.state==='void')).toBe(true);
 expect((await getOrderDetail(sales,orderId)).purchases).toHaveLength(0);await mkdir('artifacts/ui-co',{recursive:true});await writeFile('artifacts/ui-co/full-order.json',JSON.stringify(await getOrderDetail(admin,orderId)));
});

it('splits procurement by supplier and currency, releases a cancelled reservation exactly once',async()=>{
 const detail=await confirmed(),orderId=detail.order.id,lineId=detail.lines[0].id;
 const otherSupplier=await saveRecord(admin,{requestId:requestId(),kind:'supplier',payload:{...customerPayload,name:'Second synthetic supplier'}});
 for(const supplier of [supplierId,String(otherSupplier.id)]){const latest=await getOrderDetail(admin,orderId);await setOrderSupplier(admin,{requestId:requestId(),orderId,supplierId:supplier,expectedVersion:latest.order.version,enabled:true});}
 const group=(supplierId:string,currency:string,quantity:string)=>({supplierId,currency,date:'2026-10-25',dueDate:'2026-11-25',paymentTerms:'TEST',lines:[{orderLineId:lineId,quantity,unitCost:'1'}]});
 const split=await createPurchases(operations,{requestId:requestId(),orderId,orderVersion:detail.order.sourceVersion,groups:[group(supplierId,'CNY','4'),group(String(otherSupplier.id),'EUR','6')]});const ids=z.array(z.string()).parse(split.ids);expect(ids).toHaveLength(2);
 const cancellation={requestId:requestId(),id:ids[0],expectedVersion:1,action:'cancel',reason:'Synthetic reallocation'};expect(await transitionPurchase(operations,cancellation)).toEqual(await transitionPurchase(operations,cancellation));
 await createPurchases(operations,{requestId:requestId(),orderId,orderVersion:detail.order.sourceVersion,groups:[group(supplierId,'CNY','4')]});
 await expect(createPurchases(operations,{requestId:requestId(),orderId,orderVersion:detail.order.sourceVersion,groups:[group(supplierId,'CNY','0.0001')]})).rejects.toThrow('QUANTITY_EXCEEDED');
 await expect(transitionPurchase(operations,{...cancellation,requestId:requestId()})).rejects.toThrow('VERSION_CONFLICT');
 await expect(saveRecord(admin,{requestId:requestId(),kind:'product',payload:{...productPayload,supplierId:crypto.randomUUID()}})).rejects.toThrow('NOT_FOUND');
});
