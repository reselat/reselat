import type {Party,DocumentType} from '@/modules/workspace/model';
export const customerCompanyKeys=['legalName','registrationNo','registeredAddress','authorizedSignatory','invoiceTitle','taxId','invoiceAddress','invoicePhone','invoiceBankName','invoiceBankAccount'];
export function documentBuyer(party:Party,type:DocumentType):Party {
 if(type==='SC')return {...party,name:party.legalName||party.name,address:party.registeredAddress||party.address};
 if(type==='PI'||type==='CI')return {...party,name:party.invoiceTitle||party.legalName||party.name,address:party.invoiceAddress||party.registeredAddress||party.address,phone:party.invoicePhone||party.phone};
 return {...party};
}
export function documentBuyerLines(party:Party,type:DocumentType):string[] {
 return [party.name,party.address,party.country,party.contact,party.email,party.phone,
  type==='SC'&&party.registrationNo?'Registration No.: '+party.registrationNo:'',
  (type==='PI'||type==='CI')&&party.taxId?'Tax ID: '+party.taxId:'',
 ].filter(Boolean);
}
