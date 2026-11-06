import {it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {parseMemberChange,memberPatch} from '../src/server/admin/member-domain';
const id='00000000-0000-4000-8000-000000000001';
it('validates explicit actions and rejects enabling an archived member implicitly',()=>{
 expect(()=>parseMemberChange({id,version:1,action:'archive',enabled:true})).toThrow();
 expect(()=>memberPatch({enabled:false,archivedAt:'2026-01-01'},parseMemberChange({id,version:1,enabled:true}),id+'x',id)).toThrow('ARCHIVED_MEMBER');
 expect(()=>memberPatch({enabled:true,archivedAt:null},parseMemberChange({id,version:1,action:'archive'}),id,id)).toThrow('SELF_ARCHIVE_FORBIDDEN');
 expect(memberPatch({enabled:false,archivedAt:'2026-01-01'},parseMemberChange({id,version:1,action:'restore'}),id+'x',id)).toEqual({enabled:false,archived:false});
});
it('protects the last admin and retains references when archiving a customer owner',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('scripts/sql/auth-admin-schema.sql','utf8'));
 await db.exec(await readFile('scripts/sql/member-management.sql','utf8'));
 await db.exec(`insert into trade_private.companies values ('${id}','Synthetic company');insert into trade_private.employees(user_id,company_id,role,enabled) values ('${id}','${id}','admin',true),('00000000-0000-4000-8000-000000000002','${id}','sales',true);insert into trade_private.business_records(id,company_id,kind,owner_id,payload) values ('${id}','${id}','customer','00000000-0000-4000-8000-000000000002','{}');set role app_backend`);
 await expect(db.exec(`update trade_private.employees set enabled=false,archived_at=now() where user_id='${id}'`)).rejects.toThrow(/LAST_ADMIN_REQUIRED/);
 await db.exec("update trade_private.employees set enabled=false,archived_at=now() where user_id='00000000-0000-4000-8000-000000000002'");
 expect((await db.query('select owner_id from trade_private.business_records')).rows).toHaveLength(1);
 await expect(db.exec("update trade_private.employees set enabled=true where user_id='00000000-0000-4000-8000-000000000002'")).rejects.toThrow();
 await expect(db.exec('delete from trade_private.employees')).rejects.toThrow();
 await expect(db.exec('select * from trade_private.audit_events')).resolves.toBeDefined();
 }finally{await db.close();}
});
