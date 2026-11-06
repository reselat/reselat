import {it,expect} from 'vitest';
import {initialWorkspace} from '@/modules/workspace/seed';
import {createOrder,createShipment,buildTradeDocument} from '@/modules/workspace/operations';
import {partySchema,companySchema,type OrderInput} from '@/modules/workspace/model';
import {validateTradeDocument,paymentInstructionLines} from '@/templates/trade';
const input:OrderInput={customerId:'customer-1',currency:'USD',date:'2026-10-23',dueDate:'2026-11-01',deliveryDate:'2026-11-01',incoterm:'FOB',namedPlace:'Shanghai',paymentTerms:'T/T',buyerReference:'',makePurchases:false,lines:[{productId:'product-1',quantity:'2',unitPrice:'0.335',supplierId:'',costPrice:'0'}]};
it('allocates split shipment rounding so summed CI equals sales receivable',()=>{
 let s=createOrder(initialWorkspace(),input,'round');
 const sh={orderId:'round',date:'2026-10-24',portLoad:'Shanghai',portDischarge:'Vancouver',transport:'Sea',lines:[{orderLineId:'round-line-1',quantity:'1',packages:1,netKg:'1',grossKg:'2',cbm:'0.1',marks:'TEST',dimensions:'10x10x10 cm'}]};
 s=createShipment(s,sh,'a');s=createShipment(s,sh,'b');const a=buildTradeDocument(s,'a','CI'),b=buildTradeDocument(s,'b','CI');
 expect(a.totalMinor).toBe('34');expect(b.totalMinor).toBe('33');expect(BigInt(a.totalMinor)+BigInt(b.totalMinor)).toBe(67n);
 expect(b.lines[0]?.roundingAdjustmentMinor).toBe('-1');
 for(const type of ['CI','PL'] as const)expect(()=>validateTradeDocument(buildTradeDocument(s,'b',type))).not.toThrow();
});
it('does not identify our own purchaser as the purchase order beneficiary',()=>{
 const base=initialWorkspace();base.company.bankName='TEST BUYER BANK';
 const s=createOrder(base,{...input,makePurchases:true,purchaseDueDate:'2026-11-01',purchasePaymentTerms:'货到付款',lines:[{...input.lines[0],supplierId:'supplier-1',costPrice:'1'}]},'purchase');
 const po=buildTradeDocument(s,s.purchases[0].id,'PO');expect(paymentInstructionLines(po).join(' ')).not.toContain('TEST BUYER BANK');expect(paymentInstructionLines(po).join(' ')).not.toContain('Beneficiary');
});
it('rejects unprintable master field lengths before freezing an order',()=>{
 const s=initialWorkspace();expect(partySchema.safeParse({...s.customers[0],address:'A'.repeat(201)}).success).toBe(false);
 expect(companySchema.safeParse({...s.company,name:'A'.repeat(121)}).success).toBe(false);
 s.customers[0].address='A'.repeat(201);expect(()=>createOrder(s,input,'bad')).toThrow();
});
