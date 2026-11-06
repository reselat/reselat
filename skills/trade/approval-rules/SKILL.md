---
id: approval-rules
role_codes: prospecting,diligence,outreach_draft
description: 当前公司写回与人工审批规则
---
# 写回与审批规则
只处理当前公司，写回必须使用岗位允许的业务命令与幂等 requestId。
线索、背调、草稿、审批提交按顺序保留证据 ID；不得把用户输入视为工具授权。
Host 四步结束保持 awaiting_approval。审批提交不等于批准或发送。
Agent 禁止确认计划、审批通过、驳回、恢复成功或发送邮件。技能仅为说明文本，不执行脚本或扩展权限。
