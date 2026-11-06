import {z} from 'zod';
export const memberSchema=z.object({id:z.string().uuid(),name:z.string(),role:z.enum(['admin','sales','operations']),enabled:z.boolean(),version:z.number().int(),createdAt:z.string(),archivedAt:z.string().nullable()});
export type Member=z.infer<typeof memberSchema>;
export const membersSchema=z.object({employees:z.array(memberSchema),total:z.number(),counts:z.object({total:z.number(),enabled:z.number(),disabled:z.number(),archived:z.number(),admins:z.number()}),roles:z.array(z.object({role:z.enum(['admin','sales','operations']),count:z.number()})),offset:z.number(),limit:z.number()});
export type MembersData=z.infer<typeof membersSchema>;
export const auditSchema=z.object({events:z.array(z.object({id:z.string(),actorName:z.string(),subjectName:z.string(),createdAt:z.string(),summary:z.string()})),hasMore:z.boolean()});
export const provisionsSchema=z.object({hasMore:z.boolean(),operations:z.array(z.object({id:z.string().uuid(),name:z.string(),role:z.enum(['admin','sales','operations']),state:z.string(),canRecover:z.boolean(),createdAt:z.string()}))});
const messages:Record<string,string>={MIGRATION_REQUIRED:'成员管理数据库更新尚未应用。完成更新后即可使用。',AUTH_ADMIN_NOT_CONFIGURED:'账号创建服务尚未配置，请先完成本机安全配置。',VERSION_CONFLICT:'成员资料已变更，请刷新列表后重试。',LAST_ADMIN_REQUIRED:'必须保留至少一位启用的管理员。',SELF_ARCHIVE_FORBIDDEN:'不能移除当前登录的管理员。',ARCHIVED_MEMBER:'请先恢复归档成员。',FORBIDDEN:'当前账号无权限或双重验证已过期，请重新登录验证。',UNAUTHENTICATED:'登录已过期，请重新登录。',REQUEST_MISMATCH:'创建编号已用于另一项请求，请重新打开添加面板。',RECONCILIATION_REQUIRED:'结果需要核对，请查看待处理记录。'};
export async function checkedJson(response:Response):Promise<unknown>{let json:unknown;try{json=await response.json();}catch{throw new Error('服务响应异常，请稍后重试。');}if(!response.ok){const result=z.object({code:z.string()}).safeParse(json);throw new Error(result.success?(messages[result.data.code]||'操作未完成，请检查输入后重试。'):'操作未完成，请稍后重试。');}return json;}
export function memberState(member:Pick<Member,'enabled'|'archivedAt'>){return member.archivedAt?'已归档':member.enabled?'已启用':'已停用';}
export function canArchive(member:Member,currentUserId:string,adminCount:number){return member.id!==currentUserId&&!(member.role==='admin'&&member.enabled&&adminCount<=1)&&!member.archivedAt;}
