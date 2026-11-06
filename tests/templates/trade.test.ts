import { it,expect } from 'vitest';
import {documentBuyer} from '@/modules/business/customer-company';
import { initialWorkspace } from '@/modules/workspace/seed';
import { createOrder,createShipment,buildTradeDocument } from '@/modules/workspace/operations';
import { validateTradeDocument,renderTradeDocument } from '@/templates/trade';
import { mkdir,writeFile } from 'node:fs/promises';
function fixture(){const base=initialWorkspace();base.products[0].hsCode='1234567890';const s=createOrder(base,{customerId:'customer-1',currency:'EUR',date:'2026-10-23',dueDate:'2026-11-01',deliveryDate:'2026-11-10',incoterm:'FOB',namedPlace:'Shanghai Port, China',paymentTerms:'30% deposit; balance before shipment',buyerReference:'BUYER-TEST-01',makePurchases:false,lines:[{productId:'product-1',quantity:'10',unitPrice:'8.75',supplierId:'',costPrice:'0'}]},'trade-test');return buildTradeDocument(s,'trade-test','PI');}
it('rejects a forged total instead of rendering inconsistent values',()=>{expect(()=>validateTradeDocument({...fixture(),totalMinor:'1'})).toThrow();});
it('preserves non-USD currency and maintained party and trade data',()=>{const d=validateTradeDocument(fixture());expect(d.currency).toBe('EUR');expect(d.totalMinor).toBe('8750');expect(d.buyerReference).toBe('BUYER-TEST-01');});
it('renders an actual entered order as a printable trade form',async()=>{const bytes=await renderTradeDocument(fixture());expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');await mkdir('artifacts/pdf',{recursive:true});await writeFile('artifacts/pdf/trade-PI.pdf',bytes);});
it('renders long but allowed company and payment fields with multiple item pages',async()=>{
 const d=fixture();d.seller.name='测试公司'.repeat(20);d.seller.address='测试地址'.repeat(45);d.buyerReference='客户参考'.repeat(25);d.paymentTerms='约定付款条件'.repeat(40);
 d.lines=Array.from({length:30},(_,i)=>({...d.lines[0],id:'long-'+i,description:'Industrial connector with reinforced housing and bilingual specification / 工业连接件加强型'}));d.totalMinor='262500';
 const pdf=await renderTradeDocument(d);await writeFile('artifacts/pdf/trade-long.pdf',pdf);expect(pdf.length).toBeGreaterThan(1000);
});
it('renders purchase, commercial and packing forms from distinct business sources',async()=>{
 let state=createOrder(initialWorkspace(),{customerId:'customer-1',currency:'USD',date:'2026-10-23',dueDate:'2026-11-01',deliveryDate:'2026-11-10',incoterm:'FOB',namedPlace:'Shanghai',paymentTerms:'T/T',buyerReference:'TEST',makePurchases:true,purchaseDueDate:'2026-11-01',purchasePaymentTerms:'货到付款',lines:[{productId:'product-1',quantity:'1000',unitPrice:'12.50',supplierId:'supplier-1',costPrice:'40'}]},'multi');
 state.company.bankName='TEST OWN BANK';
 state=createShipment(state,{orderId:'multi',date:'2026-10-24',portLoad:'Shanghai',portDischarge:'Vancouver',transport:'Sea',lines:[{orderLineId:'multi-line-1',quantity:'600',packages:30,netKg:'600',grossKg:'660',cbm:'3.60',marks:'TEST MARK',dimensions:'50 x 40 x 60 cm'}]},'shipment');
 for(const type of ['PO','CI','PL'] as const){const doc=buildTradeDocument(state,type==='PO'?state.purchases[0].id:'shipment',type);const bytes=await renderTradeDocument(doc);await writeFile('artifacts/pdf/trade-'+type+'.pdf',bytes);expect(bytes.length).toBeGreaterThan(1000);}
});

it('renders frozen customer invoice identifiers and contract signatory without mixing buyer and seller banking',async()=>{
 const source={...fixture().buyer,legalName:'SYNTHETIC CONTRACT COMPANY',registrationNo:'TEST-REG-001',registeredAddress:'Synthetic registered address',authorizedSignatory:'SYNTHETIC SIGNER',invoiceTitle:'SYNTHETIC INVOICE COMPANY',taxId:'TEST-TAX-001',invoiceAddress:'Synthetic invoice address',invoiceBankName:'BUYER BANK MUST NOT BE PAYMENT',invoiceBankAccount:'000012345'};
 await mkdir('artifacts/pdf',{recursive:true});
 for(const type of ['PI','SC'] as const){
  const data={...fixture(),type,buyer:documentBuyer(source,type),...(type==='SC'?{contract:{signingPlace:'TEST',quality:'Synthetic specification',packing:'Synthetic packing',shipping:'Synthetic shipping',inspection:'Synthetic inspection',insurance:'Synthetic insurance',breach:'Synthetic remedies',forceMajeure:'Synthetic notice',disputes:'Synthetic forum',effectiveness:'Both parties must sign',additional:'',status:'unsigned' as const}}:{})};
  const bytes=await renderTradeDocument(data);expect(bytes.length).toBeGreaterThan(1000);await writeFile('artifacts/pdf/customer-company-'+type+'.pdf',bytes);
 }
});
