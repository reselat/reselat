import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales,companyId,customerPayload} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
import {readFile} from 'node:fs/promises';
const state=vi.hoisted(()=>({db:null as PGlite|null}));
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{if(!state.db)throw new Error('MISSING_DB');return tagged(state.db);}}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async()=>{}}));
import {saveRecord,listRecords} from '@/server/business/records';
beforeEach(async()=>{state.db=await openBusiness(businessMigrations);});afterEach(async()=>{await state.db?.close();state.db=null;});
it('assigns unique immutable customer codes, preserves edits and supports search',async()=>{
 const input={requestId:crypto.randomUUID(),kind:'customer',payload:{...customerPayload,customerStage:'potential'}};
 const first=await saveRecord(sales,input);expect(await saveRecord(sales,input)).toEqual(first);
 await saveRecord(admin,{...input,requestId:crypto.randomUUID()});const records=await listRecords(admin,new URLSearchParams({kind:'customer'}));
 expect(new Set(records.items.map(r=>r.customerCode)).size).toBe(2);const row=records.items.find(r=>r.id===first.id);if(!row)throw new Error('MISSING');
 await saveRecord(sales,{...input,requestId:crypto.randomUUID(),id:first.id,expectedVersion:1,payload:{...customerPayload,customerStage:'regular'}});
 expect((await listRecords(sales,new URLSearchParams({kind:'customer',search:row.customerCode??''}))).items[0].customerCode).toBe(row.customerCode);
 await expect(saveRecord(sales,{...input,requestId:crypto.randomUUID(),payload:{...customerPayload,customerCode:'CUS-99999999'}})).rejects.toThrow('FORBIDDEN');
});
it('allocates codes for older clients and prevents database-level mutation',async()=>{
 if(!state.db)throw new Error('MISSING_DB');const id=crypto.randomUUID();await state.db.query("insert into trade_business.business_records(company_id,id,kind,owner_id,payload,customer_code) values($1,$2,'customer',$3,$4,null)",[companyId,id,sales.id,JSON.stringify(customerPayload)]);
 const rows=await state.db.query<{customer_code:string}>("select customer_code from trade_business.business_records where company_id=$1 and id=$2",[companyId,id]);expect(rows.rows[0].customer_code).toMatch(/^CUS-\d{8}$/);
 await expect(state.db.query("update trade_business.business_records set customer_code='CUS-99999999' where company_id=$1 and id=$2",[companyId,id])).rejects.toThrow();
});
it('backfills existing customers without replacing records or order references',async()=>{
 const db=await openBusiness(['complete-business-foundation.sql','shared-master-data.sql']);try{const id=crypto.randomUUID();await db.query("insert into trade_business.business_records(company_id,id,kind,owner_id,payload) values($1,$2,'customer',$3,$4)",[companyId,id,sales.id,JSON.stringify(customerPayload)]);await db.exec('reset role');await db.exec(await readFile('scripts/sql/customer-classification-codes.sql','utf8'));const rows=await db.query<{id:string;customer_code:string;stage:string}>("select id,customer_code,payload->>'customerStage' as stage from trade_business.business_records where company_id=$1",[companyId]);expect(rows.rows[0]).toMatchObject({id,customer_code:'CUS-00000001',stage:'pending'});}finally{await db.close();}
});
