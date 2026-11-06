# 外贸工作平台 G0—S1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本轮由当前会话顺序执行；不自动启用多智能体或提交。

**Goal:** 建立可运行、可测试的本地基础版本，交付虚构业务界面、精确金额／分配规则、权限边界测试及 PDF 样稿探针，为真实数据库和正式业务闭环提供基线。

**Architecture:** 单 Next.js 应用，模块化业务层。演示数据与生产适配器显式隔离，未配置数据库或 Auth 时业务 API 拒绝服务，不默认使用管理员。先离线测试，再申请真实隔离数据库验证。

**Tech Stack:** Next.js、React、TypeScript、Zod、Vitest、Drizzle、postgres、Supabase SDK、React-PDF；版本安装前检查支持、安全与许可证，再锁定。

**Spec:** `/Volumes/数据/开发项目/外贸工作站/外贸工作平台最终开发方案-v1.0.md`

## Global Constraints

- 单公司、自营采购出口、接单后采购；首发一个出运批次只属于一销售订单。
- 金额为最小单位整数；单价、数量和汇率精确表示，禁止 JS 浮点算钱。
- 正式数据只能经业务 API 进入私有业务 schema，正式附件私有。
- 不使用真实客户、银行账号、签名；演示数据标明虚构。
- 不新增云资源、不收费、不生产写入、不外发、不提交／推送。
- 新依赖与构建脚本先审批；核心授权方案需人类审核；不得绕过审批。
- 本计划仅覆盖 G0—S1 及后续数量规则的离线探针，S2—S5 尚未完成，不以演示替代验收。

## Review Focus

1. 未配置 Auth 时是否意外进入管理员身份：Task 3 必须拒绝，演示页独立于业务 API。
2. decimal 字符串、大金额及不同币种精度是否产生差分：Task 2 精确断言。
3. 无效业务对象、其他公司和被停用账号是否泄露字段：Task 3 拒绝矩阵。
4. 两个进程并发分配是否超量：Task 4 只声称纯规则通过；真实事务竞争必须在隔离数据库补验。
5. PDF 长品名、100 行、中文缺字是否被测试数量掩盖：Task 5 必须输出样稿并视觉检查。

## 本轮依赖与核心方案：需人类审核

允许动作建议：仅本地项目新增并安装以下依赖、编写 package.json／TypeScript／测试与构建配置；不改全局工具、不升级机器运行时、不写远程 CI。

| 类别 | 计划依赖 | 用途 |
| --- | --- | --- |
| 网页 | next、react、react-dom | App Router 与页面 |
| 类型／质量 | typescript、@types/node、@types/react、@types/react-dom、vitest、eslint、eslint-config-next | 编译、测试、静态检查 |
| 表单 | zod、react-hook-form、@hookform/resolvers | 输入及字段校验 |
| 数据 | drizzle-orm、postgres、@supabase/supabase-js、@supabase/ssr | 后续数据库与身份适配；不自动连接云端 |
| 单据 | @react-pdf/renderer | 固定 PDF 样稿 |

先安装实际任务所需子集，不预装未使用组件。金额用标准 BigInt＋受限十进制字符串算法完成首轮探针，不为同类计算引入多个库；后续复杂财务算法再评估 decimal 库。

安装前核验具体版本、许可证和生命周期脚本，锁文件保留精确版本。若发现不兼容、需要额外依赖或全局工具，先说明，不自动扩围。

核心设计：统一 authorize(principal, action, resource)；固定 admin／sales／operations 权限包；停用／公司范围先拒绝，成本单独投影。数据库 app_backend 使用非超级角色，私有 schema 不暴露 Data API；数量命令同事务锁父行再校验。此设计仅为请求审核，不表示已实现或已授权。

## Task 1：可运行的本地应用骨架

**Files:** 创建 package.json、pnpm-lock.yaml、tsconfig.json、next.config.ts、eslint.config.mjs、vitest.config.ts、.gitignore、README.md、src/app/layout.tsx、src/app/page.tsx、src/app/globals.css、tests/smoke.test.ts。

**Interfaces:** 产生可运行网页、明确命名的 dev／test／typecheck／lint／build 脚本；不创建开放业务写接口。

- [ ] 审批通过后，核验版本与许可证；在当前目录手工建立最小配置，避免脚手架覆盖已有文档或生成另一份 AGENTS.md。
- [ ] 安装锁定依赖；先检查生命周期脚本，不盲目放行全部 build scripts。
- [ ] 建立最小首页和虚构数据标签，导航到客户、订单及主数据区域。
- [ ] 执行规划命令 `pnpm test`、`pnpm typecheck`、`pnpm lint`、`pnpm build`；只有脚本实际建立并成功后登记为已核实。
- [ ] 更新 README 和 PROJECT_CONTEXT，记录错误及实际运行结果；不提交。

## Task 2：金额与数量离线规则探针

**Files:** src/domain/decimal.ts、src/domain/money.ts、src/domain/quantities.ts、tests/domain/money.test.ts、tests/domain/quantities.test.ts。

**Interfaces:** parseDecimal(value: string, scale: number): bigint；lineAmountMinor(quantity: string, unitPrice: string, currencyScale: number): bigint；assertAvailable(requested: bigint, available: bigint): void。首轮仅非负数量，舍入 HALF_UP 用于虚构样例，不作为生产财务规则。

