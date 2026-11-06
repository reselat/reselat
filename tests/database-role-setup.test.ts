import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

it('formats the actual setup SQL with a bound password and enables only the dedicated role',async()=>{
 const source=readFileSync(new URL('../scripts/configure-database.mjs',import.meta.url),'utf8');
 const query=source.match(/const statement=await tx`([^`]+)`/);
 expect(query).not.toBeNull();
 if(!query)throw new Error('Setup query missing');
 const db=new PGlite();
 try{
  await db.exec('create role app_backend nologin');
  const rows=await db.query<{command:string}>(query[1].replace('${password}','$1'),["synthetic'quote\\value"]);
  expect(rows.rows).toHaveLength(1);
  await db.exec(rows.rows[0].command);
  const state=await db.query<{rolcanlogin:boolean;rolsuper:boolean;rolcreaterole:boolean;rolbypassrls:boolean}>("select rolcanlogin,rolsuper,rolcreaterole,rolbypassrls from pg_roles where rolname='app_backend'");
  expect(state.rows[0]).toEqual({rolcanlogin:true,rolsuper:false,rolcreaterole:false,rolbypassrls:false});
 }finally{await db.close();}
});
