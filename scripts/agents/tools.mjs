import {skillPrompt} from './skills.mjs';
import {commandSchema} from './p1-schemas.mjs';
import {z} from 'zod';
import {roleActions,resolveRole,assertRoleAction} from './roles.mjs';
const scope={company_id:z.uuid()};
const page={offset:z.number().int().min(0).max(100000).optional(),search:z.string().max(100).optional()};
const definitions={agent_roles_list:['agent-roles',{}],pipelines_list:['agent-pipelines',{}],runs_list:['agent-runs',{}],run_get:['agent-run',{id:z.uuid()}],customers_get:['customer',{id:z.uuid()}],ai_usage_ledger:['ai-usage-ledger',{day:z.iso.date().optional()}],customers_list:['records',{...page}],followups_list:['followups',{id:z.uuid()}],customer_development_stats:['customer-development',{day:z.iso.date().optional()}],customer_stage_suggest:['customer-stage-suggestion',{id:z.uuid()}],company_get:['company',{}],orders_list:['orders',page],orders_get:['order',{id:z.uuid()}]};
export const tools=Object.entries(definitions).map(([name,[view,fields]])=>({name,view,schema:z.object({...scope,...fields}).strict()}));
export function createTools({companyId,read,write,roleCode='prospecting'}){
 z.uuid().parse(companyId);
 const role=resolveRole([],roleCode);
 return {
 list:()=>[...(write?roleActions[roleCode].map(name=>({name,description:skillPrompt(roleCode,role.system_prompt),inputSchema:z.toJSONSchema(commandSchema(name).extend(scope),{io:'input'}),annotations:{readOnlyHint:false,destructiveHint:false}})):[]),...tools.map(t=>({name:t.name,description:`Read existing business view ${t.view}`,inputSchema:z.toJSONSchema(t.schema),annotations:{readOnlyHint:true,destructiveHint:false}}))],
 async listCurrent(){
 if(!write)return this.list();
 const {items}=await read(new URLSearchParams({view:'agent-roles'}));
 const current=resolveRole(items,roleCode);
 return this.list().filter(t=>t.annotations.readOnlyHint||(current.enabled&&current.allowed_actions.includes(t.name))).map(t=>t.annotations.readOnlyHint?t:{...t,description:skillPrompt(roleCode,current.system_prompt)});
 },
 async call(name,raw){
 if(write&&Object.values(roleActions).flat().includes(name)){
 const args=commandSchema(name).extend(scope).parse(raw);
 if(args.company_id!==companyId)throw Error('FORBIDDEN');
 assertRoleAction(role,name);
 const {items}=await read(new URLSearchParams({view:'agent-roles'}));
 assertRoleAction(resolveRole(items,roleCode),name);
 return write(name,{requestId:args.requestId,payload:args.payload},{roleCode});
 }
 const tool=tools.find(t=>t.name===name);if(!tool)throw Error('UNKNOWN_TOOL');
 const args=tool.schema.parse(raw);if(args.company_id!==companyId)throw Error('FORBIDDEN');
 const params=new URLSearchParams({view:tool.view});if(name==='customers_list')params.set('kind','customer');
 for(const [key,value] of Object.entries(args))if(key!=='company_id')params.set(key,String(value));return read(params);
 }};
}
