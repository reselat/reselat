import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
it('isolates identity grants from legacy business objects and excludes identity tables from the new business database',async()=>{
 const identity=new PGlite(),business=new PGlite();try{
 await identity.exec('create schema auth;create table auth.sessions(id uuid,user_id uuid)');
 await identity.exec(await readFile('scripts/sql/auth-admin-schema.sql','utf8'));await identity.exec(await readFile('scripts/sql/add-auth-session-view.sql','utf8'));await identity.exec(await readFile('scripts/sql/identity-management.sql','utf8'));
 await identity.exec('set role identity_backend');
 await expect(identity.exec('select id from trade_private.active_auth_sessions')).resolves.toBeDefined();
 await expect(identity.exec('select * from trade_private.business_records')).rejects.toThrow();
 await expect(identity.exec('delete from trade_private.audit_events')).rejects.toThrow();
 await expect(identity.exec('update trade_private.deployment_identity set project_ref=\'changed\'')).rejects.toThrow();
 await business.exec('create role anon;create role authenticated');
 await business.exec(await readFile('scripts/sql/business-initial-schema.sql','utf8'));
 expect((await business.query("select tablename from pg_tables where tablename in ('employees','member_provisions','sessions')")).rows).toHaveLength(0);
 await business.exec('set role business_backend');
 await expect(business.exec('create table trade_business.employees(id uuid)')).rejects.toThrow();
 await expect(business.exec('delete from trade_business.audit_events')).rejects.toThrow();
 const result=await business.query<{anon_access:boolean}>("select has_schema_privilege('anon','trade_business','USAGE') as anon_access");expect(result.rows[0].anon_access).toBe(false);
 }finally{await identity.close();await business.close();}
});
it('retains historical owner IDs but enforces business internal company relationships and column-limited writes',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('scripts/sql/business-initial-schema.sql','utf8'));
 const first='00000000-0000-4000-8000-000000000001',second='00000000-0000-4000-8000-000000000002',record='00000000-0000-4000-8000-000000000003';
 await db.query('insert into trade_business.company_profiles(id) values($1),($2)',[first,second]);
 await db.exec('set role business_backend');
 await db.query("insert into trade_business.business_records(id,company_id,kind,owner_id,payload) values($1,$2,'customer',$3,'{}')",[record,first,second]);
 await expect(db.query("insert into trade_business.record_shares(company_id,kind,record_id,user_id) values($1,'customer',$2,$3)",[second,record,second])).rejects.toThrow();
 await expect(db.query('update trade_business.business_records set owner_id=$1',[record])).rejects.toThrow();
 expect((await db.query('select owner_id from trade_business.business_records')).rows).toHaveLength(1);
 }finally{await db.close();}
});
