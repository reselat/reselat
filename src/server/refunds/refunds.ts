import {touchUpload} from '@/server/files/lifecycle';
import {z} from 'zod';
import {createHash} from 'node:crypto';
import {uuid} from '@/modules/business/schemas';
import {refundKey,refundStatus,refundLabels,reportSchema,type RefundReport} from '@/modules/business/refund-schema';
import {tradeDocumentSchema,customsSchema} from '@/modules/workspace/model';
import {parseDecimal} from '@/domain/decimal';
import {runBusinessCommand,audit,type BusinessTx} from '@/server/business/commands';
import {lookupOrder,orderSnapshot,currentLines,readBusiness,expectVersion} from '@/server/business/order-data';
import {effectiveCustoms} from '@/server/business/customs';
import {IdentityError} from '@/server/auth/employee';
import type {BusinessActor} from '@/server/business/access';
import {lookupFile,fileRow,createInternalUploadIntent,uploadFile,reconcileFile,recoverGeneratedFile} from '@/server/files/files';
import {renderRefundCheck} from '@/templates/refund-check';
import {downloadFile} from '@/server/files/files';
import {reportArtifactFailure} from '@/server/documents/diagnostics';
import {csvCell,buildZip} from './archive';
const review=z.object({requestId:uuid,orderId:uuid,key:refundKey,status:refundStatus,expectedVersion:z.number().int().nonnegative(),reference:z.string().max(500),reason:z.string().max(1000),fileIds:z.array(uuid).max(100)}).strict();
export async function reviewRefundItem(actor:BusinessActor,raw:unknown){const input=review.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'refund.review',payload:input},async tx=>{
 await lookupOrder(tx,actor,input.orderId,input.status==='reviewed'||input.status==='not_applicable'?'confirm':'fulfill');
 if(input.status==='not_applicable'&&!input.reason.trim())throw new Error('REVIEW_REQUIRED');if(!['missing','not_applicable'].includes(input.status)&&!input.fileIds.length)throw new Error('FILE_NOT_READY');
 for(const id of input.fileIds){const file=await lookupFile(tx,actor,id);if(file.orderId!==input.orderId||file.state!=='stored'||['signature','export'].includes(file.category))throw new Error('FILE_NOT_READY');}
 const old=await tx`select version from trade_business.refund_items where company_id=${actor.companyId} and order_id=${input.orderId} and key=${input.key}`;expectVersion(old[0]?Number(old[0].version):0,input.expectedVersion);
 await tx`insert into trade_business.refund_items(company_id,order_id,key,status,reference,reason,reviewed_by) values(${actor.companyId},${input.orderId},${input.key},${input.status},${input.reference},${input.reason},${input.status==='reviewed'||input.status==='not_applicable'?actor.id:null}) on conflict(company_id,order_id,key) do update set status=excluded.status,reference=excluded.reference,reason=excluded.reason,reviewed_by=excluded.reviewed_by,version=trade_business.refund_items.version+1`;
 await tx`delete from trade_business.refund_item_files where company_id=${actor.companyId} and order_id=${input.orderId} and key=${input.key}`;
 for(const id of new Set(input.fileIds))await tx`insert into trade_business.refund_item_files(company_id,order_id,key,file_id) values(${actor.companyId},${input.orderId},${input.key},${id})`;
 await tx`insert into trade_business.refund_reviews(company_id,id,order_id,key,actor_id,status,reason,file_ids) values(${actor.companyId},${crypto.randomUUID()},${input.orderId},${input.key},${actor.id},${input.status},${input.reason},${tx.json([...new Set(input.fileIds)])})`;await audit(tx,actor,input.orderId,'refund.review',{key:input.key,status:input.status});return {id:input.orderId};
 });}
