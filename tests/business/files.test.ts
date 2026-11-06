import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import type {PGlite} from '@electric-sql/pglite';
import {openBusiness,tagged,admin,sales,operations,customerPayload,productPayload,companyPayload} from '../helpers/business-db';
import {businessMigrations} from '../helpers/full-business';
const runtime=vi.hoisted(()=>{const state:{db:PGlite|undefined;objects:Map<string,Uint8Array>;failAfterUpload:boolean;failCleanup:boolean}={db:undefined,objects:new Map(),failAfterUpload:false,failCleanup:false};return state;});
vi.mock('@/server/db/client',()=>({businessDatabase:async()=>{if(!runtime.db)throw new Error('MISSING_ENGINE');return tagged(runtime.db);}}));
vi.mock('@/server/auth/member-directory',()=>({rereadEmployee:async(a:unknown)=>a,assertActiveCompanyMember:async()=>{}}));
vi.mock('@/server/files/storage',()=>({getBusinessStorage:async()=>({removeUploadParts:async(company:string,id:string)=>{if(runtime.failCleanup)throw new Error("STORAGE_UNKNOWN");for(let part=0;part<5;part++)runtime.objects.delete(company+"/"+id+"/parts/"+part);},removeAbandonedExportObject:async(company:string,id:string)=>{runtime.objects.delete(company+"/"+id);},upload:async(path:string,bytes:Uint8Array)=>{if(runtime.objects.has(path))throw new Error('STORAGE_ALREADY_EXISTS');runtime.objects.set(path,bytes);if(runtime.failAfterUpload)throw new Error('STORAGE_UNKNOWN');},download:async(path:string)=>{const bytes=runtime.objects.get(path);if(!bytes)throw new Error('STORAGE_NOT_FOUND');return bytes;}})}));
import {saveRecord,saveCompany} from '../../src/server/business/records';
import {createOrder} from '../../src/server/business/orders';
import {createUploadIntent,createInternalUploadIntent,uploadFile,reconcileFile,downloadFile} from '../../src/server/files/files';
import {uploadChunk,finishUpload,uploadChunkSize} from '../../src/server/files/chunks';
import {previewUploadMaintenance,executeUploadMaintenance} from '../../src/server/files/maintenance';
import {validateFile} from '../../src/server/files/validation';
const bytes=new TextEncoder().encode('%PDF-1.4\nSynthetic test only\n%%EOF');
let orderId='';
beforeEach(async()=>{runtime.db=await openBusiness(businessMigrations);runtime.objects.clear();runtime.failAfterUpload=false;runtime.failCleanup=false;
 await saveCompany(admin,{requestId:crypto.randomUUID(),payload:companyPayload});const customer=await saveRecord(sales,{requestId:crypto.randomUUID(),kind:'customer',payload:customerPayload});const product=await saveRecord(admin,{requestId:crypto.randomUUID(),kind:'product',payload:productPayload});
 const created=await createOrder(sales,{requestId:crypto.randomUUID(),customerId:customer.id,currency:'USD',date:'2026-10-25',dueDate:'2026-11-25',deliveryDate:'2026-11-25',validUntil:'2026-11-25',incoterm:'FOB',namedPlace:'TEST',paymentTerms:'TEST',buyerReference:'',lines:[{productId:product.id,quantity:'1',unitPrice:'1'}]});orderId=String(created.id);
});
afterEach(async()=>{await runtime.db?.close();runtime.db=undefined;});
const intent=()=>({requestId:crypto.randomUUID(),orderId,category:'customer',name:'synthetic.pdf',mime:'application/pdf',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
it('checks content bytes, names and size independently of metadata',()=>{
 expect(()=>validateFile({name:'synthetic.pdf',mime:'application/pdf'},bytes)).not.toThrow();
 expect(()=>validateFile({name:'../synthetic.pdf',mime:'application/pdf'},bytes)).toThrow('FILE_LIMIT');
 expect(()=>validateFile({name:'synthetic.png',mime:'image/png'},bytes)).toThrow('FILE_LIMIT');
 expect(()=>validateFile({name:'synthetic.pdf',mime:'application/pdf'},new Uint8Array(10485761))).toThrow('FILE_LIMIT');
});
it('keeps an uncertain upload recoverable and downloads the fixed verified bytes',async()=>{
 const created=await createUploadIntent(sales,intent());runtime.failAfterUpload=true;
 await expect(uploadFile(sales,String(created.id),bytes)).rejects.toThrow('FILE_NOT_READY');
 expect(runtime.objects.size).toBe(1);runtime.failAfterUpload=false;runtime.failCleanup=false;
 await reconcileFile(admin,String(created.id));const result=await downloadFile(sales,String(created.id));expect(result.bytes).toEqual(bytes);
 await uploadFile(sales,String(created.id),bytes);expect(runtime.objects.size).toBe(1);
 await expect(downloadFile({...sales,companyId:crypto.randomUUID()},String(created.id))).rejects.toThrow();
});
it('blocks procurement files for sales and uploads for unassigned operations',async()=>{
 await expect(createUploadIntent(sales,{...intent(),category:'purchase'})).rejects.toThrow('FORBIDDEN');
 await expect(createUploadIntent(operations,intent())).rejects.toThrow('FORBIDDEN');
 expect(runtime.objects.size).toBe(0);
});

it('assembles exactly 10MiB through bounded parts and refuses missing or changed chunks',async()=>{
 const large=new Uint8Array(10485760);large.set(new TextEncoder().encode('%PDF-1.4\n'));large.set(new TextEncoder().encode('%%EOF'),large.length-5);
 const created=await createUploadIntent(sales,{...intent(),size:large.length,sha256:createHash('sha256').update(large).digest('hex')}),id=String(created.id);
 await expect(finishUpload(sales,id)).rejects.toThrow('FILE_NOT_READY');
 for(let part=0;part<5;part++)await uploadChunk(sales,id,part,large.slice(part*uploadChunkSize,(part+1)*uploadChunkSize));
 await uploadChunk(sales,id,0,large.slice(0,uploadChunkSize));
 await expect(uploadChunk(sales,id,0,new Uint8Array(uploadChunkSize))).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 await expect(uploadChunk(operations,id,0,large.slice(0,uploadChunkSize))).rejects.toThrow('FORBIDDEN');
 await finishUpload(sales,id);const downloaded=await downloadFile(sales,id);
 // Compare all 10MiB natively; deep assertion expansion can exhaust a 2GiB CI heap.
 expect(Buffer.compare(Buffer.from(downloaded.bytes),Buffer.from(large))).toBe(0);expect(runtime.objects.size).toBe(1);
});

it('keeps stored success when cleanup fails and retries cleanup without rewriting the final object',async()=>{
 const created=await createUploadIntent(sales,intent()),id=String(created.id);await uploadChunk(sales,id,0,bytes);runtime.failCleanup=true;await expect(finishUpload(sales,id)).resolves.toEqual({id});expect(runtime.objects.size).toBe(2);
 const pending=await runtime.db!.query<{cleanup_pending:boolean}>('select cleanup_pending from trade_business.upload_intents where file_id=$1',[id]);expect(pending.rows[0].cleanup_pending).toBe(true);runtime.failCleanup=false;await finishUpload(sales,id);expect(runtime.objects.size).toBe(1);expect((await downloadFile(sales,id)).bytes).toEqual(bytes);
 await uploadChunk(sales,id,0,bytes);expect(runtime.objects.size).toBe(1);
});
it('enforces a durable member count, idempotent replays, and counts failed cleanup until resolved',async()=>{
 const input=intent();const first=await createUploadIntent(sales,input);expect(await createUploadIntent(sales,input)).toEqual(first);for(let i=0;i<4;i++)await createUploadIntent(sales,intent());await expect(createUploadIntent(sales,intent())).rejects.toThrow('UPLOAD_LIMIT');
 await uploadChunk(sales,String(first.id),0,bytes);runtime.failCleanup=true;await finishUpload(sales,String(first.id));await expect(createUploadIntent(sales,intent())).rejects.toThrow('UPLOAD_LIMIT');runtime.failCleanup=false;await finishUpload(sales,String(first.id));await expect(createUploadIntent(sales,intent())).resolves.toHaveProperty('id');
});
it('closes stale incomplete uploads and finds late parts even after their metadata was removed',async()=>{
 const id=String((await createUploadIntent(sales,intent())).id);await uploadChunk(sales,id,0,bytes);
 await runtime.db!.query("update trade_business.upload_intents set last_activity_at=clock_timestamp()-interval '25 hours' where file_id=$1",[id]);const p=await previewUploadMaintenance(admin,id);expect(p.action).toBe('expire');await executeUploadMaintenance(admin,{id,version:p.version});expect(runtime.objects.size).toBe(0);await expect(uploadChunk(sales,id,0,bytes)).rejects.toThrow('UPLOAD_CLOSED');
 const path=admin.companyId+'/'+id+'/parts/0';runtime.objects.set(path,bytes);const late=await previewUploadMaintenance(admin,id);expect(late.parts).toBe(1);await executeUploadMaintenance(admin,{id,version:late.version});expect(runtime.objects.has(path)).toBe(false);
});
it('protects active previews and referenced export objects, recovers complete unknown uploads',async()=>{
 const id=String((await createInternalUploadIntent(admin,{...intent(),category:'export'})).id);const path=admin.companyId+'/'+id;runtime.objects.set(path,bytes);
 await runtime.db!.query("insert into trade_business.refund_exports(company_id,id,order_id,format,snapshot,created_by,file_id) values($1,$2,$3,'pdf','{}',$4,$5)",[admin.companyId,crypto.randomUUID(),orderId,admin.id,id]);
 const p=await previewUploadMaintenance(admin,id);expect(p.action).toBe('recover');await executeUploadMaintenance(admin,{id,version:p.version});expect(runtime.objects.has(path)).toBe(true);expect((await downloadFile(admin,id)).bytes).toEqual(bytes);
 await expect(previewUploadMaintenance(sales,id)).rejects.toThrow('FORBIDDEN');
 const active=String((await createUploadIntent(sales,intent())).id);const a=await previewUploadMaintenance(admin,active);expect(a.action).toBe('active');await expect(executeUploadMaintenance(admin,{id:active,version:a.version})).rejects.toThrow('FILE_NOT_READY');
});
it('refuses stale cleanup approval and clears only explicitly abandoned unreferenced export objects',async()=>{
 const id=String((await createInternalUploadIntent(admin,{...intent(),category:'export'})).id),path=admin.companyId+'/'+id;runtime.objects.set(path,new Uint8Array([1,2]));await runtime.db!.query("update trade_business.upload_intents set last_activity_at=clock_timestamp()-interval '25 hours' where file_id=$1",[id]);const p=await previewUploadMaintenance(admin,id);expect(p.action).toBe('expire-export');runtime.objects.set(path,new Uint8Array([1,2,3]));await expect(executeUploadMaintenance(admin,{id,version:p.version})).rejects.toThrow('VERSION_CONFLICT');const fresh=await previewUploadMaintenance(admin,id);await executeUploadMaintenance(admin,{id,version:fresh.version});expect(runtime.objects.has(path)).toBe(false);
});
it('can recover a complete final object arriving after expiry without reopening uploads',async()=>{
 const id=String((await createUploadIntent(sales,intent())).id),path=admin.companyId+'/'+id;await runtime.db!.query("update trade_business.upload_intents set last_activity_at=clock_timestamp()-interval '25 hours' where file_id=$1",[id]);const p=await previewUploadMaintenance(admin,id);await executeUploadMaintenance(admin,{id,version:p.version});runtime.objects.set(path,bytes);
 await expect(reconcileFile(sales,id)).rejects.toThrow('UPLOAD_CLOSED');const arrived=await previewUploadMaintenance(admin,id);expect(arrived.action).toBe('recover');await executeUploadMaintenance(admin,{id,version:arrived.version});expect((await downloadFile(sales,id)).bytes).toEqual(bytes);const life=await runtime.db!.query<{closed_at:string;cleanup_pending:boolean}>('select closed_at,cleanup_pending from trade_business.upload_intents where file_id=$1',[id]);expect(life.rows[0].closed_at).not.toBeNull();expect(life.rows[0].cleanup_pending).toBe(false);
});
it('enforces the company limit across different members',async()=>{for(let m=0;m<4;m++){const actor={...admin,id:crypto.randomUUID()};for(let n=0;n<5;n++)await createInternalUploadIntent(actor,{...intent(),category:'export'});}await expect(createInternalUploadIntent({...admin,id:crypto.randomUUID()},{...intent(),category:'export'})).rejects.toThrow('UPLOAD_LIMIT');});
