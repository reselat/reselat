import {pageEmployee} from '@/server/auth/session';
import {Mfa} from '@/modules/account/mfa';
export const dynamic='force-dynamic';
export default async function Page(){await pageEmployee(false,true);return <div className="account-card"><h1>双重验证</h1><Mfa/></div>;}
