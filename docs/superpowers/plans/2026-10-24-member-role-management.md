# 成员与角色管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user chooses delegation. Track each step with checkboxes.

**Goal:** 交付可在管理员工作台添加、修改角色、停用、归档和恢复员工的三个可视化模块。

**Architecture:** 保留现有Next.js API、Supabase Auth和app_backend私有业务数据库边界。新增受控Auth创建适配器与可恢复创建记录，成员操作在公司行锁及乐观版本保护下执行。页面拆分成员列表、编辑抽屉、角色权限、审计记录，所有权限由服务端执行。

**Tech Stack:** 现有Next.js、React、TypeScript、zod、postgres、Supabase SDK、Vitest及PGlite；不新增依赖。

**Spec:** docs/superpowers/specs/2026-10-24-member-role-management.md（用户已确认）。

## Global Constraints

- 单公司，角色仅admin/sales/operations，不增加finance或自定义角色。
- 维持MFA、有效会话和公司范围检查；最后一名启用管理员不可降级、停用、归档；管理员不可归档自己。
- 移除为归档并停用，保留Auth账号、客户归属、历史记录；不永久删除、不自动移交客户。
- 密码和secret不进入日志、文档、Git或浏览器持久存储；无自动邮件和费用。
- 原共享迁移冻结；最终追加SQL先本地验证并展示，再单独获批应用。
- 无Git仓库，不初始化、不提交。主智能体为本轮文件唯一写入者。

## Review Focus

- 创建请求在Auth成功后断网：不能重复创建或宣告失败已回滚；明确待核对并可恢复关联（Task 2）。
- 改名、改角色与归档并发：旧version不能覆盖新状态，公司内最后管理员必须保留（Task 1）。
- 移除拥有客户的员工：客户和归属记录保留，归档员工不可再访问（Task 1）。
- 账号创建成功但响应丢失后双击重试：相同幂等键返回已有结果，不再调用Auth（Task 2/4）。
- 网络失败、窄屏和键盘操作：不把空列表当成功，抽屉焦点/关闭/敏感字段清空正确（Task 4）。

### Task 1: 成员状态、追加迁移与更新API

**Files:** 新建scripts/sql/member-management.sql、src/server/admin/members.ts、tests/member-management.test.ts；修改src/server/auth/employee.ts、session.ts、src/app/api/admin/employees/route.ts。

**Interfaces:**
- Member DTO: {id,name,role,enabled,version,createdAt,archivedAt}，role复用Employee['role']；归档时间为ISO字符串或null。
- parseMemberChange(input:unknown) -> {id,version,name?,role?,enabled?,action?:'archive'|'restore'}；禁止不明确的混合action。
- listMembers(actor, {search,role,status,offset,limit}) -> {employees,total,counts}，limit最大50，status为active/disabled/archived/all；搜索参数化SQL。
- mutateMember(actor,input) -> UPDATED|VERSION_CONFLICT|LAST_ADMIN_REQUIRED|SELF_ARCHIVE_FORBIDDEN。

- [ ] 写失败测试：归档拥有business_records的员工不删关联；归档状态与enabled一致；不允许普通启用归档员工；最后管理员/自归档/跨公司/旧版本拒绝。
- [x] 运行npx vitest run tests/member-management.test.ts，确认功能缺失导致失败。
- [x] 编写追加SQL：archived_at；创建追踪表；最小列权限与审计SELECT；扩展保护最后管理员约束；CHECK确保归档员工enabled=false。所有表/视图保留私有schema边界。
- [x] 实现查询与变更；公司锁、操作者复核、版本条件和审计同事务；恢复默认停用，须明确启用。
- [x] 以PGlite执行原迁移及追加迁移，SET ROLE app_backend验证可用操作与越权拒绝；运行定向测试见绿。

### Task 2: 无邮件账号创建及失败恢复

**Files:** 新建src/server/admin/auth-admin.ts、provisioning.ts、src/app/api/admin/employees/provision/route.ts、src/app/api/admin/employees/provision/[id]/route.ts、tests/member-provisioning.test.ts。

**Interfaces:**
- createAuthAccount({email,password}): Promise<{userId:string}>，官方Auth Admin createUser，email_confirm:true，不发送邮件。仅从SUPABASE_AUTH_ADMIN_KEY读取服务端凭据，缺失返回AUTH_ADMIN_NOT_CONFIGURED。
- provisionMember(actor,{requestId,name,email,password,role}) -> {requestId,status:'completed'|'pending'|'needs_reconciliation',memberId?}。
- recoverProvision(actor,requestId) -> 同结果；仅已记录Auth UID才可重试员工关联；未知Auth结果必须显示待人工核对，不自动重复调用createUser。

- [ ] 写失败测试：缺secret/非admin/非AAL2/跨公司/重复邮箱、相同requestId并发与重复提交、操作者中途被停用、Auth成功但关联失败、Auth请求结果未知。
- [x] 运行npx vitest run tests/member-provisioning.test.ts确认失败。
- [x] 实现createUser适配器及固定脱敏错误分类；请求密码仅内存使用。初始密码不少于12字符并尊重上游更严格策略；不得回显上游原始错误。
- [x] 创建记录以company+requestId唯一，持有者变更原子处理。追踪仅存操作ID、操作者、Auth UID、预期姓名/角色、安全状态；不持久化密码或邮箱。已成功的请求再次提交仅返回已有成员，不覆盖角色。
- [x] 失败/结果未知时不自动删除Auth用户、不盲目重试；管理页呈现待核对记录和可执行的恢复关联入口。
- [x] 定向测试见绿，确认Auth创建成功但未关联账号无法通过checkEmployee。

