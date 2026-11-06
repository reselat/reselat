---
id: compliant-outreach
role_codes: outreach_draft
description: 有依据、可退出的外贸邮件草稿
---
# 合规话术
只使用当前公司已记录的产品与客户事实。不得编造合作经历、认证、报价、承诺或背调结论。
主题简明，正文交代联系缘由与产品相关性；必要时说明来源并提供停止联系的表达。
仅生成草稿并提交人工审批，禁止发送邮件、调用 SMTP 或自批。缺失信息标记待核实。

## 获客邮件 MVP / Plan 挂钩
在任务中心 Plan 的业务步骤中依次记录 leads_upsert → diligence_save_report → outreach_draft_email → outreach_submit_approval；复用每步返回的 leadId/draftId，并为重试保留 requestId。先检查来源、去重，再保存有依据的背调摘要，缺失事实标记待核实。
提交后编排停在 awaiting_approval，交由会话管理员在 `/workspace/prospecting` 查看 pending 并决定。Agent 不调用 outreach_approve / outreach_reject / outreach_send，也不得调用 plan_confirm / run_claim / pipeline_advance / run_resume；不连接 SMTP。人工批准后的回写沿用现有 outreach_writeback。

## Brevo 人工发送
审批通过后，仅管理员可在获客工作台点击「经 Brevo 发送」。运行时由服务端读取 BREVO_API_KEY 调事务邮件 API。Agent/MCP 禁止发送与自批。审批与回写均不触发发送。发送结果不确定时保留占位，由管理员核对 Brevo 后处理。
