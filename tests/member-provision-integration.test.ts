import {it,expect,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const engine=vi.hoisted(()=>new Map<string,PGlite>());
vi.mock('@/server/db/client',()=>({authDatabase:async()=>{
 async function sql(strings:TemplateStringsArray,...values:unknown[]){const db=engine.get('db');if(!db)throw new Error('Missing test engine');const text=strings.reduce((text,part,index)=>text+(index?'$'+index:'')+part,'');return (await db.query(text,values)).rows;}
 return Object.assign(sql,{begin:async<T>(callback:(tx:typeof sql)=>Promise<T>)=>callback(sql)});
}}));
vi.mock('@/server/admin/auth-admin',()=>({authAdmin:vi.fn(),createAuthAccount:vi.fn(),confirmProvisionIdentity:vi.fn(async()=>{})}));
import {listProvisions,provisionStore,recoverProvision} from '../src/server/admin/provisioning';
const company='00000000-0000-4000-8000-000000000001',actor={id:company,companyId:company,role:'admin' as const,enabled:true,version:1};
it('keeps an older recoverable request reachable after 55 later rejected requests and completes its association once',async()=>{
 const db=new PGlite();engine.set('db',db);try{
 await db.exec(await readFile('scripts/sql/auth-admin-schema.sql','utf8'));await db.exec(await readFile('scripts/sql/member-management.sql','utf8'));
 await db.query('insert into trade_private.companies(id,name) values($1,$2)',[company,'Synthetic company']);
 await db.query('insert into trade_private.employees(user_id,company_id,role,enabled) values($1,$1,\'admin\',true)',[company]);
 const requestId='00000000-0000-4000-8000-000000000099',userId='00000000-0000-4000-8000-000000000098';
 const store=await provisionStore(actor);await store.reserve({requestId,name:'Synthetic pending',role:'sales'});await store.setUser(requestId,userId);
 await db.query("update trade_private.member_provisions set created_at='2020-01-01' where id=$1",[requestId]);
 for(let i=100;i<155;i++)await db.query("insert into trade_private.member_provisions(id,company_id,actor_id,display_name,role,state) values($1,$2,$2,'Synthetic rejection','sales','rejected')",['00000000-0000-4000-8000-'+String(i).padStart(12,'0'),company]);
 expect((await listProvisions(actor,0)).hasMore).toBe(true);
 const page=await listProvisions(actor,50);expect(page.operations.some(row=>row.id===requestId)).toBe(true);
 await recoverProvision(actor,requestId);await recoverProvision(actor,requestId);
 expect((await db.query('select * from trade_private.employees where user_id=$1',[userId])).rows).toHaveLength(1);
 expect((await db.query("select * from trade_private.audit_events where action='employee.create'")).rows).toHaveLength(1);
 }finally{engine.clear();await db.close();}
});
