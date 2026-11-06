# 思链台五模块菜单调整

范围：只调整共享业务工作台导航组件及样式，保留既有路由、服务端权限与菜单角色过滤条件。未改本机旧版/demo菜单、业务数据、数据库、密钥、依赖或构建配置。

分类：

| 业务模块 | 原有入口 |
| --- | --- |
| 客户管理 | 客户与跟进 |
| 产品及供应商管理 | 产品与HS、供应商 |
| 业务台 | 业务总览（原工作台）、销售订单、采购与到货、单据中心 |
| 物流管理 | 出运装箱 |
| 财务管理 | 业务收付款、退税资料 |

公司设置、签名印章、业务审计单列“设置与审计”；成员角色与双重验证保留账户入口。采购归订单履约，物流归出运，退税资料归结算后的财务准备。原路径与页面功能不变。

交互：原生details/summary可键盘展开收起，当前页面所属模块默认展开；路由切换重置展开状态以显示当前位置。订单详情和新建页高亮销售订单。桌面菜单区可独立滚动；650px以下双列分组、限制菜单高度，账户入口保持可见；使用既有主题变量。

本地验证：npm run build、构建后npm run typecheck、npm run lint通过；lint仍为既有巡检脚本2项warning，git diff --check通过。纯导航外观改动未新增镜像实现测试，未重跑全业务197项套件，原测试文件不改。

ego-browser使用/tmp中隔离Next预览渲染真实WorkspaceShell与主题组件，不连接云端。验证管理员13个原入口无遗漏；sales 8个、operations 10个，与原过滤条件一致。键盘Enter折叠/展开通过；实际点击收付款后路径与aria-current正确；订单详情/new均高亮销售订单。默认仅当前模块展开，五组标题全部可见。390px时document.scrollWidth与innerWidth均390，无整页横向溢出。截图artifacts/navigation/desktop-dark.png、mobile-dark.png；已检查浅/深主题。

发布：沿用用户此前授权的独立测试项目trade-workstation-test（prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9），通过Vercel CLI发布本机文件快照；巡检HEAD仅为本机索引，非一一对应部署来源。本次dpl_DhxRjamEvRg9EdMuMSga2qYiJJVm，已核实READY，固定别名https://trade-workstation-test.vercel.app已指向本次部署。前一可回退版本dpl_7RTjC6abEkLvnrdMBg4dwBRZB36m。无新增付费资源。

线上检查：固定测试域名登录页正常显示；本次未进入已登录业务页面验证菜单。远程构建资源hash与本机构建不同，直接请求本机chunk路径返回404，不将该请求作为线上菜单成功证据。菜单行为证据为上述本机真实组件验证。Ego Lite提示可选更新，未升级；本机隔离预览已停止。
