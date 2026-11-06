# 2026-10-27 账号设置、员工交接、管理看板

## 本轮范围

实现所有角色个人账号设置（姓名、联系电话、密码、邮箱确认、验证器换机）；管理员批量离职交接（来源先停用，预览/版本指纹/理由/幂等/原子业务事务、身份成员锁）；独立管理看板及每日新增客户/跟进次数/成员去重客户统计，普通角色仅本人。

客户和订单归属、原员工共享权限转交给接手人。含已成交订单；采购/出运/收付款/单据/文件沿原订单访问，保留角色限制，签章授权不转移。历史快照、创建人、跟进人、金额及审计不改写。开发统计归最早创建事件的人，交接不重算业绩。

无新增依赖。原有未提交设计资料、.gitignore 改动、scripts/audit-facts.sh 保留，不纳入本轮业务实现范围。.vercelignore 保留原排除清单，追加 .codegraph、私有文件/备份目录及独立审计脚本，避免索引 socket 被上传。

## 验证

- Vitest：70 文件、234 项通过（原 224 项加 10 项）；PGlite 以 business_backend 角色跑真实 SQL。
- 新增场景：完成订单转交、冻结快照保留、共享权限撤销/接手、旧预览拒绝、重复请求一次、运营任务转交、管理员/MFA/启用来源/停用目标/角色拒绝；北京时间日期边界、全角色零数据、个人隔离、重复跟进去重、重试与编辑不新增客户、归属变化不改业绩；个人资料严格字段、已绑定 MFA 所有角色强制、最后验证器前端保护。
- npm run build、构建后 typecheck、lint、git diff --check 通过。lint 保留原 scripts/codex-progress-monitor.mjs 两项 warning，无新增错误。
- 使用 ego-browser 与 React 检查清单验收真实组件的隔离预览：个人姓名/电话模拟保存，密码不一致阻断；旧设备验证、新设备绑定/验证、再移除旧设备；离职员工选择/范围预览/理由确认；看板独立菜单及原余额/订单面板；390px 无横向溢出，日期框宽 170px；桌面及手机深色截图查看通过。
- 隔离预览在 /tmp/siliantai-members-preview-20261027，明确替换会话/身份与业务接口为虚构响应，没有使用真实凭据。此验证不等于真实密码修改、邮件投递、设备绑定或云端交接。

## 云端

- 只读核对现有业务表列与权限，安全 advisor 更新前后均无告警。
- 已应用 employee_handover_share_permission：grant delete on trade_business.order_shares to business_backend。只有私有角色新增权限；复查 anon/authenticated 均没有 DELETE。没有表结构变化，没有删除/移动真实业务记录，没有身份库 DDL。
- 原项目 prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9，团队 olivers-projects-cfd775b2，CLI 核对账号 oliver-corp。
- 最终部署 dpl_CnSYg6i52QjA8e5BLf5aWA3zn2Ut：READY，云构建通过，58s。已 promote 到 https://trade-workstation-test.vercel.app，原固定别名生效。
- 可回退前版 dpl_3wwZnHywzbg4iPjpqJTSEWK2Kpwy，新增私有权限可保留，不涉及数据格式回退。
- 没有替用户执行真实员工交接、修改密码/邮箱/验证器或发送测试邮件。首次旧登录页观察不能代表无会话。发布后已复用现有业务员会话，线上管理看板与个人设置路由可进入，个人资料 API 200、每日开发统计 API 200、离职交接预览 API 403 FORBIDDEN（无管理员入口），不输出业务资料。未做管理员真实交接或账号安全信息变更，邮件投递与真实设备换机仍需本人验收。浏览器任务3已结束。

发布后以最终部署过滤最近10分钟 level:error，CLI返回0条错误（仅该时间窗口可观测日志，不代表完整业务验收）。
