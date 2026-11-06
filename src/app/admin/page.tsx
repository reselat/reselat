import {pageEmployee} from '@/server/auth/session';
import {IdentityError} from '@/server/auth/employee';
import {AdminEmployees} from '@/modules/account/admin';
import {memberCreationReady} from '@/server/admin/setup-status';
import {Logout} from '@/modules/account/logout';
export const dynamic='force-dynamic';
export default async function Page(){let failure:IdentityError|undefined;let currentUserId='';try{currentUserId=(await pageEmployee(true)).employee.id;}catch(e){if(e instanceof IdentityError)failure=e;else throw e;}if(failure)return <div className="account-card"><h1>{failure.code==='NOT_CONFIGURED'?'身份权限库尚未就绪':'无管理权限'}</h1><p>{failure.code==='NOT_CONFIGURED'?'请先完成身份库迁移和独立连接配置。':'此功能仅限管理员使用，销售与运营账号无权进入管理员中心。'}</p><Logout/></div>;return <AdminEmployees currentUserId={currentUserId} creationReady={memberCreationReady(process.env)}/>;}
