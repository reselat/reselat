import type postgres from 'postgres';
import {businessDatabase} from '@/server/db/client';
import {rereadEmployee} from '@/server/auth/member-directory';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {commandFingerprint} from './command-values';
import {jsonResult} from '@/modules/business/schemas';
export type BusinessTx=postgres.TransactionSql;
export type CommandResult=ReturnType<typeof jsonResult.parse>;
export async function runBusinessCommand(actor:BusinessActor,input:{requestId:string;kind:string;payload:unknown},handler:(tx:BusinessTx)=>Promise<CommandResult>){
 await rereadEmployee(actor);if(actor.role==='admin')checkAdmin(actor,actor.aal);
 const hash=commandFingerprint({kind:input.kind,payload:input.payload});
 return (await businessDatabase()).begin(async tx=>{
  // The company lock serializes scope changes, command replay and domain row locks.
  const company=await tx`select id from trade_business.company_profiles where id=${actor.companyId} for update`;
  if(!company.length)throw new Error('COMPANY_NOT_FOUND');
  const old=await tx`select actor_id,kind,payload_hash,result from trade_business.business_commands where company_id=${actor.companyId} and request_id=${input.requestId}`;
  if(old.length){if(old[0].actor_id!==actor.id||old[0].kind!==input.kind||old[0].payload_hash!==hash)throw new Error('IDEMPOTENCY_CONFLICT');return jsonResult.parse(old[0].result);}
  const result=jsonResult.parse(await handler(tx));
  await tx`insert into trade_business.business_commands(company_id,request_id,actor_id,kind,payload_hash,result) values(${actor.companyId},${input.requestId},${actor.id},${input.kind},${hash},${tx.json(result)})`;
  return result;
 });
}
export async function nextNumber(tx:BusinessTx,companyId:string,kind:string,day:string){const key=kind+'-'+day.replaceAll('-','');const rows=await tx`insert into trade_business.number_counters(company_id,kind,value) values(${companyId},${key},1) on conflict(company_id,kind) do update set value=trade_business.number_counters.value+1 returning value::text`;return key+'-'+rows[0].value.padStart(5,'0');}
export async function audit(tx:BusinessTx,actor:BusinessActor,subjectId:string,action:string,details:Record<string,string|number|boolean|null>={}){await tx`insert into trade_business.audit_events(company_id,actor_id,subject_id,action,details) values(${actor.companyId},${actor.id},${subjectId},${action},${tx.json(details)})`;}
