import {it,expect} from 'vitest';
import {assertScope,projectFields} from '../../src/server/business/access';
const sales={id:'sales',companyId:'c',role:'sales' as const,enabled:true,version:1,aal:'aal1'};
it('distinguishes ownership, read-only sharing, operations assignment and company boundaries',()=>{
 const record={companyId:'c',ownerId:'other',operationsId:'ops',sharedWith:['sales']};
 expect(()=>assertScope(sales,record,'read')).not.toThrow();expect(()=>assertScope(sales,record,'write')).toThrow();
 expect(()=>assertScope({...sales,role:'operations',id:'ops'},record,'fulfill')).not.toThrow();
 expect(()=>assertScope({...sales,companyId:'other'},record,'read')).toThrow();
 expect(()=>assertScope({...sales,role:'admin',aal:'aal1'},record,'confirm')).not.toThrow();
 expect(()=>assertScope({...sales,role:'admin',aal:'aal2'},record,'confirm')).not.toThrow();
});
it('does not return arbitrary procurement or banking fields to sales',()=>{
 const result=projectFields({name:'Synthetic',unitPrice:'10',costPrice:'4',supplierId:'supplier',bankAccount:'PRIVATE'},'sales','product');
 expect(result).toEqual({name:'Synthetic',unitPrice:'10'});
});
