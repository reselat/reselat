import {z} from 'zod';
import {uuid} from '@/modules/business/schemas';
import {IdentityError} from '@/server/auth/employee';
import type {BusinessActor} from '@/server/business/access';
import type {BusinessTx} from '@/server/business/commands';
import {lookupOrder} from '@/server/business/order-data';
export const documentType=z.enum(['PI','PO','CI','PL','SC']);
export const documentRow=z.object({id:uuid,orderId:uuid,type:documentType,purchaseId:uuid.nullable(),shipmentId:uuid.nullable(),state:z.enum(['draft','confirmed','void']),version:z.number().int(),terms:z.unknown()});
export type DocumentRow=z.infer<typeof documentRow>;
export async function lookupDocument(tx:BusinessTx,actor:BusinessActor,id:string){
 const rows=await tx`select id,order_id as "orderId",type,purchase_id as "purchaseId",shipment_id as "shipmentId",state,version,terms from trade_business.documents where company_id=${actor.companyId} and id=${uuid.parse(id)}`;
 if(!rows[0])throw new Error('NOT_FOUND');const doc=documentRow.parse(rows[0]);const order=await lookupOrder(tx,actor,doc.orderId);
 if(doc.type==='PO'&&(actor.role==='sales'||(actor.role==='operations'&&order.operationsId!==actor.id)))throw new IdentityError('FORBIDDEN');return {doc,order};
}
