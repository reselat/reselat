# 二期 M-AI2 完成说明

## 交付

沿用路径 A 与闸门 A，实现开发信提交、独立记席、确定性融合、自动批准和自动回写。HTTP action 为 `outreach_audit_submit`、`outreach_audit_record`、`outreach_audit_fuse`，读取使用 `view=outreach-audits`。沿用现有 Host/admin 会话鉴权，MCP 工具清单保留既有边界。

提交参数包含 `leadId` 和可选 `draft`，草稿结构为 `subject`、`body`。未提供草稿时，以最新已接受背调生成简短交流草稿及停止联系表达。服务端绑定 report ID 和摘要快照。只有关联背调互审的 `auto_accepted` 或人工 `accept` report 可用，普通 `diligence_save_report` 记录及历史未互审记录需先完成背调互审，否则返回 `DILIGENCE_REQUIRED`。融合再次读取最新已接受 report，版本或内容变化时转人审。

审计席结构为 `seatId`、`subject`、`body`、`blockers`，禁止 generator 冒充审计席，拒绝重复席，最多 20 席，完成后冻结。共识阈值复用 2/3，至少一席独立审计。任意分歧、待核实、审计阻断或背调未覆盖的敏感句均转人审。融合保留提交版本供人工核对。

高置信在同一个 `runBusinessCommand` 事务中创建 approved 草稿与审批记录，`approval_gate=auto`、`human_actor_id=null`。审计事件记录 `gate=auto`、`actor=system-policy`。随后复用事务内 writeback，自动保存客户、跟进、七天后跟进日期及回写映射。自动回写明确采用通过闸门的已接受摘要。批准、队列、客户、跟进或审计任一步失败，整体回滚；原 requestId 可重试，重复融合另一个 requestId 被拒绝。

低置信创建 pending 草稿并进入原审批队列，仅会话管理员可 `outreach_approve` / `outreach_reject`。审批接口拒绝 Agent 请求。旧人工草稿与回写入口保留兼容。

获客工作台增加提交开发信互审、审计席 JSON 录入、融合按钮、绑定背调和阻断展示。高置信显示自动批准及已回写，低置信转现有人工审批。页面保留“回写 ≠ 已发信”提示。

## 取舍与边界

- 敏感句采用完整句精确匹配已接受摘要，包含认证、独家及常见精确报价检测。不同措辞或引用标记导致无法精确匹配时保守转人审。这是规则校验，语义等价由人工判断。
- `OutreachSeat<T>`、`fixtureOutreachSeat`、`runOutreachSeats` 提供模型扩展接口与离线假席。当前默认生成使用确定性背调模板，真实模型适配器留待后续接入。
- UI 采用简洁 JSON 席位录入，沿用现有页面样式。
- 发信后置，交付范围为草稿、审批与客户跟进回写。

## 数据库与回滚

新增 `scripts/sql/20261105140000_outreach_audits.sql`，应在 M-AI1 迁移之后应用。新增互审表启用 RLS，仅 business_backend 读写，浏览器角色无权限；审批表增加 gate 字段并兼容原人工约束。迁移可重放。

PGlite 演练迁移清单、本机测试数据库新建/升级入口及生产上线手册同步增加该迁移，回滚先处理互审表并恢复人工约束。已有自动批准记录会使恢复约束失败并回滚，需按手册前滚处理。验收使用内存数据库。

## 验证与互审

新增测试覆盖确定性融合、fixture、敏感句、缺少/未接受背调、人工与自动接受背调、背调更新、自动回写摘要一致性、低置信人审、权限及公司隔离、重复席、冻结与幂等、事务失败回滚重试、迁移重放及 RLS、HTTP Host 命令与 Agent 批准拒绝、最小 UI 接线。

独立代码互审发现并修复三项重要问题，均先以失败回归测试复现，再验证修复。

- 补充后置货币和中文计价的精确报价检测。
- 摘要支持检查从子串改为完整句匹配，防止否定上下文被截断。
- 自动回写显式使用闸门验证的已接受摘要，避免采用较新未接受记录。

最终验收记录如下。

- `npm test` 通过，116 个测试文件，450 项测试。
- `npm run typecheck` 通过。
- `git diff --cached --check` 通过。
- 上线手册完整回滚及重新迁移的 PGlite 演练通过。

测试使用 PGlite 内存数据库及 fixture，未依赖真实模型密钥。UI 验证为接线测试，未执行浏览器交互验收。