- [ ] 先写失败测试：lineAmountMinor('3', '0.10', 2)===30n；('1','1.005',2)===101n；('1','1.5',0)===2n；大金额不经 Number 转换。
- [ ] 数量测试：余量 100、请求 101 拒绝；请求 100 允许；负值、NaN、指数表示及不受支持精度拒绝。
- [ ] 运行 `pnpm test -- tests/domain` 并保存失败证据；确认失败源于待实现行为。
- [ ] 实现受限纯函数；再运行同一测试和类型检查。
- [ ] 标注：纯函数通过不能证明数据库并发；生产币种和舍入仍待财务确认。

## Task 3：授权边界与无凭据拒绝

**Files:** src/server/auth/principal.ts、src/server/auth/authorize.ts、src/server/auth/project-order.ts、tests/auth/authorize.test.ts、tests/auth/project-order.test.ts。

**Interfaces:** Principal={id,companyId,role,enabled}；ResourceScope={companyId,ownerId,sharedWith}；authorize(principal: Principal|null, action: Action, resource: ResourceScope): void；projectOrder(order, principal): OrderView。Action 首轮仅 customer.read/customer.write/order.read/order.write/cost.read/settings.write。

- [ ] 人类确认本计划的核心权限方案后才实现。
- [ ] 先写拒绝测试：null 身份、停用用户、不同公司、非共享他人客户、sales 请求 settings.write／cost.read。
- [ ] 先写成功测试：sales 本人或共享客户；admin 本公司；operations 仅授权资源。
- [ ] 投影测试断言无 cost.read 的返回对象不存在采购成本字段，不能只是字段值置空。
- [ ] 见红后最小实现，运行全部授权测试和类型检查。
- [ ] 默认环境无 Auth 连接时返回未配置／未认证错误；不接自签令牌或演示用户进入业务端点。

## Task 4：数据库契约和后续数量事务规格

**Files:** docs/architecture/data-contract-v1.md、docs/architecture/permission-matrix-v1.md、docs/architecture/quantity-transactions-v1.md、docs/fixtures/fictitious-order.json。

**Interfaces:** 固定 UUID 虚构对象；销售行 1,000 件，采购 600＋400；到货分别记录；两批出运总量不超 1,000；company_id、owner_id、version、source 行关系一致。

- [ ] 明确销售、采购、到货、出运和来源的外键、不变量、预留和冲回状态。
- [ ] 明确 applyPurchaseAllocation 和 reserveShipment 的锁顺序、幂等键、版本冲突和审计原子性，不实现内存假事务。
- [ ] 明确 schema 暴露、app_backend／迁移角色和文件授权边界。
- [ ] 写隔离数据库集成测试计划：两连接竞争同一余量只能一方成功，事务中断无部分写入。
- [ ] 本机 PATH 无 Docker／psql 时先记录缺口；不自动安装工具或转用远程库。集成验证待单独确定可用本地运行时。

## Task 5：PDF 与关键页面本地探针

**Files:** src/templates/pi.tsx、src/templates/pdf-fonts.ts、scripts/render-pdf-sample.tsx、src/app/demo/page.tsx、src/app/demo/customers/page.tsx、src/app/demo/orders/[id]/page.tsx、tests/templates/pi-data.test.ts、docs/evidence/2026-10-23-g0-s1.md。

**Interfaces:** PiSnapshot={company,customer,currency,scale,lines,totalMinor,templateVersion}；renderPi(snapshot): Promise<Uint8Array>。输入只有虚构快照；输出到忽略目录，不生成生产正式版本。

- [ ] 在现有方案框架内细化页面：工作台、客户详情、订单详情；订单页展示商品、采购到货、出运和单据页签。
- [ ] 先测单据取数与金额；空行、过长品名、50／100 行样例不丢条目。
- [ ] 注册已核验许可的中文字体；没有合适字体则报告，不静默改成缺字字体。
- [ ] 输出一页和多页 PDF 样稿，检查中文、金额、表头、页码和签字区域；记录耗时与本地环境。
- [ ] 检查桌面页面和键盘操作；演示页面不含任何真实资料，不能被描述为已登录业务系统。
- [ ] 如 React-PDF 不达标，形成明确失败记录及容器替代方案；不自动购买服务或安装 Docker。

## Task 6：全量验证与后续开发入口

**Files:** 更新 README.md、PROJECT_CONTEXT.md、docs/evidence/2026-10-23-g0-s1.md。

- [ ] 全量执行测试、类型检查、静态检查和构建，保存实际摘要。
- [ ] 按测试断言复核角色、金额和虚构订单数量；检查前端 bundle 不含高权限密钥。
- [ ] 只读复核 A 级规则；需要独立审查时优先人类，使用代理必须另有明确授权。
- [ ] 输出“已验证／未验证”：云端网络、Auth、PostgreSQL 并发和恢复未执行则保持未通过。
- [ ] 规划下一片 S1 实际持久化：在已批准隔离运行时建立迁移、真实登录及 CRUD，再进入 S2 采购；不以 demo 替代完整业务交付。

## 自检与交接

最终方案的 M1/M2 范围没有删除；本计划只细化第一片，M2 合同、签名、退税另有后续实施计划，不在本轮暗中铺开。五项 Review Focus 已分别归入 Task 2—5。所有产品命令均为待创建脚本，不伪称跑通。

待用户审阅本计划、选择当前会话顺序执行方式，并批准本地依赖与核心设计后，调用 executing-plans 按任务推进。原规范要求提交询问，因此本计划不自动提交。
