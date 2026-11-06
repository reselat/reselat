# M-AI4 完成说明

实现 Path A / gate A 的保守低置信路径：到期扫描直接生成新版本草稿及 pending / human 审批记录，复用现有人工审批流程；未伪造审查席位或自动高置信结论。此阶段没有接入 outreach_audit_record/fuse，高置信自动批准及回写仍由原有互审流程负责。无 SMTP、send 或发送授权。

- Host/admin 命令：`scanDueFollowups` / API action `outreach_followup_scan`，输入 requestId 和 payload.today（ISO 日期）。普通 Agent 无此命令权限；Host 使用现有管理员身份校验。
- 按 created_at、id 确定每客户最新跟进，只扫描到期记录。要求关联线索已有回写草稿及已接受背调；文案绑定上一封已回写 subject/body 与最新已接受摘要，标记轮次。
- 默认常量 MAX_NO_REPLY_REDRAFTS=2；按客户关联线索累计包括待审草稿。客户 payload.stopContact=true 或 payload.replied=true 停止。缺前置、重复、上限、停止原因写入 audit_events。
- 公司事务锁串行化扫描；数据库 company_id/followup_id 唯一索引防重；requestId 复用现有命令重放。生成草稿、审批、审计同事务提交。
- 管理看板展示可再起草数量、最近扫描结果和最近二次草稿状态，提供扫描按钮。审计事件 outreach_followup_redraft / outreach_followup_scan 可追溯；gate=human、actor=human-queue。
- 技能 followup-cadence 已同步退出规则、次数与权限边界。

部署前需通过既有迁移流程应用 `20261105160000_followup_redraft.sql`；本次未操作生产库或 .env。本机数据库初始化/升级已接入迁移。

验证：Vitest fixture 覆盖已回写→到期→pending 人审队列、重复扫描、两次上限以及摘要查询；现有测试覆盖完整 gate A 高置信自动回写及低置信人工审批。`npm test -- --maxWorkers=2`：119 文件、467 测试通过；`npm run typecheck` 通过。

限制：只支持显式布尔停止/回复标记，不推断自由文本或邮件回复；无自动调度和邮件传输。人工需在审批中核实沿用的历史文案。
