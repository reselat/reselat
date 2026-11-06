import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),refresh:vi.fn()}),usePathname:()=>'/workspace/system-settings',useSearchParams:()=>new URLSearchParams()}));
import {WorkspaceShell} from '@/modules/business/ui/shared';
import {SystemSettings,AiModelSettings} from '@/modules/settings/settings';
import {RefundWorkspace} from '@/modules/business/ui/refund-workspace';
function render(role:'admin'|'sales'|'operations',children:React.ReactNode){const props={actor:{id:'00000000-0000-4000-8000-000000000002',role},children};return renderToStaticMarkup(React.createElement(WorkspaceShell,props));}
it('shows personal settings to every role and admin tools only to administrators',()=>{for(const role of ['admin','sales','operations'] as const){const html=render(role,React.createElement(SystemSettings));expect(html).toContain('设置中心');expect(html).toContain('个人资料与账号安全');expect(html).toContain('维护我的资料');if(role==='admin'){expect(html).toContain('员工资料与角色');expect(html).toContain('配置AI大模型');}else{expect(html).not.toContain('href="/admin"');expect(html).not.toContain('href="/workspace/ai-settings"');expect(html).not.toContain('业务操作记录');}}});
it('shows a finance AI precheck entry and instructions without requiring order navigation',()=>{const html=render('admin',React.createElement(RefundWorkspace));expect(html).toContain('退税资料与AI预审');expect(html).toContain('AI退税预审');expect(html).toContain('AI预审本版本');expect(html).toContain('关联销售订单');});
it('explains sales permissions and blocks direct model settings for non-admin roles',()=>{expect(render('sales',React.createElement(RefundWorkspace))).toContain('管理员或订单运营负责人办理');expect(render('sales',React.createElement(AiModelSettings))).toContain('仅限管理员维护');});
