import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
it('restores session identity checks without granting other Auth data or writes',async()=>{
 const db=new PGlite();
 try{
  await db.exec('create schema auth;create table auth.sessions(id uuid,user_id uuid,private_data text)');
  await db.exec(await readFile('scripts/sql/auth-admin-schema.sql','utf8'));
  await db.exec('revoke usage on schema auth from app_backend;set role app_backend');
  await expect(db.exec('select id from auth.sessions')).rejects.toThrow(/permission denied for schema auth/);
  await db.exec('reset role');
  await db.exec(await readFile('scripts/sql/restore-auth-schema-usage.sql','utf8'));
  await db.exec('set role app_backend');
  await expect(db.exec('select id,user_id from auth.sessions')).resolves.toBeDefined();
  await expect(db.exec('select private_data from auth.sessions')).rejects.toThrow();
  await expect(db.exec('delete from auth.sessions')).rejects.toThrow();
 }finally{await db.close();}
});
