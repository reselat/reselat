import {z} from 'zod';
import {uuid,currency} from '@/modules/business/schemas';
import {frozenOrderSchema} from '@/modules/business/order-schema';
import {rereadEmployee} from '@/server/auth/member-directory';
import {checkAdmin} from '@/server/auth/employee';
import {businessDatabase} from '@/server/db/client';
import {assertScope,type BusinessActor,type BusinessAction} from './access';
import type {BusinessTx} from './commands';
export const orderRow=z.object({id:uuid,companyId:uuid,no:z.string(),customerId:uuid,ownerId:uuid,operationsId:uuid.nullable(),state:z.enum(['draft','submitted','confirmed','fulfilling','completed','cancelled']),version:z.number().int(),sourceVersion:z.number().int(),currency,day:z.string(),dueDay:z.string(),totalMinor:z.string(),payload:z.record(z.string(),z.unknown())});
export type OrderRow=z.infer<typeof orderRow>;
export const orderLine=z.object({id:uuid,orderId:uuid,orderVersion:z.number().int(),productId:uuid,quantity:z.string(),unitPrice:z.string(),amountMinor:z.string(),snapshot:z.record(z.string(),z.json())});
export async function readBusiness<T>(actor:BusinessActor,read:(tx:BusinessTx)=>Promise<T>){
 await rereadEmployee(actor);if(actor.role==='admin')checkAdmin(actor,actor.aal);
 const db=await businessDatabase();return db.begin(async tx=>{
  const companies=await tx`select id from trade_business.company_profiles where id=${actor.companyId} for share`;if(!companies.length)throw new Error('COMPANY_NOT_FOUND');
  return read(tx);
 });
}
export async function lookupOrder(tx:BusinessTx,actor:BusinessActor,id:string,action:BusinessAction='read'){
 const rows=await tx`select id,company_id as "companyId",no,customer_id as "customerId",owner_id as "ownerId",operations_id as "operationsId",state,version,source_version as "sourceVersion",currency,day::text,due_day::text as "dueDay",total_minor::text as "totalMinor",payload from trade_business.orders where company_id=${actor.companyId} and id=${uuid.parse(id)}`;
 if(!rows[0])throw new Error('NOT_FOUND');const row=orderRow.parse(rows[0]);
 const shares=await tx`select user_id from trade_business.order_shares where company_id=${actor.companyId} and order_id=${id}`;
 assertScope(actor,{...row,sharedWith:shares.map(r=>String(r.user_id))},action);return row;
}
export async function currentLines(tx:BusinessTx,actor:BusinessActor,order:OrderRow){const rows=await tx`select id,order_id as "orderId",order_version as "orderVersion",product_id as "productId",quantity::text,unit_price::text as "unitPrice",amount_minor::text as "amountMinor",snapshot from trade_business.order_lines where company_id=${actor.companyId} and order_id=${order.id} and order_version=${order.sourceVersion} order by id`;return rows.map(row=>orderLine.parse(row));}
export async function orderSnapshot(tx:BusinessTx,actor:BusinessActor,order:OrderRow){const rows=await tx`select snapshot from trade_business.order_versions where company_id=${actor.companyId} and order_id=${order.id} and version=${order.sourceVersion}`;if(!rows[0])throw new Error('NOT_FOUND');return frozenOrderSchema.parse(rows[0].snapshot);}
export function expectVersion(actual:number,expected:number){if(actual!==expected)throw new Error('VERSION_CONFLICT');}
export function requireState(state:string,allowed:readonly string[]){if(!allowed.includes(state))throw new Error('INVALID_TRANSITION');}
