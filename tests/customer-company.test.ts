import {expect,it} from 'vitest';
import {partySchema} from '@/modules/workspace/model';
import {projectFields} from '@/server/business/access';
import {documentBuyer,documentBuyerLines} from '@/modules/business/customer-company';
const base={id:'synthetic-customer',name:'Synthetic Customer',address:'Synthetic business address',country:'TEST',email:'synthetic@example.test',phone:'000',contact:'Test contact'};
const details={legalName:'Synthetic Registered Co.',registrationNo:'TEST-REG-001',registeredAddress:'Synthetic registered address',authorizedSignatory:'Synthetic Signer',invoiceTitle:'Synthetic Billing Co.',taxId:'TEST-TAX-001',invoiceAddress:'Synthetic billing address',invoicePhone:'001',invoiceBankName:'Synthetic Buyer Bank',invoiceBankAccount:'000012345'};
it('preserves optional company fields and accepts existing customer records unchanged',()=>{
 expect(partySchema.parse({...base,...details})).toMatchObject(details);
 expect(partySchema.parse(base)).toEqual(base);
 expect(partySchema.safeParse({...base,invoiceBankAccount:'x'.repeat(101)}).success).toBe(false);
});
it('exposes customer company details through existing scoped reads without exposing unrelated banking or procurement fields',()=>{
 for(const role of ['sales','operations'] as const){
  expect(projectFields({...base,...details,bankAccount:'PRIVATE_OWN_BANK',costPrice:'999'},role,'customer')).toMatchObject(details);
  expect(projectFields({...base,...details,bankAccount:'PRIVATE_OWN_BANK',costPrice:'999'},role,'customer')).not.toHaveProperty('bankAccount');
  expect(projectFields({...base,...details,costPrice:'999'},role,'customer')).not.toHaveProperty('costPrice');
  expect(projectFields({...base,...details},role,'product')).not.toHaveProperty('invoiceBankAccount');
 }
});
it('selects contract and invoice identities independently while keeping procurement and packing identities unchanged',()=>{
 const customer={...base,...details};
 expect(documentBuyer(customer,'SC')).toMatchObject({name:details.legalName,address:details.registeredAddress});
 expect(documentBuyer(customer,'PI')).toMatchObject({name:details.invoiceTitle,address:details.invoiceAddress,phone:details.invoicePhone});
 expect(documentBuyer(customer,'CI').name).toBe(details.invoiceTitle);
 for(const type of ['PL','PO'] as const)expect(documentBuyer(customer,type)).toEqual(customer);
 expect(customer.name).toBe(base.name);
 expect(documentBuyer(base,'SC')).toEqual(base);
 expect(documentBuyer(base,'PI')).toEqual(base);
});
it('prints tax and registration identifiers only in relevant documents, never customer bank details as seller payment instructions',()=>{
 expect(documentBuyerLines({...base,...details},'PI')).toContain('Tax ID: TEST-TAX-001');
 expect(documentBuyerLines({...base,...details},'SC')).toContain('Registration No.: TEST-REG-001');
 expect(documentBuyerLines({...base,...details},'PL').join('\n')).not.toContain('Tax ID');
 expect(documentBuyerLines({...base,...details},'PI').join('\n')).not.toContain(details.invoiceBankAccount);
});
