/**
 * @author 朱春茂
 * @copyright Copyright © 2026 朱春茂. All rights reserved.
 * See the repository NOTICE for attribution scope.
 */
import type { Metadata } from 'next';
import './globals.css';
import './theme.css';
import {ThemeSwitcher} from '@/modules/appearance/theme';
import {themeBootstrap} from '@/modules/appearance/bootstrap';
export const metadata: Metadata = { title: '思链台 · 外贸业务工作台', applicationName:'思链台', icons:{apple:'/brand/reselat-mark.png'}, authors:[{name:'朱春茂'}], creator:'朱春茂', other:{copyright:'Copyright © 2026 朱春茂. All rights reserved.'}, description: '客户、订单、采购、出运、收付款与单据工作台' };
export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="zh-CN" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head><body>{children}<ThemeSwitcher/></body></html>; }