### Task 3: 审计和角色权限契约

**Files:** 新建src/app/api/admin/audit/route.ts、src/server/admin/audit.ts、src/modules/account/admin/roles.ts、tests/member-audit.test.ts；读取src/server/workspace/records.ts核对实际能力。

**Interfaces:**
- GET /api/admin/audit?offset&limit -> {events:[{id,actorName,subjectName,action,createdAt,summary}],hasMore}；limit最大50；不透传原始details。
- ROLE_DESCRIPTIONS映射三个真实角色到展示名及权限说明，不作为授权来源。

- [x] 写失败测试：审计只读本公司、只限admin+AAL2、未知action安全展示、details中虚构敏感字段不返回。
- [x] 实现参数化分页和安全摘要；姓名无法解析时显示“历史成员”。
- [x] 将角色能力逐项对照当前API，不把尚未迁移的订单等演示功能标为已支持；定向测试见绿。

### Task 4: 模块化可视化管理员工作台

**Files:** 修改src/app/admin/page.tsx、src/modules/account/admin.tsx；新建src/modules/account/admin/{members,member-drawer,roles-panel,audit-panel,provisioning-panel}.tsx、admin.css、tests/member-admin-ui.test.ts。

**Interfaces:** AdminEmployees({currentUserId:string})作为工作台入口；模块复用Tasks 1–3 API及DTO，局部CSS限定admin-workbench，保留工作区返回和退出入口。

- [x] 先读impeccable craft-floor及Operate指导，固定方案已有的浅色办公视觉，不引入图片生成或新组件依赖。
- [ ] 编写虚构数据测试：筛选与状态汇总、当前用户/最后管理员操作禁用、幂等键重试不变、提交后密码清空、错误不显示上游正文。
- [x] 实现桌面侧栏+宽屏内容；默认成员管理，自动请求、分页/搜索/筛选；右上添加；行编辑/启停/归档；顶部统计必须来自服务器全量统计而非当前页。
- [x] 实现右侧抽屉、窄屏全屏、原生标签和键盘可达；焦点进入并在关闭后回到触发按钮；提交锁定；错误保留非敏感字段，密码字段退出/成功即清空。
- [x] 实现归档确认与恢复入口、角色卡片和只读矩阵、审计分页、创建待核对/恢复面板；不放占位按钮，配置缺失明确提示。
- [x] 使用虚构API数据在隔离本地页面验证桌面与窄屏，一轮集中截图检查、一轮修正复查；不截图真实成员邮箱、密钥或MFA二维码。

### Task 5: 隐藏输入配置、集成与交付

**Files:** 新建scripts/configure-auth-admin.mjs、tests/auth-admin-config.test.ts；更新.env.example、docs/setup/管理员首次连接配置.md、PROJECT_CONTEXT.md及聚合证据文件。

- [x] 复用hidden-input.ts，配置脚本仅本机TTY隐藏输入服务端key，固定项目URL，拒绝publishable key；原子保存忽略的.env.local、0600，不打印值。此脚本不发起账号创建。
- [ ] 写并运行配置失败测试：非TTY、错误key类型、错误项目、写入失败，不泄露凭据。
- [x] 顺序运行npm test、npm run lint、npm run build、npm run typecheck，记录实际结果；构建与typecheck不并行。
- [x] 最终独立只读复核本轮鉴权/迁移/创建恢复代码；修复Important问题并复测，评审不读取.env或真实个人资料。
- [ ] 向用户展示最终追加SQL及精确权限、目标测试项目和回滚；获得批准前不应用迁移。用户在本机运行隐藏配置；不从聊天接收key。
- [ ] 应用获批迁移后用真实app_backend验证权限/约束（无业务数据读取）；安全顾问检查，重启本项目开发服务。
- [ ] 经用户另外批准才创建专用虚构员工做真实创建→登录→改角色→停用→归档验证；否则真实创建闭环明确标为未验证，不把单测当真实验收。无邮件、无永久删除。
- [x] 交付页面、操作说明、测试证据和未覆盖项；不声称全系统订单/财务已迁移共享数据库。

## 执行方式与审批点

建议Native：由当前主智能体在本会话顺序实施，最终一次独立只读复核；各任务共享权限和创建状态契约，集中实现更少接口偏差。另一选项是逐任务委派和审查，成本更高。

用户先审核本计划并选择执行方式。之后本地实现持续推进，直到可评审交付；仅最终共享迁移应用和安全密钥配置需要按已确认边界处理。

## 当前交付状态

本地实现/129测试/静态检查/构建/虚构UI验收及独立复核已完成；本地实现未使用Git。共享迁移、服务端secret和真实账号闭环未执行。部分实现步骤按记录调整：审计直接放于route；创建流程核心分为provision-flow.ts和数据库适配器；角色/界面契约有纯逻辑测试，实际浏览器使用虚构响应。具体证据见docs/evidence/2026-10-24-member-management.md。

验证范围说明：上述仍未勾选的复合测试步骤只覆盖了其中一部分场景，不能视为完整验收；已验证范围以证据文件实际测试和浏览器结果为准。尤其真实数据库并发、云端新员工闭环及本机磁盘写失败尚未实测。
