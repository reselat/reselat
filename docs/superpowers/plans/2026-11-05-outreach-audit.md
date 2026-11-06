# Outreach audit Implementation Plan

**Goal** 按最新落库背调定制开发信，通过互审闸门 A 自动批准并原子回写。

**Architecture** 复用 runBusinessCommand 的公司锁、幂等和事务。独立 outreach_audits 保存背调快照、草稿、席位和融合结果，复用现有审批表及事务内 writeback。

**Tech Stack** TypeScript、Zod、PostgreSQL、Vitest/PGlite、React。

**Spec** docs/development/二期-M-AI2-任务简报.md

## Global Constraints

路径 A，闸门 A。至少一个独立审计席，一致率默认 2/3。最新已接受背调为必需。高置信自动批准并自动回写，审计 gate=auto / actor=system-policy。低置信进入现有人工队列。无 SMTP、outreach_send、MCP approve。fixture 无密钥。最小 UI。

## Review Focus

- 新背调到达后旧快照不能自动批准。
- 单席、重复席、分歧、敏感声明不能绕过闸门。
- 自动回写失败时批准、队列和客户均回滚，可安全重试。
- 跨公司、非管理员、Agent 人工批准均被拒绝。
- 旧人工审批和回写调用保持兼容。

## Tasks

- [x] 1. 先写确定性融合和 fixture 测试并观察失败，实现 subject/body 共识与背调约束。
- [x] 2. 写 PGlite 测试并观察失败，实现迁移、提交/记席/融合命令。复用事务内回写，冻结完成任务，验证幂等、版本、权限、回滚。
- [x] 3. 接入 Host HTTP 命令和状态读取，最小 UI 展示及操作，验证 Agent 禁止人工批准。
- [x] 4. Vitest 全量、typecheck、代码互审，修复重要发现，写完成说明并按指定消息提交。

## Decisions

用户已指定路径与闸门并要求执行，本计划直接实施。仅承认 auto_accepted 或 human accept 的审计关联 report，历史手工 report 需先完成背调互审。敏感句必须在绑定摘要中逐字出现才能自动通过，保守降级人审。

## Verification

全量 Vitest 116 文件 / 450 测试通过，typecheck 通过。独立互审的三项重要发现经失败回归测试验证并修复，详见完成说明。
