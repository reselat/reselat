import {localTestEnabled} from '@/server/local-test/guard';
import {pageEmployee} from '@/server/auth/session';
import {IdentityError} from '@/server/auth/employee';
import {WorkspaceShell} from '@/modules/business/ui/shared';
import './workspace.css';
export const dynamic='force-dynamic';
export default async function WorkspaceLayout({children}:{children:React.ReactNode}){let session;let unavailable='';try{session=await pageEmployee();}catch(error){if(!(error instanceof IdentityError))throw error;unavailable=error.code==='NOT_CONFIGURED'?'身份权限库尚未完成配置。':'当前员工账号未开通或已停用，请联系管理员。';}if(!session)return <div className="account-card"><h1>工作空间暂不可用</h1><p>{unavailable}</p></div>;const {employee}=session;return <><div hidden={!localTestEnabled()} style={{padding:8,textAlign:"center",background:"#fff7ed",color:"#9a3412"}}>RESELAT 本机虚构数据验收 · 微信／邮箱未连接 · AI调用关闭</div><WorkspaceShell actor={{id:employee.id,role:employee.role}}>{children}</WorkspaceShell></>;}
