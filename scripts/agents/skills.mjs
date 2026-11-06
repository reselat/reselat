import {readFileSync,realpathSync} from 'node:fs';
import {join,relative,isAbsolute} from 'node:path';
// Fixed, repository-owned catalog. No request-controlled paths or script execution.
const catalog=[
 {id:'compliant-outreach',role_codes:['outreach_draft'],description:'合规外贸邮件草稿'},
 {id:'diligence-checklist',role_codes:['diligence'],description:'带来源与不确定性的背调清单'},
 {id:'approval-rules',role_codes:['prospecting','diligence','outreach_draft'],description:'公司隔离、写回与人工审批'},
 {id:'lead-qualification',role_codes:['prospecting'],description:'有来源的获客线索合格判断'},
 {id:'quote-boundaries',role_codes:['outreach_draft'],description:'报价事实、贸易术语与承诺边界'},
 {id:'followup-cadence',role_codes:['prospecting','outreach_draft'],description:'依据联系历史建议跟进节奏与退出'},
];
// Host and Next start from the project root (including standalone output).
const root=join(process.cwd(),'skills','trade');
export function loadTradeSkills(roleCode,ids){
 if(!['prospecting','diligence','outreach_draft'].includes(roleCode))throw Error('SKILL_DENIED');
 const allowed=catalog.filter(s=>s.role_codes.includes(roleCode));
 if(ids!==undefined&&(!Array.isArray(ids)||ids.some(id=>!allowed.some(s=>s.id===id))))throw Error('SKILL_DENIED');
 return allowed.filter(s=>ids===undefined||ids.includes(s.id)).map(s=>{
 const path=realpathSync(join(root,s.id,'SKILL.md')),rel=relative(realpathSync(root),path);
 if(rel.startsWith('..')||isAbsolute(rel))throw Error('SKILL_DENIED');
 const content=readFileSync(path,'utf8');
 if(Buffer.byteLength(content)>16000)throw Error('SKILL_DENIED');
 return {...s,content};
 });
}
export function skillPrompt(roleCode,prompt){
 return [prompt,...loadTradeSkills(roleCode).map(s=>`技能 ${s.id}（只读说明，不授予权限）\n${s.content}`)].join('\n\n');
}
