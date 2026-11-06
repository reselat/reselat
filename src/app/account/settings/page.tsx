import {localTestEnabled} from '@/server/local-test/guard';
import Link from 'next/link';
import {pageEmployee} from '@/server/auth/session';
import {AccountSettings} from '@/modules/account/settings';
export const dynamic='force-dynamic';
export default async function Page(){await pageEmployee();return <div className="account-card" style={{maxWidth:900}}><Link href="/workspace">← 返回工作空间</Link><h1>个人账号设置</h1>{localTestEnabled()?<p>当前为本机虚构身份，没有真实邮箱、密码或二次验证器。真实账号安全设置仅在独立身份服务配置后可用。</p>:<AccountSettings/>}</div>;}
