import {z} from 'zod';
import {uuid,version} from '@/modules/business/schemas';
import {customsSchema} from '@/modules/workspace/model';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit,type BusinessTx} from './commands';
import {currentLines,expectVersion,lookupOrder} from './order-data';
export async function effectiveCustoms(tx:BusinessTx,actor:BusinessActor,lineId:string,base:unknown){const rows=await tx`select after_value from trade_business.order_customs_revisions where company_id=${actor.companyId} and line_id=${lineId} order by created_at desc,id desc limit 1`;return customsSchema.parse(rows[0]?.after_value??base);}
const revision=z.object({requestId:uuid,orderId:uuid,lineId:uuid,expectedVersion:version,reason:z.string().trim().min(1).max(500),customs:customsSchema}).strict();
export async function reviseCustoms(actor:BusinessActor,raw:unknown){const input=revision.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'order.customs',payload:input},async tx=>{
 const order=await lookupOrder(tx,actor,input.orderId,'confirm');expectVersion(order.version,input.expectedVersion);const line=(await currentLines(tx,actor,order)).find(l=>l.id===input.lineId);if(!line)throw new Error('NOT_FOUND');
 if(input.customs.classificationStatus!=='reviewed')throw new Error('REVIEW_REQUIRED');const before=await effectiveCustoms(tx,actor,line.id,line.snapshot);
 await tx`insert into trade_business.order_customs_revisions(company_id,id,order_id,line_id,before_value,after_value,reason,created_by) values(${actor.companyId},${crypto.randomUUID()},${order.id},${line.id},${tx.json(before)},${tx.json(input.customs)},${input.reason},${actor.id})`;
 await tx`update trade_business.orders set version=version+1 where company_id=${actor.companyId} and id=${order.id}`;await audit(tx,actor,order.id,'order.customs',{lineId:line.id});return {id:order.id,version:order.version+1};
 });}
