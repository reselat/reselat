import {Login} from '@/modules/account/login';
import {localTestEnabled} from '@/server/local-test/guard';
export const dynamic='force-dynamic';
export default function Page(){return <>{!localTestEnabled()&&<Login/>}{localTestEnabled()&&<section className="account-card"><h2>RESELAT 本机虚构数据验收</h2><p>独立本地身份库与业务库；以下是测试身份，不使用真实密码或MFA。生产环境不可用。</p><form method="post" action="/api/local-test/session"><label>测试身份<select name="role"><option value="admin">测试管理员</option><option value="sales">测试业务员</option><option value="operations">测试运营</option></select></label><button className="button primary" type="submit">进入本机工作台</button></form></section>}</>}
