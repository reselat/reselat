import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const companyId='00000000-0000-4000-8000-000000000001';
export const adminId='00000000-0000-4000-8000-000000000002';
export const salesId='00000000-0000-4000-8000-000000000003';
export const opsId='00000000-0000-4000-8000-000000000004';
export function tagged(db:PGlite){async function sql(strings:TemplateStringsArray,...values:unknown[]){return (await db.query(strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,''),values)).rows;}
 return Object.assign(sql,{json:(value:unknown)=>JSON.stringify(value),begin:async<T>(fn:(tx:typeof sql)=>Promise<T>)=>{await db.exec('begin');try{const result=await fn(sql);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}});}
export async function openBusiness(files:string[]){const db=new PGlite();await db.exec(await readFile('scripts/sql/business-initial-schema.sql','utf8'));for(const file of files)await db.exec(await readFile('scripts/sql/'+file,'utf8'));if(files.includes('20261104010000_prospecting.sql')&&!files.includes('20261105170000_leads_maps.sql'))await db.exec(await readFile('scripts/sql/20261105170000_leads_maps.sql','utf8'));await db.query('insert into trade_business.company_profiles(id) values($1)',[companyId]);await db.exec('set role business_backend');return db;}
export const admin={id:adminId,companyId,role:'admin' as const,version:1,enabled:true,aal:'aal2'};
export const sales={id:salesId,companyId,role:'sales' as const,version:1,enabled:true,aal:'aal1'};
export const operations={id:opsId,companyId,role:'operations' as const,version:1,enabled:true,aal:'aal1'};
export const customerPayload={name:'Synthetic buyer',country:'TEST',address:'Synthetic street',contact:'Synthetic',email:'buyer@example.test',phone:'',source:'ads'};
export const companyPayload={name:'Synthetic exporter',country:'TEST',address:'Synthetic address',email:'exporter@example.test',phone:'',bankName:'TEST BANK',bankAccount:'TEST ONLY',swift:'TEST'};
export const productPayload={sku:'TEST-01',nameZh:'测试产品',nameEn:'Synthetic product',spec:'TEST',unit:'PCS',hsCode:'',origin:'TEST',unitPrice:'10',supplierId:'',costPrice:'4',purchaseCurrency:'CNY'};
