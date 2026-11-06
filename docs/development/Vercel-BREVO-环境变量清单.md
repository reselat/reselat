> ⚠️ **已非主部署路径（2026-11-05）**：生产改为 Cloudflare Workers，见 [Cloudflare-部署清单.md](./Cloudflare-部署清单.md)。本文件保留作 **Vercel 回退** 用；「raw key vs MCP token」一节对 Cloudflare 同样适用。
> 上线顺序：生产库备份 → 合分支推送 → Supabase 按顺序跑迁移 11–13 → Cloudflare 配 secret 并 deploy → Ego Lite 冒烟。

# Vercel · BREVO 环境变量清单

> 供人工在 Vercel Project 配置 Preview / Production。  
> **禁止**在本文档或 PR 中粘贴完整 API key。  
> 交叉引用：`docs/development/二期-生产上线手册.md`（Brevo 发信节）、`docs/development/领导演示-合分支说明.md`。

## 变量一览

| 变量名 | 必需 | 示例形态（勿填真值） | 用途 |
| --- | --- | --- | --- |
| `BREVO_API_KEY` | 真发时必需 | `xkeysib-…`（Brevo 控制台「SMTP & API」→ **API key**） | 服务端调用 Brevo Transactional API |
| `BREVO_SENDER_EMAIL` | 真发时必需 | `you@your-verified-domain.com` | 发件人；须在 Brevo 已验证 |
| `BREVO_SENDER_NAME` | 可选 | `公司名 / 演示名` | 发件显示名；未设用产品默认 |

未配置时：人点发应失败并提示缺 `BREVO_API_KEY` / `BREVO_SENDER_EMAIL`（配置缺失提示，而非静默成功）。

## 与 Cursor MCP Brevo token 的区别

| | 产品运行时 `BREVO_API_KEY` | Cursor / MCP Brevo 连接 |
| --- | --- | --- |
| 形态 | 原始 **`xkeysib-…` API key** | 常为 MCP / OAuth / JWT 等**包装 token** |
| 用途 | Next/业务服务端人点发 | Agent 工具侧连接器 |
| 可否混用 | **否** — 产品要 raw key；把 MCP token 塞进 `BREVO_API_KEY` 会失败 | 不替代产品 env |

来源：Brevo → SMTP & API → 创建/复制 **普通 API key**（前缀 `xkeysib-`）。不要把 MCP 面板里的 token 抄进 Vercel。

## Vercel 配置步骤（人工）

1. 打开 [Vercel Dashboard](https://vercel.com) → 对应 Project（siliantai / 外贸工作站部署项目）。
2. **Settings → Environment Variables**。
3. 逐项添加上表三个变量（至少前两个）：
   - **Environment**：按需勾选 **Production**、**Preview**（建议两套都配；勿把生产 key 误贴到无关项目）。
   - Value：粘贴 raw `xkeysib-…` 与已验证发件邮箱；**不要**勾选进 git / 写入仓库文件。
4. 保存后 **Redeploy** 使新 env 生效（仅改 Settings 不自动注入到已在跑的 Deployment）。
5. Host（本机 Agent Host）**不上云（Cloudflare/Vercel）**；本清单只覆盖 Web/业务侧需要读 `BREVO_*` 的部署。

本机 local-test：把 `BREVO_*` 写进 `.env.local`（已 gitignore）即可；Next `dev` 会加载该文件，`start-local-test.mjs` 也不会剥离 `BREVO_*`。也可用 shell `export` 注入。

## 发件人验证

- 发件邮箱 / 域须在 Brevo **Senders & Domains**（或等价）完成验证，否则 API 拒发。
- 演示曾用验证发件人示例：`wanjiesale@gmail.com`（仅作本机验收记录，生产用公司域）。

## 部署后冒烟（禁止自动脚本真发）

1. 确认生产/预发已应用 `20261105160000_outreach_send.sql`（见上线手册）。
2. 管理员登录获客工作台 → 对 **approved** 草稿点「经 Brevo 发送」。
3. 成功：草稿写入 `sent_at` / `brevo_message_id`；在 Brevo 活动日志可见。
4. **不要**用 CI / Agent / 批处理脚本对真实客户自动连发；仅人点发。
5. 同一草稿失败占位后默认不可自动再发，需人工在 Brevo 对账后再处理。

## 回滚 / 关停真发

1. Vercel → 删除或清空 `BREVO_API_KEY`（及可选 sender 变量）→ Redeploy。
2. 再点「经 Brevo 发送」应 **失败** 并提示缺配置（如 `BREVO_CONFIG_REQUIRED` /「请配置服务端 BREVO_API_KEY 与 BREVO_SENDER_EMAIL」）。
3. 不依赖删库关停；DB 迁移回滚另见《二期-生产上线手册》，有业务数据优先前滚。

## 检查清单（签认）

- [ ] 使用的是 `xkeysib-…` raw key，不是 MCP/JWT
- [ ] Production / Preview 环境勾选正确并已 Redeploy
- [ ] 发件人在 Brevo 已验证
- [ ] 冒烟为人审批准后的**人手一点**；无自动群发脚本
- [ ] 去掉 env 后发送失败提示可复核
- [ ] 完整 key 未写入 git、文档、聊天记录

