# 领导演示 · 缺 BREVO_API_KEY 失败回退演练

日期：2026-11-05（Asia/Shanghai）  
环境：本机 `test:local` → `http://127.0.0.1:3120`  
目的：演示「密钥未配置时人点发失败可读、不误发」；**不是**对真实客户的发送。

## 步骤摘要

1. 备份 `.env.local`，将 `BREVO_API_KEY=` 置空（保留 `BREVO_SENDER_EMAIL`）。
2. 重启 `npm run test:local`（Next 需重载 env）。
3. 另种一条约线索（避免与 Nordic Harbor 真发草稿冲突）：
   - `DEMO_LEAD_EMAIL=fail-key-drill+siliantai@example.test`
   - `node scripts/seed-leadership-demo.mjs`
4. 管理员登录 → 人工批准（`outreach_approve`，需 `human_actor_id`）。
5. 点「经 Brevo 发送」或调 `outreach_send_brevo`。

## 期望结果（已实测）

| 项 | 值 |
|---|---|
| HTTP | `409` |
| code | `BREVO_CONFIG_REQUIRED` |
| 文案 | 请配置服务端 BREVO_API_KEY 与 BREVO_SENDER_EMAIL。 |
| approvalId | `1fca8453-a867-4673-9231-84ce59bdacf4` |
| draftId | `25784a56-49e1-41e7-b64c-8505dffb95e5` |

说明：`brevoConfiguration()` 在占发送位之前执行，缺 key 时**不会**写入 `brevo_send_started_at`，还原密钥后同一批准草稿仍可再点发送。

## 还原

1. 从备份恢复 `.env.local`（勿把完整 key 写入 git）。
2. 再重启 `test:local`。
3. 本记录演练在还原后对同一草稿补点发送成功（messageId `<202611050921.12353068449@smtp-relay.mailin.fr>`）——收件为虚构 `fail-key-drill+…@example.test`，仅用于确认配置恢复；领导演示主路径仍用 Nordic Harbor → `speex975@gmail.com`。

## 演示话术

- 「没配密钥时按钮会失败提示，不会默默发出去。」
- 「Agent / MCP 不能调发送；只有人点「经 Brevo 发送」。」
