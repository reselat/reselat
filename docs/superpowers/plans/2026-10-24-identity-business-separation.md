# 身份与业务独立数据库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Current user-selected method remains Native, with a final independent readonly review.

**Goal:** 将现有共享业务访问与身份权限分为两个独立数据库，保留现有账号/MFA和成员管理界面。

**Architecture:** 当前Supabase项目保留身份、员工角色、会话及成员审计；新增独立业务项目承载公司商业资料、客户/产品/供应商、共享关系、业务审计和对接outbox。服务端通过独立authDatabase()/businessDatabase()访问，业务请求先实时鉴权再进入业务事务，无跨库员工外键，不复制实时角色数据。

**Tech Stack:** 现有Next.js/TypeScript/postgres/Supabase SDK/zod/Vitest/PGlite，不新增依赖。

**Spec:** docs/superpowers/specs/2026-10-24-identity-business-separation.md（用户已回复ok批准设计）。

## Global Constraints

- 当前项目trade-workstation-test仅保留身份权限的目标职责；现有旧业务表清理需要另外批准，切换不等于物理清理完成。
- 身份项目不改名，不重建现有Auth/MFA；业务项目不复制Auth用户或角色表。
- 只有admin/sales/operations三个实际角色；业务边界仍限现有共享客户/产品/供应商，不把本机demo功能当成已迁移。
- 无普通跨库原子事务；停用阻断之后的新鉴权请求，已通过鉴权的在途请求可能完成。
- 两套低权限凭据、连接池、TLS配置；缺配置和串库必须拒绝，无单库自动回退。
- 原共享迁移冻结；新项目创建、共享SQL、业务数据移动及旧表清理分别展示并获批。
- 密钥只本机隐藏配置，不进入聊天/日志/文档；无自动邮件/收费/生产/永久删除；无Git初始化或提交。

## Review Focus

- 连接字符串主机不同但实际同一项目：使用项目ref、用途角色和库标记识别，不能只比较URL（Task 1）。
- 身份库断开：业务读写都拒绝，不读缓存允许结果、不转到另一库（Task 3）。
- 归档成员仍有客户：关联保持历史UUID，新owner/share必须实时核验同公司有效员工（Task 3）。
- 切换后业务库已有新增记录：不得直接回切旧库造成分叉，应停止新写、核对后回滚（Task 5）。
- 旧身份库存在真实业务行或附件：只读计数不足以授权导出，逐项审核迁移和清理（Task 5）。

### Task 1: 双连接与用途校验

**Files:** 修改src/server/db/client.ts、config.ts、.env.example；新建tests/database-separation.test.ts。

**Interfaces:**
- authDatabase(): ReturnType<typeof postgres>，读取IDENTITY_DATABASE_URL、IDENTITY_DATABASE_CA_CERT、IDENTITY_PROJECT_REF。
- businessDatabase(): ReturnType<typeof postgres>，读取BUSINESS_DATABASE_URL、BUSINESS_DATABASE_CA_CERT、BUSINESS_PROJECT_REF。
- validateDatabaseTarget(raw:string,purpose:'identity'|'business',projectRef:string): string；只接受identity_backend[.ref]或business_backend[.ref]和对应Supabase直接/池连接，严格TLS及5432，不接受URL查询覆盖。
- TRADE_COMPANY_ID维持稳定UUID；NEXT_PUBLIC_SUPABASE_*仍指身份项目，不增加业务前端key。

- [x] 写失败测试：缺一套配置、错误角色/项目ref、同项目不同pooler域名、相同ref/相同DB目标、错误schema标记、query覆盖均拒绝。
- [x] 执行npx vitest run tests/database-separation.test.ts确认见红。
- [x] 实现独立连接、独立pool，固定max5/preparefalse，显式用途校验。数据库建立deployment_identity用途/ref标记，通过只读探针核对，不在请求中以管理员账号连接。
- [x] 目标测试见绿；旧单库配置明确进入待升级状态，不静默当双库使用。

