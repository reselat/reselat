import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {checkAdmin} from '@/server/auth/employee';
import {mapsRowToLead,validMapsEmail,type MapsLead,type MapsRow} from '@/modules/business/maps-lead-adapter';
import {jsonResult} from '@/modules/business/schemas';
import type {BusinessActor} from './access';
import {assertAgentWrite} from './agent-roles';
import {audit,runBusinessCommand} from './commands';
import {upsertLead} from './lead-upsert';
import {enrichMaps,mapsSearchParams,searchMaps} from './leadtool';
// @ts-expect-error Shared strict schemas for the Node MCP bridge.
import {commandSchema} from '../../../scripts/agents/p1-schemas.mjs';

function safeError(error:unknown){
 if(error instanceof Error&&/^LEADTOOL_[A-Z_]+$/.test(error.message))return error.message;
 return 'LEADTOOL_ENRICH_FAILED';
}

async function searchAndEnrich(raw:unknown){
 const params=mapsSearchParams.parse(raw);
 const result=await searchMaps(params);
 if(!params.enrich)return {rows:result.rows,...(result.note?{note:result.note}:{})};
 const targets: {i:number;url:string}[]=[];
 result.rows.forEach((row,index)=>{
  if(validMapsEmail(row.email))return;
  const url=z.url().safeParse(row.website??'');
  if(url.success&&/^https?:/i.test(url.data))targets.push({i:index,url:url.data});
 });
 if(!targets.length)return {rows:result.rows,enriched:true,...(result.note?{note:result.note}:{})};
 try{
  const enriched=await enrichMaps(targets.slice(0,100));
  const requested=new Set(targets.map(target=>target.i));
  const rows: MapsRow[]=result.rows.map(row=>({...row}));
  for(const item of enriched){
   if(!requested.has(item.i))continue;
   const row=rows[item.i];
   if(!row||validMapsEmail(row.email))continue;
   const email=item.emails.map(validMapsEmail).find(Boolean);
   if(email){row.email=email;row.emailSource=item.source??'website';}
  }
  return {rows,enriched:true,...(result.note?{note:result.note}:{})};
 }catch(error){
  return {rows:result.rows,enriched:false,enrichError:safeError(error),...(result.note?{note:result.note}:{})};
 }
}

export async function mapsSearchCommand(actor:BusinessActor,raw:unknown){
 checkAdmin(actor,actor.aal);
 const input=commandSchema('maps_search').parse(raw);
 return searchAndEnrich(input.payload);
}

/**
 * Search aiclient (or accept selected rows), map them to lead payloads and upsert
 * with source=maps. It deliberately stops at the lead table: never draft, approve
 * or send. Agent access reuses the prospecting role's leads_upsert authority.
 */
export async function mapsImportCommand(actor:BusinessActor,raw:unknown,roleCode?:string){
 checkAdmin(actor,actor.aal);
 const input=commandSchema('maps_import').parse(raw);
 let sourceRows:unknown[];
 const resultMeta:Record<string,unknown>={};
 if(Array.isArray(input.payload.rows))sourceRows=input.payload.rows;
 else{
  const searched=await searchAndEnrich(input.payload);
  sourceRows=searched.rows;
  if('enrichError' in searched&&searched.enrichError)resultMeta.enrichError=searched.enrichError;
 }
 const leads=new Map<string,MapsLead>();
 const errors:{row:number;message:string}[]=[];
 sourceRows.forEach((row,index)=>{
  try{
   const lead=mapsRowToLead(row);
   if(leads.has(lead.email)){errors.push({row:index+1,message:'重复邮箱，已合并'});return;}
   leads.set(lead.email,lead);
  }catch(error){
   errors.push({row:index+1,message:error instanceof z.ZodError?'字段格式不正确':error instanceof Error?error.message:'无效 Maps 结果'});
  }
 });
 if(!leads.size)throw Error('NO_IMPORTABLE_MAPS_ROWS');
 const batchId=randomUUID();
 return runBusinessCommand(actor,{...input,kind:'maps_import',payload:{leads:[...leads.values()],request:input.payload}},async tx=>{
  if(roleCode!==undefined)await assertAgentWrite(actor,roleCode,'leads_upsert',tx);
  const leadIds:string[]=[];
  for(const lead of leads.values())leadIds.push(await upsertLead(tx,actor.companyId,lead));
  await audit(tx,actor,batchId,'maps_import',{imported:leadIds.length,skipped:errors.length});
  return jsonResult.parse({
   id:batchId,leadIds,imported:leadIds.length,skipped:errors.length,
   ...(errors.length?{errors}:{}),
   ...resultMeta
  });
 });
}
