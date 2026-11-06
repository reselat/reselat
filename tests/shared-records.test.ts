import {it,expect} from 'vitest';
import {projectRecord} from '@/server/workspace/records';
const sales={id:'u',companyId:'c',role:'sales' as const,enabled:true,version:1};
const record={id:'r',companyId:'c',ownerId:'other',kind:'customer' as const,payload:{name:'TEST',costPrice:'900',bankAccount:'TEST ONLY'}};
it('does not return private procurement fields in a sales product DTO',()=>{const projected=projectRecord(sales,{...record,kind:'product',payload:{nameEn:'TEST',costPrice:'900',supplierId:'s',purchaseCurrency:'CNY',unitPrice:'100'}});expect(projected.payload).not.toHaveProperty('costPrice');expect(projected.payload).not.toHaveProperty('supplierId');expect(projected.payload).toHaveProperty('unitPrice','100');});
it('projects customer fields from a whitelist instead of leaking unexpected stored columns',()=>{expect(projectRecord(sales,{...record,ownerId:'u'}).payload).not.toHaveProperty('bankAccount');});
