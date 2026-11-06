# 二期 M-AI1 完成说明

## 交付

采用路径 A 与闸门 A。生成稿、各审计席摘要及结构化声明、证据、融合摘要、一致率、置信等级、阻断项、状态与人工决定均保存在 `trade_business.diligence_audits`。高置信在同一业务事务中追加 `diligence_reports`，低置信进入获客工作台背调人工例外队列。人工可确认落库或驳回。

新增迁移 `scripts/sql/20261105130000_diligence_audits.sql`，已接入本地新库、已有本地库与 rehearsal 迁移。上线手册已补充正向顺序及逆序回滚依赖。迁移在 PGlite 中演练，生产迁移留给部署流程。

## 确定性规则

- 同字段候选按有有效来源、独立席支持数、文本字典序依次排序。来源必须引用任务已存的证据 ID，未知或重复证据 ID 会报错。
- 一致率为每项最终声明的支持席数除以生成席和审计席总数，取所有字段最低值。阈值常量 `DILIGENCE_AGREEMENT_THRESHOLD` 初值为 `2/3`。纯函数允许显式阈值，持久化命令使用常量。
- 至少一个独立审计席、一致率达标且无阻断项才自动落库。重复席名、重复字段、空声明会被拒绝。
- 各席任一阻断项、未知内容或不同值分歧进入人工，分歧值写入「待核实」。有来源的候选仍优先展示。
- 结构化 `sensitive` 标记与字段名和值的文本检测共同阻断无来源认证、独家、精确报价数字。自由摘要中的敏感声明必须完整对应有来源的声明。保守检测可能增加人工条目。
- 证据支持调用方提供的文本或 HTTP(S) URL，URL 仅作引用。来源内容的真实性由提交者和审计席负责。字符匹配以 trim 后的精确值为准，同义表述可能进入人工。

## 命令入口

沿用 `POST /api/workspace/business` 的 `{action,input:{requestId,payload}}`，管理员身份与 MFA、同源校验、公司作用域均复用现有机制。Host 可使用既有公司标识头调用三个管道命令。

| action | payload |
| --- | --- |
| `diligence_audit_submit` | `leadId`，可选 `draft`、`evidence` |
| `diligence_audit_record` | `auditId`、`review` |
| `diligence_audit_fuse` | `auditId` |
| `diligence_audit_decide` | `auditId`、`decision` 为 `accept` 或 `reject`、`human_actor_id` 等于当前会话用户 |

`draft` 使用 `{summary,claims:[{key,value,sources,sensitive?}]}`。`review` 在相同结构上增加唯一 `seatId` 和 `blockers`。`evidence` 使用 `[{id,text?,url?}]`，每项至少有文本或 URL。生成席保留名为 `generator`，审计席不能使用该名称。未提供初稿时生成「未知，待人工核查」占位。

调用顺序为提交、逐席记审、融合。融合后冻结席位和融合结果，重试相同 requestId 返回原结果，新请求重复融合或重复人工决定被拒绝。报告、状态、审计日志与幂等记录原子提交，故障时一起回滚。已有手工背调仍兼容。

`GET /api/workspace/business?view=diligence-audits` 返回当前公司最近 500 项。UI 在所选线索背调区显示最近状态，并在独立背调例外区展示全部线索待人工项、融合内容、阻断与证据。

人工命令只允许会话 HTTP，带 Agent 标识即拒绝，未加入 MCP schema 或审批工具。人工确认保留初始 `needs_human` 与融合依据，另记 `human_decision=accept`、操作者和报告 ID。人工驳回置 `rejected_by_policy`。此状态设计保留自动闸门与人工覆核的可追溯区别。

## 席位扩展

`src/modules/business/diligence-fusion.ts` 提供 `DiligenceSeat<T>`、`runDiligenceSeats`、`fixtureSeat`。可注入生成席和多个审计席，在进程内取得结果后通过上述命令落库。本阶段使用确定性 fixture，真实多模型 API 适配器作为后续扩展。

## 验证

- `npm test` 全量通过，112 个文件、420 项测试。
- `npm run typecheck` 通过。
- 新增模块和测试的定向 ESLint 检查通过，`git diff --check` 通过。
- 29 项新增测试覆盖来源优先、两家一致、单家推断、恰好 2/3 阈值、低置信、分歧、未知、敏感字段及数字、有效证据、重复席位、无效输入、假席调用、自动及人工落库、驳回、幂等、终态冻结、公司隔离、RLS/授权、事务失败重试、HTTP Host/Agent 边界、跨站拒绝与 UI 接线。
- 原有 rehearsal 测试覆盖新增迁移的正向、重跑与整套回滚后重建。
- 独立代码审查发现的敏感字段名绕过问题已补回归并修复。UI 验证采用静态接线和 HTTP 测试，浏览器交互尚未验收。

工作区原有日志、本地测试目录和生成文件均排除在本次提交之外。