### Task 2: 身份和业务迁移分离

**Files:** 新建scripts/sql/identity-management.sql、business-initial-schema.sql、tests/separated-schema.test.ts；原member-management.sql标记已被新设计替代，禁止用于本轮共享应用。

**Interfaces:**
- 身份trade_private保留companies身份目录、employees、member_provisions、身份audit_events、active_auth_sessions视图；identity_backend为新专用角色，不沿用混合app_backend扩权。
- 业务trade_business包含company_profiles(id, legal profile JSON)、business_records、record_shares、audit_events、integration_outbox；业务内部复合外键保留，owner_id/user_id/actor_id为跨库历史UUID，无employees/Auth表。
- 两库各有deployment_identity(purpose,project_ref)，仅受控迁移可写，应用角色只读。

- [x] 写失败测试：两个独立PGlite实例分别执行迁移；业务实例无employees/Auth，身份新角色无法读旧业务表，业务角色无法创建/读角色表；跨公司业务关系拒绝，历史owner UUID可保留。
- [x] 运行npx vitest run tests/separated-schema.test.ts确认见红。
- [x] 身份追加迁移包含此前本地归档/创建追踪/最后管理员保护与私有会话视图SELECT，授予identity_backend最小身份权限；旧app_backend暂不撤销，待切换验证后单独处理。
- [x] 新业务库建表、角色NOLOGIN、最小列权限；所有新表私有，不给anon/authenticated USAGE。公司商业资料独立于身份目录，迁移清单只传公司稳定UUID，不导出原业务资料。
- [x] 定向数据库测试见绿；SQL写入最终审核文件，未批准不得云端应用。

### Task 3: 身份仓储和业务仓储改线

**Files:** 修改src/server/auth/session.ts、src/server/admin/members.ts、provisioning.ts、src/app/api/admin/audit/route.ts、src/app/api/workspace/records/route.ts；新建src/server/auth/member-directory.ts、tests/separated-records.test.ts；更新现有相关测试mock到显式连接。

**Interfaces:**
- rereadEmployee(actor:Employee):Promise<Employee>，从身份库读当前状态、角色和version，归档/停用/公司变化拒绝。
- assertActiveCompanyMember(companyId:string,userId:string):Promise<void>，服务端创建owner/share关联前验证；不写业务角色镜像。
- 成员API和Auth管理接口全部走身份连接；records API全部以trade_business表执行业务事务。

- [x] 先失败测试：身份库拒绝/断连时业务查询零次调用；非admin/AAL不足保持拒绝；跨公司owner/shared user拒绝；停用/归档/角色版本变更后拒绝新写请求。
- [x] 执行npx vitest run tests/separated-records.test.ts确认见红。
- [x] 改线session/admin到authDatabase，原Auth项目和MFA流程保持；业务库不查询employees。
- [x] records POST在鉴权后、业务事务前重新核验身份版本/角色；业务事务锁company_profiles并进行owner/版本检查，将业务审计和业务写同事务。记录跨库检查窗口，不宣称可撤销在途操作。
- [x] 身份审计API过滤身份动作，业务审计不写入身份库；资料JSON维持兼容，接口响应字段不变。
- [x] 两个独立本地实例验证完整身份检查→业务读写→权限拒绝；定向及原有角色范围测试见绿。

### Task 4: 安全配置与管理员状态提示

**Files:** 新建scripts/configure-separated-databases.mjs和tests/separated-setup.test.ts；修改scripts/configure-auth-admin.mjs、src/modules/account/admin/types.ts及管理入口的配置提示；更新docs/setup/管理员首次连接配置.md。

