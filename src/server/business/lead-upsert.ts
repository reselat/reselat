import {randomUUID} from 'node:crypto';
import type {BusinessTx} from './commands';
export type LeadRow={name:string;email:string;source:'manual'|'json'|'maps';placeId?:string;mapsUrl?:string;notes?:string;address?:string;phone?:string};
/** The single leads upsert used by manual, JSON and Maps imports. */
export async function upsertLead(tx:BusinessTx,companyId:string,lead:LeadRow){
 const rows=await tx`insert into trade_business.leads(company_id,id,name,email,source,place_id,maps_url,notes,address,phone) values(${companyId},${randomUUID()},${lead.name},${lead.email},${lead.source},${lead.placeId??null},${lead.mapsUrl??null},${lead.notes??null},${lead.address??null},${lead.phone??null}) on conflict(company_id,email) do update set name=excluded.name,source=excluded.source,place_id=coalesce(excluded.place_id,leads.place_id),maps_url=coalesce(excluded.maps_url,leads.maps_url),notes=coalesce(excluded.notes,leads.notes),address=coalesce(excluded.address,leads.address),phone=coalesce(excluded.phone,leads.phone) returning id`;
 return String(rows[0].id);
}
