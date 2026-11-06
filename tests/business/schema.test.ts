import {it,expect,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,companyId,sales,customerPayload} from '../helpers/business-db';
const engines=vi.hoisted(()=>new Map<string,PGlite>());
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{const db=engines.get('business');if(!db)throw new Error('Missing engine');return tagged(db);}}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(actor:unknown)=>actor,assertActiveCompanyMember:async()=>{}}));
import {runBusinessCommand} from '../../src/server/business/commands';
import {saveRecord,listRecords} from '../../src/server/business/records';
it('replays a committed result without a duplicate row and rejects changed payload or stale updates',async()=>{
 const db=await openBusiness(['complete-business-foundation.sql','shared-master-data.sql','customer-classification-codes.sql']);engines.set('business',db);try{
 const requestId=crypto.randomUUID(),input={requestId,kind:'customer',payload:customerPayload};const result=await saveRecord(sales,input);expect(await saveRecord(sales,input)).toEqual(result);
 await expect(saveRecord(sales,{...input,payload:{...customerPayload,name:'Different'}})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 await expect(saveRecord(sales,{...input,requestId:crypto.randomUUID(),id:result.id,expectedVersion:9})).rejects.toThrow('VERSION_CONFLICT');
 const list=await listRecords(sales,new URLSearchParams({kind:'customer'}));expect(list.items).toHaveLength(1);
 expect((await db.query('select * from trade_business.business_commands where company_id=$1',[companyId])).rows).toHaveLength(1);
 }finally{engines.clear();await db.close();}
});
it('rolls back business mutation, audit and command record together',async()=>{
 const db=await openBusiness(['complete-business-foundation.sql']);engines.set('business',db);try{
 await expect(runBusinessCommand(sales,{requestId:crypto.randomUUID(),kind:'synthetic',payload:{}},async tx=>{await tx`insert into trade_business.audit_events(company_id,actor_id,subject_id,action) values(${companyId},${sales.id},${sales.id},'synthetic')`;throw new Error('SIMULATED');})).rejects.toThrow('SIMULATED');
 await db.exec('reset role');expect((await db.query('select * from trade_business.audit_events')).rows).toHaveLength(0);expect((await db.query('select * from trade_business.business_commands')).rows).toHaveLength(0);
 }finally{engines.clear();await db.close();}
});
