import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {admin,companyId,openBusiness,sales,tagged} from '../helpers/business-db';
const engines=vi.hoisted(()=>new Map<string,PGlite>());
vi.mock('@/server/db/client',()=>({
 authDatabase:async()=>{const db=engines.get('identity');if(!db)throw new Error('IDENTITY_UNAVAILABLE');return tagged(db);},
 businessDatabase:async()=>{const db=engines.get('business');if(!db)throw new Error('BUSINESS_UNAVAILABLE');return tagged(db);},
}));
import {audit,nextNumber,runBusinessCommand} from '../../src/server/business/commands';

beforeEach(async()=>{
 const identity=new PGlite();engines.set('identity',identity);
 const business=await openBusiness(['complete-business-foundation.sql']);engines.set('business',business);
 await identity.exec('create schema auth;create table auth.sessions(id uuid,user_id uuid)');
 for(const file of ['auth-admin-schema.sql','add-auth-session-view.sql','identity-management.sql'])await identity.exec(await readFile('scripts/sql/'+file,'utf8'));
 await identity.query("insert into trade_private.companies(id,name) values($1,'Synthetic')",[companyId]);
 for(const member of [sales,admin])await identity.query('insert into trade_private.employees(user_id,company_id,role,enabled) values($1,$2,$3,true)',[member.id,companyId,member.role]);
 await identity.exec('set role identity_backend');
});
afterEach(async()=>{const pending=[...engines.values()];engines.clear();await Promise.all(pending.map(db=>db.close()));});
const input=()=>({requestId:crypto.randomUUID(),kind:'synthetic',payload:{}});

it('rejects identity outages, stale roles and disabled employees before business writes',async()=>{
 const identity=engines.get('identity');if(!identity)throw new Error('MISSING_FIXTURE');
 const handler=vi.fn(async()=>({saved:true}));
 await identity.query('update trade_private.employees set version=version+1 where user_id=$1',[sales.id]);
 await expect(runBusinessCommand(sales,input(),handler)).rejects.toThrow('FORBIDDEN');
 await identity.query('update trade_private.employees set enabled=false where user_id=$1',[sales.id]);
 await expect(runBusinessCommand({...sales,version:2},input(),handler)).rejects.toThrow('FORBIDDEN');
 engines.delete('identity');
 try{await expect(runBusinessCommand(sales,input(),handler)).rejects.toThrow('IDENTITY_UNAVAILABLE');}finally{engines.set('identity',identity);}
 expect(handler).not.toHaveBeenCalled();
});

it('refuses another actor or command kind reusing a committed key',async()=>{
 const command=input();
 expect(await runBusinessCommand(sales,command,async()=>({saved:true}))).toEqual({saved:true});
 const handler=vi.fn(async()=>({saved:false}));
 await expect(runBusinessCommand(admin,command,handler)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 await expect(runBusinessCommand(sales,{...command,kind:'other'},handler)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 expect(handler).not.toHaveBeenCalled();
});

it('rolls back numbering with business audit and returns a stable replayed number',async()=>{
 const failed=input();
 await expect(runBusinessCommand(sales,failed,async tx=>{await nextNumber(tx,companyId,'SO','2026-10-24');await audit(tx,sales,sales.id,'synthetic');throw new Error('SIMULATED');})).rejects.toThrow('SIMULATED');
 const command=input();
 const create=()=>runBusinessCommand(sales,command,async tx=>({number:await nextNumber(tx,companyId,'SO','2026-10-24')}));
 expect(await create()).toEqual({number:'SO-20261024-00001'});expect(await create()).toEqual({number:'SO-20261024-00001'});
});

it('keeps command history immutable and rejects a different company',async()=>{
 const handler=vi.fn(async()=>({saved:true}));
 await expect(runBusinessCommand({...sales,companyId:crypto.randomUUID()},input(),handler)).rejects.toThrow('FORBIDDEN');
 const business=engines.get('business');if(!business)throw new Error('MISSING_FIXTURE');
 await expect(business.exec('delete from trade_business.business_commands')).rejects.toThrow(/permission denied/);
 await expect(business.exec("update trade_business.business_commands set kind='changed'")).rejects.toThrow(/permission denied/);
 expect(handler).not.toHaveBeenCalled();
});