export async function refundReport(tx:BusinessTx,actor:BusinessActor,orderId:string):Promise<RefundReport>{
 const order=await lookupOrder(tx,actor,orderId),snapshot=await orderSnapshot(tx,actor,order),lines=await currentLines(tx,actor,order);const warnings:string[]=[];
 if(!['confirmed','fulfilling','completed'].includes(order.state))warnings.push('订单尚未确认');
 for(const line of snapshot.lines){const customs=await effectiveCustoms(tx,actor,line.id,line);if(customs.classificationStatus!=='reviewed'||!customs.taxCommodityCode||customs.refundRate==='')warnings.push('商品 '+line.sku+' 的HS或退税资料尚未完成人工复核');}
 for(const line of lines){const rows=await tx`select coalesce(sum(l.quantity),0)::text as quantity from trade_business.shipment_lines l join trade_business.shipments s on s.company_id=l.company_id and s.id=l.shipment_id where l.company_id=${actor.companyId} and l.order_line_id=${line.id} and s.state='confirmed'`;if(parseDecimal(String(rows[0].quantity),4)!==parseDecimal(line.quantity,4))warnings.push('商品 '+String(line.snapshot.sku??'')+' 的确认出运数量未与订单一致');}
 const missingDocs=await tx`select s.no from trade_business.shipments s where s.company_id=${actor.companyId} and s.order_id=${orderId} and s.state='confirmed' and (not exists(select 1 from trade_business.documents d join trade_business.document_versions v on v.company_id=d.company_id and v.document_id=d.id and v.version=d.version where d.company_id=s.company_id and d.shipment_id=s.id and d.type='CI' and d.state='confirmed' and v.phase='stored') or not exists(select 1 from trade_business.documents d join trade_business.document_versions v on v.company_id=d.company_id and v.document_id=d.id and v.version=d.version where d.company_id=s.company_id and d.shipment_id=s.id and d.type='PL' and d.state='confirmed' and v.phase='stored'))`;
 for(const row of missingDocs)warnings.push('批次 '+String(row.no)+' 缺少已归档CI或PL');
 const documentRows=await tx`select d.type,d.shipment_id as "shipmentId",v.snapshot from trade_business.documents d join trade_business.document_versions v on v.company_id=d.company_id and v.document_id=d.id and v.version=d.version where d.company_id=${actor.companyId} and d.order_id=${orderId} and d.type in ('CI','PL') and d.state='confirmed' and v.phase='stored'`;
 for(const row of documentRows){const frozen=tradeDocumentSchema.parse(row.snapshot);for(const line of frozen.lines){const linked=await tx`select order_line_id from trade_business.shipment_lines where company_id=${actor.companyId} and shipment_id=${uuid.parse(row.shipmentId)} and id=${uuid.parse(line.id)}`;const source=snapshot.lines.find(l=>l.id===linked[0]?.order_line_id);if(!source){warnings.push('单据 '+frozen.number+' 的商品来源需要复核');continue;}const current=await effectiveCustoms(tx,actor,source.id,source);if(JSON.stringify(customsSchema.parse(line))!==JSON.stringify(current))warnings.push('单据 '+frozen.number+' 的归类资料已过期，请作废并重新生成');}}
 const rawItems=await tx`select key,status,version,reference,reason from trade_business.refund_items where company_id=${actor.companyId} and order_id=${orderId}`;
 const parsed=z.array(z.object({key:refundKey,status:refundStatus,version:z.number().int(),reference:z.string(),reason:z.string()})).parse(rawItems);
 const rawFiles=await tx`select id,order_id as "orderId",category,name,mime,size,sha256,object_path as "objectPath",state,created_by as "createdBy" from trade_business.file_assets where company_id=${actor.companyId} and order_id=${orderId} and state='stored' and category not in ('signature','export') and not exists(select 1 from trade_business.document_versions v join trade_business.documents d on d.company_id=v.company_id and d.id=v.document_id where v.company_id=trade_business.file_assets.company_id and v.file_id=trade_business.file_assets.id and d.state='void') order by id`;
 const files=rawFiles.map(f=>fileRow.parse(f)).filter(f=>f.category!=='purchase'||actor.role==='admin'||(actor.role==='operations'&&order.operationsId===actor.id));
 const links=await tx`select key,file_id as "fileId" from trade_business.refund_item_files where company_id=${actor.companyId} and order_id=${orderId}`;
 const parsedLinks=z.array(z.object({key:refundKey,fileId:uuid})).parse(links);
 const items=refundKey.options.map(key=>{const item=parsed.find(r=>r.key===key),fileIds=parsedLinks.filter(l=>l.key===key&&files.some(f=>f.id===l.fileId)).map(l=>l.fileId);let status=item?.status??'missing';
  if(status!=='not_applicable'&&status!=='missing'&&!fileIds.length)status='missing';if(!['reviewed','not_applicable'].includes(status))warnings.push(refundLabels[key]+' 未完成资料复核');
  return {key,label:refundLabels[key],status,version:item?.version??0,reference:actor.role==='sales'&&['purchase_contract','purchase_invoice'].includes(key)?'':(item?.reference??''),reason:actor.role==='sales'&&['purchase_contract','purchase_invoice'].includes(key)?'':(item?.reason??''),fileIds};
 });
 return reportSchema.parse({orderId,orderNo:order.no,createdAt:new Date().toISOString(),complete:warnings.length===0,warnings,items,files:files.map(({id,name,mime,size,sha256})=>({id,name,mime,size,sha256}))});
}
export const getRefundReadiness=(actor:BusinessActor,id:string)=>readBusiness(actor,tx=>refundReport(tx,actor,uuid.parse(id)));
function directory(value:RefundReport){const rows=[['订单','资料类别','状态','凭证编号','复核说明','关联文件'],...value.items.map(i=>[value.orderNo,i.label,i.status,i.reference,i.reason,i.fileIds.join(';')])];return new TextEncoder().encode('\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n'));}
const exportCommand=z.object({requestId:uuid,orderId:uuid,format:z.enum(['csv','pdf','zip']),selectedFileIds:z.array(uuid).max(97).optional()}).strict();
export async function exportRefundPack(actor:BusinessActor,raw:unknown){const input=exportCommand.parse(raw);if(actor.role==='sales')throw new IdentityError('FORBIDDEN');
 const reserved=await runBusinessCommand(actor,{requestId:input.requestId,kind:'refund.export',payload:input},async tx=>{
  await lookupOrder(tx,actor,input.orderId,actor.role==='admin'?'confirm':'fulfill');const value=await refundReport(tx,actor,input.orderId),id=crypto.randomUUID();if(input.selectedFileIds){const selected=new Set(input.selectedFileIds);if([...selected].some(id=>!value.files.some(f=>f.id===id)))throw new Error('FILE_NOT_READY');if(selected.size!==value.files.length){value.complete=false;value.warnings.push('仅导出所选文件，资料包为部分资料草稿');value.files=value.files.filter(f=>selected.has(f.id));}}
  await tx`insert into trade_business.refund_exports(company_id,id,order_id,format,snapshot,created_by) values(${actor.companyId},${id},${input.orderId},${input.format},${tx.json(value)},${actor.id})`;return {id};
 });
 const id=uuid.parse(reserved.id),claimId=crypto.randomUUID();
 const current=await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'refund.export.claim',payload:{id}},async tx=>{
  await lookupOrder(tx,actor,input.orderId,actor.role==='admin'?'confirm':'fulfill');const rows=await tx`select file_id as "fileId",state,snapshot from trade_business.refund_exports where company_id=${actor.companyId} and id=${id}`;
  const row=z.object({fileId:uuid.nullable(),state:z.string(),snapshot:reportSchema}).parse(rows[0]);if(row.state==='stored')return {fileId:row.fileId,report:row.snapshot,stored:true};
  const claims=await tx`update trade_business.refund_exports set claim_id=${claimId},claim_until=now()+interval '2 minutes' where company_id=${actor.companyId} and id=${id} and (claim_until is null or claim_until<now()) returning id`;if(!claims.length)throw new Error('FILE_NOT_READY');return {fileId:row.fileId,report:row.snapshot,stored:false};
 });
 const value=reportSchema.parse(current.report);if(current.stored&&current.fileId)return {id,fileId:current.fileId,complete:value.complete};let fileId=current.fileId?uuid.parse(current.fileId):null;
 try{
 const render=async()=>{
  let bytes:Uint8Array;let mime:string;
  if(input.format==='csv'){bytes=directory(value);mime='text/csv';}
  else if(input.format==='pdf'){bytes=await renderRefundCheck(value);mime='application/pdf';}
  else{
   if(value.files.length+3>100||value.files.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw new Error('EXPORT_LIMIT');
   const entries:{name:string;bytes:Uint8Array}[]=[{name:'directory.csv',bytes:directory(value)},{name:'checks.pdf',bytes:await renderRefundCheck(value)},{name:'manifest.json',bytes:new TextEncoder().encode(JSON.stringify({complete:value.complete,warnings:value.warnings,files:value.files},null,2))}];
   for(const file of value.files){const downloaded=await downloadFile(actor,file.id);if(downloaded.sha256!==file.sha256)throw new Error('FILE_NOT_READY');entries.push({name:'files/'+file.id+'-'+file.name,bytes:downloaded.bytes});}bytes=buildZip(entries);mime='application/zip';
  }
  if(bytes.length>52428800)throw new Error('EXPORT_LIMIT');return {bytes,mime};
 };
 if(fileId){await recoverGeneratedFile(actor,fileId,async()=>(await render()).bytes);}else{
  const {bytes,mime}=await render();const category='export';
  const created=await createInternalUploadIntent(actor,{requestId:crypto.randomUUID(),orderId:value.orderId,category,name:value.orderNo+'-'+(value.complete?'reviewed':'draft')+'-'+id.slice(0,8)+'.'+input.format,mime,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});fileId=uuid.parse(created.id);
  await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'refund.export.file',payload:{id,fileId}},async tx=>{await touchUpload(tx,actor,uuid.parse(fileId));const rows=await tx`update trade_business.refund_exports set file_id=${fileId} where company_id=${actor.companyId} and id=${id} and claim_id=${claimId} and file_id is null returning id`;if(!rows.length)throw new Error('FILE_NOT_READY');return {id};});
  try{await uploadFile(actor,fileId,bytes);}catch{await reconcileFile(actor,fileId);}
 }
 await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'refund.export.stored',payload:{id,fileId}},async tx=>{
  await lookupOrder(tx,actor,value.orderId,actor.role==='admin'?'confirm':'fulfill');const file=await lookupFile(tx,actor,uuid.parse(fileId));if(file.state!=='stored')throw new Error('FILE_NOT_READY');
  const stored=await tx`update trade_business.refund_exports set state='stored',claim_id=null,claim_until=null where company_id=${actor.companyId} and id=${id} and claim_id=${claimId} and file_id=${fileId} returning id`;if(!stored.length)throw new Error('FILE_NOT_READY');await audit(tx,actor,id,'refund.export.stored');return {id};
 });return {id,fileId,complete:value.complete};
 }catch(error){reportArtifactFailure('refund.export','export',error);await runBusinessCommand(actor,{requestId:crypto.randomUUID(),kind:'refund.export.retry',payload:{id}},async tx=>{await tx`update trade_business.refund_exports set claim_id=null,claim_until=null where company_id=${actor.companyId} and id=${id} and claim_id=${claimId}`;return {id};});throw error;}
}
