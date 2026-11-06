// Original implementation: roles combine a persona and a bounded business skill set.
export const roleActions={prospecting:['leads_upsert'],diligence:['diligence_save_report'],outreach_draft:['outreach_draft_email','outreach_submit_approval']};
const safety='仅处理当前公司数据，保持公司隔离。不发送邮件，需人工审批，禁止自批。无摘要时写「未提供尽调摘要；需人工核查」。';
export const defaultRoles=Object.entries(roleActions).map(([code,allowed_actions],index)=>({id:`00000000-0000-4000-8000-00000000010${index}`,code,display_name:['获客','背调','邮件草稿'][index],system_prompt:`你是${['获客','背调','邮件草稿'][index]}岗位助手。${safety}`,allowed_actions,enabled:true,version:1}));
export function resolveRole(items,code){
 const base=defaultRoles.find(r=>r.code===code);
 if(!base)throw Error('ROLE_ACTION_DENIED');
 return items.find(r=>r.code===code)??base;
}
export function assertRoleAction(role,action){
 if(!role?.enabled||!roleActions[role.code]?.includes(action)||!role.allowed_actions?.includes(action))throw Error('ROLE_ACTION_DENIED');
}
