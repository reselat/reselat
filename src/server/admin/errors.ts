import {accountError} from '@/server/auth/http';
const errors:Record<string,[number,string]>={LAST_ADMIN_REQUIRED:[409,'必须保留至少一位启用的管理员。'],SELF_ARCHIVE_FORBIDDEN:[409,'不能移除当前登录的管理员。'],ARCHIVED_MEMBER:[409,'请先恢复归档成员，再修改状态。'],NOT_ARCHIVED:[409,'该成员未归档，请刷新列表。'],AUTH_ADMIN_NOT_CONFIGURED:[503,'账号创建服务尚未配置，请完成本机安全配置。'],CREATE_REJECTED:[409,'账号创建被拒绝，请检查邮箱是否已注册及密码是否符合要求。'],PROVISION_BUSY:[409,'创建请求正在处理，请稍后刷新状态。'],PROVISION_NOT_FOUND:[404,'找不到该创建记录。'],REQUEST_MISMATCH:[409,'此创建编号已用于另一项请求，请重新打开添加面板。'],RECONCILIATION_REQUIRED:[409,'账号创建结果需要核对，请查看待处理创建记录。']};
export function adminError(error:unknown){
 const message=error instanceof Error?error.message:'';
 const known=Object.keys(errors).find(key=>message===key||(key==='LAST_ADMIN_REQUIRED'&&message.includes(key)));
 if(known)return Response.json({code:known,message:errors[known][1]},{status:errors[known][0],headers:{'cache-control':'no-store'}});
 const dbCode=typeof error==='object'&&error!==null&&'code' in error?error.code:undefined;
 if(['42P01','42703'].includes(typeof dbCode==='string'?dbCode:''))return Response.json({code:'MIGRATION_REQUIRED',message:'成员管理数据库更新尚未应用。'},{status:503,headers:{'cache-control':'no-store'}});
 return accountError(error);
}