- [x] 写失败测试：非TTY/错误项目/连接角色用途/证书验证失败/管理员连接泄漏拒绝；任何一步未完成都不以完成双库状态写配置。
- [x] 复用hidden-input及databaseTls，在本机隐藏输入两个目标管理员连接；分别验证目标库标记和预期专用角色NOLOGIN，生成各自随机低权限密码，只将低权限连接原子写入忽略配置0600，不保存管理员连接。
- [x] 两库角色启用无法保证一个事务；逐阶段说明已启用哪一库，保留可恢复的低权限配置；失败后禁止盲目重置另一库或重复初始化。支持只读检查/继续验证模式，诊断只有白名单用途/阶段/错误码。
- [x] 旧configure-database脚本提示已被新分库设置替代，防止用户误运行；Auth Admin secret仍只对应身份项目，不改NEXT_PUBLIC身份配置。
- [x] 页面在身份迁移/业务连接/账号创建密钥缺失时展示具体准备项，禁用不可用操作；身份就绪时可管理成员，即使业务库仍待配置，不把两个子系统可用性绑定。
- [x] 运行npx vitest run tests/separated-setup.test.ts见绿；用户本机输入凭据后才能真实连通验收，不从聊天收取。

### Task 5: 云端切换审核与最终验收

**Files:** 新建docs/architecture/2026-10-24-separated-database-cutover.md；更新PROJECT_CONTEXT.md、分库聚合证据；不删除已有业务表或本机demo。

- [x] 顺序执行npm test、npm run lint、npm run build、npm run typecheck；最终一次独立只读复核，修复Important并复测。界面仅在配置状态提示发生变化时用虚构数据核验。
- [x] 只读核验当前项目业务表数量/依赖、已存在附件元数据计数，不读取正文、不导出；业务附件若尚未云端实现则如实记录，不迁移不存在的资源。
- [x] 核对当前组织可用免费项目配额/区域和费用硬上限，展示新项目trade-workstation-business-test具体创建动作；没有配额时停下，不恢复旧暂停项目或升级付费套餐。
- [x] 获单独批准后创建业务项目，展示两份最终SQL和回滚，再批准应用。仅建表/公司UUID目录/用途标记不等于获准移动现有业务数据。
- [x] 现有共享业务若非空，另列逐表迁移（含共享关系、业务审计、对接outbox、附件）和对账清单，获批准后安全复制，不打印正文；若全空则记录计数证据后初始化新库。
- [ ] 用户本机安全配置完成后，实际两套低权限连接校验角色、用途、权限拒绝及跨库无回退；重启本项目服务，真实登录/MFA仍用原账号。真实新建虚构测试员工/业务记录需明确批准测试对象，不动已有管理员。
- [ ] 切换验收后身份库的旧business_records/record_shares/业务audit及outbox仍属待清理遗留；列出旧授权和对象，单独获批才清理，不承诺本轮自动删除。
- [ ] 切换后若需回滚，先关业务新写并核对新增数据，禁止盲目回旧连接；无数据分叉才允许回切。保留所有历史数据与审计。

## 执行和完成界限

沿用用户此前确认的Native，在当前会话顺序实现，最终独立只读复核，不重复选择执行方式。请审核此分库实施计划后开始本地代码；共享资源及数据动作按Task 5具体内容分别审批。完成状态区分：本地双库逻辑通过、云端双库连通、业务切换、遗留清理，不用一个“完成”覆盖未做步骤。

## 本轮实测界限

本地改造已完成，45文件145测试、lint/build/typecheck通过。配置向导仅离线/非TTY及恢复策略测试，未用真实凭据运行；UI仅配置提示SSR核验，布局沿用此前虚构浏览器验收，不宣称本轮真实登录验收。云端只读计数和报价已取得；创建配额以实际创建结果为准。Task 5云端写入、真实连接和旧对象清理仍未执行。

2026-10-24云端状态补记：用户批准后两库结构/标记已初始化，旧业务计数全0无需资料搬迁。新角色NOLOGIN、本机连接/身份管理secret未配置，真实验收及旧对象清理仍未执行。详见切换审核执行补记。
