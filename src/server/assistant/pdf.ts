import {execFile} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {checkAdmin,IdentityError} from '@/server/auth/employee';
import {businessDatabase} from '@/server/db/client';
import {runBusinessCommand,audit} from '@/server/business/commands';
import type {BusinessActor} from '@/server/business/access';
import {getBusinessStorage} from '@/server/files/storage';
import {knowledgeSchema} from '@/modules/assistant/model';
async function extract(companyId:string,fileId:string):Promise<string>{
 if(process.env.FILE_STORAGE_DRIVER!=='filesystem'||!process.env.PRIVATE_FILES_ROOT)return '';
 const path=resolve(process.env.PRIVATE_FILES_ROOT,companyId,fileId,'object');
 return new Promise(resolveResult=>execFile('python3',['-c','import sys; from pypdf import PdfReader; r=PdfReader(sys.argv[1]); print("\\n".join(p.extract_text() or "" for p in r.pages[:30])[:20000])',path],{timeout:8000,maxBuffer:100000},(error,stdout)=>resolveResult(error?'':stdout.trim())));
}
const params=z.object({id:z.uuid(),requestId:z.uuid(),version:z.coerce.number().int().positive()});
export async function attachPdf(actor:BusinessActor,url:URL,bytes:Uint8Array){
 checkAdmin(actor,actor.aal);const input=params.parse(Object.fromEntries(url.searchParams));const hash=createHash('sha256').update(bytes).digest('hex');
 const reserved=await runBusinessCommand(actor,{requestId:input.requestId,kind:'assistant.pdf.reserve',payload:{...input,hash}},async tx=>{
  const rows=await tx`select data,version from trade_business.assistant_resources where company_id=${actor.companyId} and id=${input.id} and kind='knowledge' for update`;
  const row=rows[0];if(!row)throw new Error('NOT_FOUND');if(row.version!==input.version)throw new Error('VERSION_CONFLICT');if(row.data.state!=='draft'||row.data.fileId)throw new Error('INVALID_TRANSITION');
  await tx`update trade_business.assistant_resources set data=${tx.json({...row.data,fileId:input.requestId,fileState:'uploading',fileHash:hash})},version=version+1 where company_id=${actor.companyId} and id=${input.id}`;
  return {fileId:input.requestId,completionId:crypto.randomUUID()};
 });
 const fileId=String(reserved.fileId),storage=await getBusinessStorage(),path=actor.companyId+'/'+fileId;
 try{await storage.upload(path,bytes,'application/pdf');}catch(e){if(!(e instanceof Error)||e.message!=='STORAGE_ALREADY_EXISTS')throw e;const stored=await storage.download(path);if(createHash('sha256').update(stored).digest('hex')!==hash)throw new Error('IDEMPOTENCY_CONFLICT');}
 const text=await extract(actor.companyId,fileId);
 return runBusinessCommand(actor,{requestId:String(reserved.completionId),kind:'assistant.pdf.complete',payload:{id:input.id,hash}},async tx=>{
  // Completion has its own deterministic command id, separate from the reservation.
  const rows=await tx`select data from trade_business.assistant_resources where company_id=${actor.companyId} and id=${input.id} for update`;
  if(rows[0]?.data.fileId!==fileId||rows[0].data.state!=='draft')throw new Error('INVALID_TRANSITION');
  await tx`update trade_business.assistant_resources set data=${tx.json({...rows[0].data,fileState:'stored',text:text||rows[0].data.text})},version=version+1 where company_id=${actor.companyId} and id=${input.id}`;
  await audit(tx,actor,input.id,'assistant.pdf.stored');return {id:input.id,extracted:!!text};
 });
}
export async function downloadPdf(actor:BusinessActor,id:string){
 z.uuid().parse(id);const db=await businessDatabase(),rows=await db`select data from trade_business.assistant_resources where company_id=${actor.companyId} and id=${id} and kind='knowledge'`;
 const raw=rows[0]?.data;if(!raw||(actor.role!=='admin'&&raw.state!=='published'))throw new IdentityError('FORBIDDEN');
 const doc=knowledgeSchema.parse(raw);if(!doc.fileId||raw.fileState!=='stored')throw new Error('FILE_NOT_READY');
 return (await getBusinessStorage()).download(actor.companyId+'/'+doc.fileId);
}
