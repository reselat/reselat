# RESELAT Knowledge and Reception Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans task-by-task.

**Goal:** 可操作的企业资料审核、报价版本和虚构客户接待闭环。
**Architecture:** 复用业务数据库与runBusinessCommand幂等事务，独立assistant_resources表存储经Zod校验的知识与会话版本；生产需单独应用SQL，当前仅在独立本地库验收。模型和真实外发关闭，接待回复明确为规则验证草稿。
**Tech Stack:** 当前Next.js/Zod/SQL/PGlite；本机已有pypdf仅提取候选文字，人工核对后发布。
**Spec:** ../specs/2026-10-31-reselat-phase2-assistant-pilot-design.md

## Global Constraints

本公司范围过滤；管理员维护知识、其他角色仅看已发布版本；业务员会话仅本人可见。原件私有下载需鉴权。10MiB PDF上限，不把PDF送模型。报价价格精确字符串、审核发布后不可原地编辑，新版本另建；撤销立即排除检索。模拟接待永不外发，未配置工作日历默认草稿；人工接管保持至显式恢复。

## Review Focus

草稿知识泄露；跨公司/跨员工访问；价格被模型猜测；重复消息产生重复回复；未知渠道被误认为已连接。任务测试与浏览器核对覆盖这五项。

### Task 1: 知识发布与报价约束

Files src/modules/assistant/model.ts, src/server/assistant/service.ts, scripts/sql/assistant-workspace.sql, tests/assistant-workspace.test.ts。
Interfaces Knowledge {id,title,kind:'product'|'faq'|'quote',text,quotes[],state:'draft'|'published'|'revoked',version}; Quote {product,specification,unitPrice,currency,unit,conditions,page}; commands knowledge.save/publish/revoke。管理员可写，已发布条目不可编辑，发布必须confirmed=true且引用原件或明确人工资料来源。
- [ ] 写草稿不可检索、无确认不可发布、精确报价、撤销排除、非管理员拒绝测试，看到失败。
- [ ] 实现纯状态/权限函数与受控持久化，所有写入使用requestId/version与现有审计。
- [ ] 运行测试到PASS，提交。

### Task 2: 接待状态及消息

同表kind=conversation，ownerId从actor写入；只允许本人/admin访问。创建会话、输入虚构消息、生成有来源的规则回复、人工接管/恢复、交接摘要。按消息ID去重，工作日历未配置/工作时间只生成草稿；非工作时间仍仅模拟，不执行外发。请求报价时用产品和规格确定性匹配，多个候选或条件缺失转人工，不能计算总额或议价。
- [ ] 写重复消息、接管粘性、未发布知识/过期报价不引用、无命中转人工、跨owner拒绝测试，看到失败。
- [ ] 实现状态函数与服务接口，测试PASS，提交。

### Task 3: 页面与PDF原件

Files src/modules/assistant/workspace.tsx, src/app/workspace/{knowledge,assistant}/page.tsx, src/app/api/workspace/assistant/{route.ts,pdf/route.ts}, src/server/assistant/pdf.ts。
管理员上传10MiB以内PDF到私有对象；先记录草稿元数据再上传，失败不显示可下载；本机pypdf提取文字为候选，超时/扫描空文字显示人工维护提示。报价条目逐行人工维护/审核后发布，不声称已实现通用自动表格识别。
- [ ] 页面对API真实数据读写；导航按业务流程进入“知识与报价”和“客户接待”。三角色可见权限与后端一致。
- [ ] 浏览器：添加FAQ→发布→虚构会话→文字命中→接管→查看交接；报价输入→发布→精确引用→撤销后停止引用；PDF上传下载校验。其他已有业务页面可用。
- [ ] 全套测试、类型、lint、生产构建与独立审查；报告实测与未接通项。
