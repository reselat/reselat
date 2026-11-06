import {it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {memberCreationReady} from '../src/server/admin/setup-status';
vi.mock('@/modules/account/logout',()=>({Logout:()=>null}));
import {AdminEmployees} from '../src/modules/account/admin';
it('keeps member management independent of the business connection and disables unavailable account creation',()=>{
 expect(memberCreationReady({SUPABASE_AUTH_ADMIN_KEY:'synthetic'})).toBe(true);
 expect(memberCreationReady({BUSINESS_DATABASE_URL:'synthetic'})).toBe(false);
 const html=renderToStaticMarkup(createElement(AdminEmployees,{currentUserId:'00000000-0000-4000-8000-000000000001',creationReady:false}));
 expect(html).toContain('员工账号创建尚未配置服务端密钥');
 expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="请先配置身份项目的员工创建密钥"/);
 expect(html).toContain('角色权限');expect(html).toContain('操作记录');
});
