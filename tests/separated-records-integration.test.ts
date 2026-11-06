import {it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const engines=vi.hoisted(()=>new Map<string,PGlite>());
const identityState=vi.hoisted(()=>({id:'00000000-0000-4000-8000-000000000001'}));
vi.mock('@/server/auth/supabase',()=>({authClient:async()=>({auth:{getUser:async()=>({data:{user:{id:identityState.id}},error:null}),getClaims:async()=>({data:{claims:{aal:'aal1'}},error:null})}})}));
vi.mock('@/server/db/client',()=>{
 function client(purpose:string){const db=engines.get(purpose);if(!db)throw new Error('Synthetic unavailable');async function sql(strings:TemplateStringsArray,...values:unknown[]){if(!db)throw new Error('Synthetic unavailable');return (await db.query(strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,''),values)).rows;}
 return Object.assign(sql,{json:(value:unknown)=>JSON.stringify(value),begin:async<T>(fn:(tx:typeof sql)=>Promise<T>)=>{await db.exec('begin');try{const result=await fn(sql);await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}}});}
 return {authDatabase:async()=>client('identity'),businessDatabase:async()=>client('business')};
});
import {GET,POST} from '../src/app/api/workspace/records/route';
it('uses real identity SQL and separate business transactions with audit, version and revocation protection',async()=>{
 const identity=new PGlite(),business=new PGlite();engines.set('identity',identity);engines.set('business',business);
 const company='00000000-0000-4000-8000-000000000002';vi.stubEnv('TRADE_COMPANY_ID',company);vi.stubEnv('APP_ORIGIN','http://127.0.0.1:3000');
 try{
 await identity.exec('create schema auth;create table auth.sessions(id uuid,user_id uuid)');
 await identity.exec(await readFile('scripts/sql/auth-admin-schema.sql','utf8'));await identity.exec(await readFile('scripts/sql/add-auth-session-view.sql','utf8'));await identity.exec(await readFile('scripts/sql/identity-management.sql','utf8'));
 await identity.query('insert into trade_private.companies(id,name) values($1,\'Synthetic\')',[company]);await identity.query("insert into trade_private.employees(user_id,company_id,role,enabled) values($1,$2,'sales',true)",[identityState.id,company]);
 await business.exec(await readFile('scripts/sql/business-initial-schema.sql','utf8'));await business.exec(await readFile('scripts/sql/complete-business-foundation.sql','utf8'));await business.exec(await readFile('scripts/sql/shared-master-data.sql','utf8'));await business.exec(await readFile('scripts/sql/customer-classification-codes.sql','utf8'));await business.query('insert into trade_business.company_profiles(id) values($1)',[company]);
 await identity.exec('set role identity_backend');await business.exec('set role business_backend');
 const payload={name:'Synthetic buyer',address:'Synthetic street',country:'TEST',email:'buyer@example.test',phone:'',contact:'Synthetic'};
 const write=(body:unknown)=>POST(new Request('http://127.0.0.1:3000/api/workspace/records',{method:'POST',headers:{origin:'http://127.0.0.1:3000'},body:JSON.stringify(body)}));
 expect((await write({kind:'customer',payload})).status).toBe(200);
 const response=await GET(new Request('http://127.0.0.1:3000/api/workspace/records?kind=customer'));expect(response.status).toBe(200);const rows:unknown=await response.json();expect(rows).toMatchObject({records:[{companyId:company,ownerId:identityState.id,version:1}]});
 await business.exec('reset role');const records=await business.query<{id:string}>('select id from trade_business.business_records');const id=records.rows[0].id;await business.exec('set role business_backend');
 expect((await write({kind:'customer',payload,id,version:1})).status).toBe(200);expect((await write({kind:'customer',payload,id,version:1})).status).toBe(409);
 await identity.query('update trade_private.employees set enabled=false,version=version+1 where user_id=$1',[identityState.id]);
 expect((await write({kind:'customer',payload})).status).toBe(403);
 await business.exec('reset role');expect((await business.query('select * from trade_business.business_records')).rows).toHaveLength(1);expect((await business.query('select * from trade_business.audit_events')).rows).toHaveLength(2);
 expect((await identity.query("select * from trade_private.audit_events where action like 'record.%'")).rows).toHaveLength(0);
 }finally{engines.clear();await identity.close();await business.close();}
});
