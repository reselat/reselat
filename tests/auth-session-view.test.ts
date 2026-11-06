import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
it('checks live sessions through a private two-column view with no direct Auth access',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create schema auth;create table auth.sessions(id uuid,user_id uuid,private_data text)');
  await db.exec(await readFile('scripts/sql/auth-admin-schema.sql','utf8'));
  await db.exec('revoke usage on schema auth from app_backend');
  await db.exec(await readFile('scripts/sql/add-auth-session-view.sql','utf8'));
  await db.exec("insert into auth.sessions values ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','synthetic')");
  await db.exec('set role app_backend');
  expect((await db.query('select id,user_id from trade_private.active_auth_sessions')).rows).toHaveLength(1);
  await expect(db.exec('select id from auth.sessions')).rejects.toThrow();
  await expect(db.exec('select private_data from trade_private.active_auth_sessions')).rejects.toThrow();
  await expect(db.exec('delete from trade_private.active_auth_sessions')).rejects.toThrow();
  await db.exec('reset role;delete from auth.sessions;set role app_backend');
  expect((await db.query('select id from trade_private.active_auth_sessions')).rows).toHaveLength(0);
 }finally{await db.close();}
});
