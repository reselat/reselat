# 深色模式层次与可读性调整

用户明确指定配色：大背景#0B0F19、侧栏#060911、分隔边框#1E293B、卡片#141C2E、表头#1E293B；选中菜单钛灰底纯白字；标题与指标#FFFFFF、辅助文字#94A3B8；新建销售订单#38BDF8底、#0F172A字。

实现：src/app/theme.css更新深色语义变量，业务/成员管理导航单独使用深色底；选中态白字，卡片轻阴影，常规动作与主题开关改钛灰。仅销售订单创建链接使用明蓝动作色（包括订单列表入口），hover提亮；Dashboard余额区添加shared-balances类，辅助财务行使用蓝灰文字。浅色变量不变，不改数据、权限、路由、SQL、依赖或环境配置。

验证：npm run build、构建后npm run typecheck通过；npm run lint无error，保留巡检2项原有warning；git diff --check通过。外观任务未重跑197项业务测试，不删改原测试。

ego-browser隔离Next预览渲染真实Dashboard/WorkspaceShell/ThemeSwitcher与虚构只读资料，不连接云端。通过getComputedStyle核实：背景rgb(11,15,25)、侧栏rgb(6,9,17)且右边框1px rgb(30,41,59)、卡片rgb(20,28,46)、表头/选中底rgb(30,41,59)、核心文字rgb(255,255,255)、辅助与余额行rgb(148,163,184)、创建按钮rgb(56,189,248)和文字rgb(15,23,42)。浅色仍为背景rgb(244,245,247)、白卡、深灰创建按钮。390px视口document宽390，无横向溢出。已查看深浅桌面截图；图片保存在artifacts/dark-depth/。

额外1440px截图因浏览器窗口已最小化未取得，不冒称该截图通过；已有桌面截图与390px检查有效。未升级Ego Lite。

发布目标沿用已授权独立测试项目trade-workstation-test/prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9，CLI文件快照；未commit/push，巡检HEAD不是部署版本。部署dpl_Cyr54mL9QrgtezmGAHFNQL6w5K9o已READY，固定别名https://trade-workstation-test.vercel.app生效；可回退前版dpl_DhxRjamEvRg9EdMuMSga2qYiJJVm。

成员管理隔离页额外核对：侧栏rgb(6,9,17)，选中项rgb(30,41,59)底、纯白字。此次该页尚无表格节点，未把成员表头作为已验证项。隔离预览已停止。

线上公开资源验证：固定地址/login返回200，实际HTML引用的CSS返回200，包含全部7个关键深色值、侧栏规则和销售订单创建规则。未使用本机hash猜测线上资源，也未登录/写业务资料。该验证证明新版CSS已分发；页面颜色与布局证据来自本机真实组件。
