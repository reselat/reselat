import { describe,it,expect } from 'vitest';
import type {OrderInput,PaymentInput} from '@/modules/workspace/model';
import { initialWorkspace } from '@/modules/workspace/seed';
import { createOrder,recordPayment,getBalance,currencySummary,createShipment,buildTradeDocument,saveDocument,voidPayment } from '@/modules/workspace/operations';
const input:OrderInput={customerId:'customer-1',currency:'USD',date:'2026-10-23',dueDate:'2026-11-01',deliveryDate:'2026-11-10',incoterm:'FOB',namedPlace:'Shanghai',paymentTerms:'30% deposit, 70% before shipment',buyerReference:'TEST-REF',makePurchases:true,purchaseDueDate:'2026-11-05',purchasePaymentTerms:'货到付款',lines:[{productId:'product-1',quantity:'1000',unitPrice:'12.50',supplierId:'supplier-1',costPrice:'40'}]};
describe('input to document and payment workflow',()=>{
 it('creates sales and explicit purchase orders from maintained parties/products',()=>{
  const s=createOrder(initialWorkspace(),input,'order-new');const o=s.orders.find(o=>o.id==='order-new');
  expect(o?.totalMinor).toBe('1250000');expect(o?.customer.name).toContain('Northstar');expect(o?.lines[0]?.description).toContain('connector');
  expect(s.purchases.find(p=>p.orderId==='order-new')?.totalMinor).toBe('4000000');
 });
 it('does not silently rewrite order snapshots when master data changes',()=>{
  const s=createOrder(initialWorkspace(),input,'order-new');s.customers[0].name='Changed';s.products[0].nameEn='Changed';
  expect(s.orders.at(-1)?.customer.name).not.toBe('Changed');expect(s.orders.at(-1)?.lines[0]?.description).not.toBe('Changed');
 });
 it('rejects unknown products, impossible dates and nonpositive quantities',()=>{
  expect(()=>createOrder(initialWorkspace(),{...input,dueDate:'2026-02-30'},'new')).toThrow();
  expect(()=>createOrder(initialWorkspace(),{...input,lines:[{...input.lines[0],productId:'missing'}]},'new')).toThrow();
  expect(()=>createOrder(initialWorkspace(),{...input,lines:[{...input.lines[0],quantity:'0'}]},'new')).toThrow();
 });
 it('records partial receipts, prevents overpayment and preserves currency separation',()=>{
  let s=createOrder(initialWorkspace(),input,'new');s=recordPayment(s,{kind:'sale',refId:'new',amount:'3750',currency:'USD',date:'2026-10-23',reference:'BANK-001',note:'deposit'},'pay-new');
  expect(getBalance(s,'sale','new')).toEqual({total:'1250000',paid:'375000',remaining:'875000',currency:'USD',status:'partial'});
  expect(()=>recordPayment(s,{kind:'sale',refId:'new',amount:'9000',currency:'USD',date:'2026-10-23',reference:'OVER',note:''},'over')).toThrow();
  expect(()=>recordPayment(s,{kind:'sale',refId:'new',amount:'1',currency:'CNY',date:'2026-10-23',reference:'WRONG',note:''},'wrong')).toThrow();
 });
 it('does not double count duplicate receipt commands or bank references',()=>{
  const base=createOrder(initialWorkspace(),input,'new');const p:PaymentInput={kind:'sale',refId:'new',amount:'100',currency:'USD',date:'2026-10-23',reference:'R001',note:''};
  const once=recordPayment(base,p,'pay1');expect(recordPayment(once,p,'pay1').payments.length).toBe(once.payments.length);
  expect(()=>recordPayment(once,{...p,amount:'101'},'pay1')).toThrow();expect(()=>recordPayment(once,p,'pay2')).toThrow();
 });
 it('keeps reversal history and recalculates outstanding amounts',()=>{
  const base=createOrder(initialWorkspace(),input,'new');const s=recordPayment(base,{kind:'sale',refId:'new',amount:'100',currency:'USD',date:'2026-10-23',reference:'R1',note:''},'p');
  const reversed=voidPayment(s,'p','录入错误');expect(reversed.payments.find(p=>p.id==='p')?.voidReason).toBe('录入错误');expect(getBalance(reversed,'sale','new').remaining).toBe('1250000');
 });
 it('groups dashboard balances by currency and detects overdue unpaid orders',()=>{
  const s=createOrder(initialWorkspace(),{...input,date:'2026-10-01',dueDate:'2026-10-20'},'new');const summary=currencySummary(s,'sale','2026-10-23');
  const usd=summary.find(x=>x.currency==='USD');expect(BigInt(usd?.overdue??'0')).toBeGreaterThanOrEqual(1250000n);expect(summary.every(x=>x.currency!=='ALL')).toBe(true);
 });
 it('requires a recorded shipment for CI/PL and rejects shipment over-allocation',()=>{
  const s=createOrder(initialWorkspace(),input,'new');expect(()=>buildTradeDocument(s,'new','CI')).toThrow();
  const shipment={orderId:'new',date:'2026-11-01',portLoad:'Shanghai',portDischarge:'Vancouver',transport:'Sea',lines:[{orderLineId:'new-line-1',quantity:'600',packages:30,netKg:'600',grossKg:'660',cbm:'3.60',marks:'TEST MARK',dimensions:'50 x 40 x 60 cm'}]};
  const s2=createShipment(s,shipment,'ship1');const ci=buildTradeDocument(s2,'ship1','CI');const pl=buildTradeDocument(s2,'ship1','PL');
  expect(ci.totalMinor).toBe('750000');expect(ci.lines[0]?.quantity).toBe('600');expect(pl.lines[0]?.packages).toBe(30);expect(pl.seller.name).toBe(s.company.name);
  expect(()=>createShipment(s2,{...shipment,lines:[{...shipment.lines[0],quantity:'401'}]},'ship2')).toThrow();
 });
 it('generates PI from actual input and stores an immutable version',()=>{
  const s=createOrder(initialWorkspace(),input,'new');const doc=buildTradeDocument(s,'new','PI');const saved=saveDocument(s,doc,'doc1');
  expect(doc.buyerReference).toBe('TEST-REF');expect(doc.namedPlace).toBe('Shanghai');expect(doc.paymentTerms).toContain('30%');
  doc.buyer.name='Changed';expect(saved.documents[0]?.snapshot.buyer.name).not.toBe('Changed');
 });
 it('renders purchase documents in the purchase currency without mixing sales prices',()=>{
  const s=createOrder(initialWorkspace(),input,'new');const p=s.purchases.find(p=>p.orderId==='new');expect(p).toBeDefined();
  const po=buildTradeDocument(s,p!.id,'PO');expect(po.currency).toBe('CNY');expect(po.totalMinor).toBe('4000000');expect(po.lines[0]?.unitPrice).toBe('40');
 });
});
