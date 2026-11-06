import {z} from 'zod';
import {uuid,version} from '@/modules/business/schemas';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit} from './commands';
import {expectVersion,lookupOrder,readBusiness} from './order-data';
import {lookupRecord} from './records';
const access=z.object({requestId:uuid,orderId:uuid,supplierId:uuid,expectedVersion:version,enabled:z.boolean()}).strict();
export async function setOrderSupplier(actor:BusinessActor,raw:unknown){const input=access.parse(raw);return runBusinessCommand(actor,{requestId:input.requestId,kind:'order.supplier-access',payload:input},async tx=>{
 const order=await lookupOrder(tx,actor,input.orderId,'confirm');expectVersion(order.version,input.expectedVersion);await lookupRecord(tx,actor.companyId,input.supplierId,'supplier');
 if(input.enabled)await tx`insert into trade_business.order_supplier_access(company_id,order_id,supplier_id) values(${actor.companyId},${order.id},${input.supplierId}) on conflict do nothing`;
 else await tx`delete from trade_business.order_supplier_access where company_id=${actor.companyId} and order_id=${order.id} and supplier_id=${input.supplierId}`;
 await tx`update trade_business.orders set version=version+1 where company_id=${actor.companyId} and id=${order.id}`;await audit(tx,actor,order.id,'order.supplier-access',{supplierId:input.supplierId,enabled:input.enabled});return {id:order.id};
 });}
export async function orderSuppliers(actor:BusinessActor,orderId:string){return readBusiness(actor,async tx=>{
 await lookupOrder(tx,actor,uuid.parse(orderId),actor.role==='admin'?'confirm':'fulfill');
 const rows=await tx`select r.id,r.payload->>'name' as name from trade_business.business_records r where r.company_id=${actor.companyId} and r.kind='supplier' and (${actor.role==='admin'} or exists(select 1 from trade_business.order_supplier_access a where a.company_id=r.company_id and a.order_id=${orderId} and a.supplier_id=r.id)) order by r.payload->>'name',r.id limit 100`;
 return z.array(z.object({id:uuid,name:z.string()})).parse(rows);
 });}
