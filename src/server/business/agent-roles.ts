// @ts-expect-error Shared read-only Node skill catalog.
import {loadTradeSkills} from '../../../scripts/agents/skills.mjs';
import {z} from 'zod';
import {checkAdmin} from '@/server/auth/employee';
import type {BusinessActor} from './access';
import {runBusinessCommand,audit,type BusinessTx} from './commands';
import {readBusiness} from './order-data';
// @ts-expect-error Shared policy with independent Node Host/MCP entry points.
import {defaultRoles,roleActions,resolveRole,assertRoleAction} from '../../../scripts/agents/roles.mjs';
const code=z.enum(['prospecting','diligence','outreach_draft']);
export async function agentRoles(actor:BusinessActor){
 checkAdmin(actor,actor.aal);
 return readBusiness(actor,async db=>{
 const rows=await db`select * from trade_business.agent_roles where company_id=${actor.companyId} order by code`;
 return {items:defaultRoles.map((r:{code:string})=>({...r,company_id:actor.companyId,...rows.find(row=>row.code===r.code),skills:loadTradeSkills(r.code)}))};
 });
}
export async function assertAgentWrite(actor:BusinessActor,roleCode:unknown,action:string,tx?:BusinessTx){
 checkAdmin(actor,actor.aal);const role=code.parse(roleCode);
 const check=async(db:BusinessTx)=>{
 const rows=await db`select * from trade_business.agent_roles where company_id=${actor.companyId} and code=${role}`;
 assertRoleAction(resolveRole(rows,role),action);
 };
 if(tx)return check(tx);
 return readBusiness(actor,check);
}
export async function roleUpsert(actor:BusinessActor,raw:unknown){
 checkAdmin(actor,actor.aal);
 const input=z.object({requestId:z.uuid(),payload:z.object({id:z.uuid(),code,displayName:z.string().trim().min(1).max(100),systemPrompt:z.string().trim().min(1).max(10000),allowedActions:z.array(z.string()).max(4),enabled:z.boolean()}).strict()}).strict().parse(raw);
 const p=input.payload;
 if(p.allowedActions.some(action=>!roleActions[p.code].includes(action)))throw Error('INVALID_INPUT');
 return runBusinessCommand(actor,{...input,kind:'role_upsert'},async tx=>{
 const rows=await tx`insert into trade_business.agent_roles(company_id,id,code,display_name,system_prompt,allowed_actions,enabled)
 values(${actor.companyId},${p.id},${p.code},${p.displayName},${p.systemPrompt},${p.allowedActions},${p.enabled})
 on conflict(company_id,code) do update set display_name=excluded.display_name,system_prompt=excluded.system_prompt,allowed_actions=excluded.allowed_actions,enabled=excluded.enabled,version=trade_business.agent_roles.version+1 returning id,version`;
 await audit(tx,actor,rows[0].id,'role_upsert',{code:p.code,version:rows[0].version});
 return {id:rows[0].id,version:rows[0].version};
 });
}
