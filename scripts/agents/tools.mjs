import {skillPrompt} from './skills.mjs';
import {commandSchema} from './p1-schemas.mjs';
import {z} from 'zod';
import {roleActions,resolveRole,assertRoleAction} from './roles.mjs';
const scope={company_id:z.uuid()};
const page={offset:z.number().int().min(0).max(100000).optional(),search:z.string().max(100).optional()};
// A capability can reuse an existing durable role permission. Maps import is an
// alternate entry to the prospecting leads_upsert authority, never a new one.
const writeExtras={prospecting:[{name:'maps_import',authority:'leads_upsert'}]};
function writeDefinitions(roleCode){return [...roleActions[roleCode].map(name=>({name,authority:name})),...(writeExtras[roleCode]??[])];}
function writeDescription(name,roleCode,prompt){
 if(name==='maps_import')return `${prompt}\n\n工具 maps_import：按国家、行业（可选城市、语言、官网补邮箱）调用 aiclient 地图搜客并入库为 source=maps 线索；也可提交已勾选的行。只写线索库，绝不发信、审批或回写客户。`;
 return prompt;
}
const definitions={agent_roles_list:['agent-roles',{}],pipelines_list:['agent-pipelines',{}],runs_list:['agent-runs',{}],run_get:['agent-run',{id:z.uuid()}],customers_get:['customer',{id:z.uuid()}],ai_usage_ledger:['ai-usage-ledger',{day:z.iso.date().optional()}],customers_list:['records',{...page}],followups_list:['followups',{id:z.uuid()}],customer_development_stats:['customer-development',{day:z.iso.date().optional()}],customer_stage_suggest:['customer-stage-suggestion',{id:z.uuid()}],company_get:['company',{}],orders_list:['orders',page],orders_get:['order',{id:z.uuid()}]};
export const tools=Object.entries(definitions).map(([name,[view,fields]])=>({name,view,schema:z.object({...scope,...fields}).strict()}));
export function createTools({companyId,read,write,roleCode='prospecting'}){
 z.uuid().parse(companyId);
 const role=resolveRole([],roleCode);
 const writes=writeDefinitions(roleCode);
 const allWriteNames=[...Object.values(roleActions).flat(),...Object.values(writeExtras).flat().map(w=>w.name)];
 return {
 list:()=>[...(write?writes.map(({name})=>({name,description:writeDescription(name,roleCode,skillPrompt(roleCode,role.system_prompt)),inputSchema:z.toJSONSchema(commandSchema(name).extend(scope),{io:'input'}),annotations:{readOnlyHint:false,destructiveHint:false}})):[]),...tools.map(t=>({name:t.name,description:`Read existing business view ${t.view}`,inputSchema:z.toJSONSchema(t.schema),annotations:{readOnlyHint:true,destructiveHint:false}}))],
 async listCurrent(){
 if(!write)return this.list();
 const {items}=await read(new URLSearchParams({view:'agent-roles'}));
 const current=resolveRole(items,roleCode);
 return this.list().filter(t=>{
  if(t.annotations.readOnlyHint)return true;
  const authority=writes.find(w=>w.name===t.name)?.authority??t.name;
  return current.enabled&&current.allowed_actions.includes(authority);
 }).map(t=>t.annotations.readOnlyHint?t:{...t,description:writeDescription(t.name,roleCode,skillPrompt(roleCode,current.system_prompt))});
 },
 async call(name,raw){
 const definition=writeDefinitions(roleCode).find(w=>w.name===name);
 if(write&&allWriteNames.includes(name)){
 const args=commandSchema(name).extend(scope).parse(raw);
 if(args.company_id!==companyId)throw Error('FORBIDDEN');
 const authority=definition?.authority??name;
 assertRoleAction(role,authority);
 const {items}=await read(new URLSearchParams({view:'agent-roles'}));
 assertRoleAction(resolveRole(items,roleCode),authority);
 return write(name,{requestId:args.requestId,payload:args.payload},{roleCode});
 }
 const tool=tools.find(t=>t.name===name);if(!tool)throw Error('UNKNOWN_TOOL');
 const args=tool.schema.parse(raw);if(args.company_id!==companyId)throw Error('FORBIDDEN');
 const params=new URLSearchParams({view:tool.view});if(name==='customers_list')params.set('kind','customer');
 for(const [key,value] of Object.entries(args))if(key!=='company_id')params.set(key,String(value));return read(params);
 }};
}
