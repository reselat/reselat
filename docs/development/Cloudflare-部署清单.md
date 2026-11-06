# Cloudflare 部署清单（生产主路径）

> 2026-11-05 起生产部署以 **Cloudflare Workers + `@opennextjs/cloudflare@1.20.16`** 为主，Vercel 仅作回退（`vercel.json` 与《Vercel-BREVO-环境变量清单》保留）。
> 数据库仍为两套 Supabase（identity / business），经 **Hyperdrive** 连接。
> **本文只写变量名与形态，禁止粘贴任何真值。** 所有命令由人工执行；Agent 不登录 Cloudflare、不 deploy。

## 0. 上线顺序（总览）

1. **生产库备份**：identity、business 两套 Supabase 各自备份并确认可恢复；停 Host、冻结二期写入。
2. **合分支并推送**：按《领导演示-合分支说明》人工 merge → push。
3. **Supabase 按顺序跑迁移 11–13**：`20261105160000_followup_redraft.sql` → `20261105160000_outreach_send.sql` → `20261105170000_leads_maps.sql`（细节见《二期-生产上线手册》）。
4. **Cloudflare**：建 CA 证书与两个 Hyperdrive → 填 `wrangler.jsonc` hyperdrive id → 配 vars / secret → 干净目录 `npm run cf:deploy` → 绑定域名。
5. **Ego Lite 冒烟**：见 §7（人审批准 → 人手点「经 Brevo 发送」）。

## 1. 前置（需要用户本人）

- [ ] Cloudflare 账号；建议 **Workers Paid**（$5/月）：免费版每请求 CPU 10 ms，Next SSR 基本不够；付费版默认 30 s，可在 `wrangler.jsonc` 设 `limits.cpu_ms`。
- [ ] 域名 zone 已托管在 Cloudflare（用 Custom Domain）；否则先用 `*.workers.dev` 验证。
- [ ] 本机 `npx wrangler login`（由用户本人在浏览器完成，Agent 不代登）。
- [ ] Supabase 两个项目的 `identity_backend` / `business_backend` 数据库口令（只在建 Hyperdrive 时手动输入）。
- [ ] Supabase Auth → URL Configuration：把生产域名（及临时 workers.dev 地址）加入 Site URL / Redirect URLs。

## 2. 构建目录要求（重要）

OpenNext 会把项目根下 `.env`、`.env.local`、`.env.production(.local)` 的变量**打进 Worker 包**。因此：

- `npm run cf:build` 先跑 `scripts/cf-build-guard.mjs`：发现任何 `.env*`（`.env.example` 除外）即拒绝构建（`CF_BUILD_BLOCKED`）。
- **不要在 e0 演示 worktree 构建**（那里有 `.env.local` 与 `.env.local.bak-*`）。用干净 clone：`git clone … && npm ci && npm run cf:deploy`。
- `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 会在 `next build` 时内联，必须在**构建 shell** 中 `export`（它们是公开值，但不要写进仓库）；同时在 Dashboard vars 里也配一份。

## 3. Hyperdrive（数据库连接）

为什么必须：Workers 直连 TCP 无法传入自定义 CA，而 Supabase 证书由 Supabase 私有 CA 签发。代码在 `DEPLOYMENT_TARGET=cloudflare` 下**只走** Hyperdrive 绑定，缺绑定即 `NOT_CONFIGURED`（fail-closed），不会降级成不校验证书的直连。`deployment_identity` 标记校验仍保留（防止 identity/business 接反）。

```bash
# 3.1 上传 Supabase 根 CA（仓库已有公开证书）
npx wrangler cert upload certificate-authority \
  --ca-cert assets/certificates/supabase-prod-ca-2021.crt --name supabase-prod-ca-2021
# → 记下返回的 <CA_CERT_ID>

# 3.2 两套库各建一个 Hyperdrive（连接串只在本机终端输入，不入库、不贴聊天）
npx wrangler hyperdrive create siliantai-identity \
  --connection-string="postgres://identity_backend.<IDENTITY_REF>:<口令>@<session-pooler-host>:5432/postgres" \
  --ca-certificate-id <CA_CERT_ID> --sslmode verify-full
npx wrangler hyperdrive create siliantai-business \
  --connection-string="postgres://business_backend.<BUSINESS_REF>:<口令>@<session-pooler-host>:5432/postgres" \
  --ca-certificate-id <CA_CERT_ID> --sslmode verify-full
```

- 用 **session pooler 5432** 或直连 `db.<ref>.supabase.co:5432`（直连通常仅 IPv6）；**不要用 6543 transaction pooler**。
- 若 `verify-full` 因主机名不匹配被拒，可改 `--sslmode verify-ca`（仍校验 CA）；不要用 `require`（实测可能不校验 Supabase 私有 CA）。
- Hyperdrive 下 postgres.js 不使用 `prepare:false`；代码已在 CF 分支设 `max:5, fetch_types:false`，连接按请求缓存（Workers 禁止跨请求复用 socket）。
- 把两个 id 填入 `wrangler.jsonc` 中已注释的 `hyperdrive` 段（id 不是密钥，可提交）。

## 4. 变量清单

`DEPLOYMENT_TARGET=cloudflare` 已写在 `wrangler.jsonc`；`keep_vars: true` 让 Dashboard 里的 vars 不被 deploy 覆盖。

### 4.1 Vars（非密钥，Dashboard → Worker → Settings → Variables，或 `wrangler.jsonc`）

| 变量 | 形态 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<IDENTITY_REF>.supabase.co`（构建期也要 export） |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`（构建期也要 export） |
| `APP_ORIGIN` | `https://<生产域名>`（无尾斜杠） |
| `TRADE_COMPANY_ID` | UUID |
| `IDENTITY_PROJECT_REF` / `BUSINESS_PROJECT_REF` | 各 20 位小写字母数字，两者必须不同 |
| `DEEPSEEK_RISK_ENABLED`、`DEEPSEEK_MODEL`、`DEEPSEEK_DAILY_BUDGET_USD_MICROS`、`DEEPSEEK_DAILY_CALL_LIMIT`、`DEEPSEEK_INPUT_USD_MICROS_PER_MILLION`、`DEEPSEEK_OUTPUT_USD_MICROS_PER_MILLION`、`DEEPSEEK_PRICES_VERIFIED_AT` | 开关 / 模型名 / 整数 / 日期 |
| `AI_MODELS_ENABLED`、`AI_DAILY_BUDGET_USD_MICROS`、`AI_DAILY_CALL_LIMIT` | 开关 / 整数 |
| `BREVO_SENDER_EMAIL` | 已在 Brevo 验证的发件邮箱 |
| `BREVO_SENDER_NAME` | 可选，显示名 |

### 4.2 Secrets（只能 `wrangler secret put` 或 Dashboard「Encrypt」）

```bash
npx wrangler secret put SUPABASE_AUTH_ADMIN_KEY        # identity 项目 secret/service key
npx wrangler secret put BUSINESS_STORAGE_ADMIN_KEY     # business 项目 Storage 管理 key（不得与上面相同）
npx wrangler secret put LOGIN_RATE_LIMIT_SECRET        # ≥32 字符随机串
npx wrangler secret put AI_CREDENTIALS_ENCRYPTION_KEY
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put BREVO_API_KEY                  # raw xkeysib-…，不是 MCP/JWT token
```

### 4.3 Cloudflare 上**不要**配置

| 变量 | 原因 |
| --- | --- |
| `IDENTITY_DATABASE_URL` / `BUSINESS_DATABASE_URL` / `*_DATABASE_CA_CERT` | 连接串只进 Hyperdrive；CF 分支不读它们 |
| `FILE_STORAGE_DRIVER=filesystem`、`PRIVATE_FILES_ROOT` | Workers 无文件系统；非 self-hosted 下 filesystem 本就 fail-closed。留空 = Supabase Storage（bucket `trade-private-files`，须为 private） |
| `RESELAT_LOCAL_TEST`、`NEXT_PUBLIC_RESELAT_LOCAL_TEST` | 仅本机演示 |
| `VERCEL`、`IDENTITY_SERVICE_URL`、`LOGIN_TRUST_PROXY` | Vercel / self-hosted 专用 |

本地 workerd 预览用 `.dev.vars`（已 gitignore），模板见根目录 `.dev.vars.example`，只放假值。

## 5. 部署 / 域名

```bash
# 干净目录，已 export 两个 NEXT_PUBLIC_*；已 wrangler login
npm ci
npm run cf:preview     # 可选：本地 workerd，端口 8791（不要用 3120/8787）
npm run cf:deploy      # = guard → opennextjs-cloudflare build → deploy
```

- 域名：Dashboard → Worker → Settings → Domains & Routes → Add Custom Domain（或 `wrangler.jsonc` 中 `routes: [{pattern, custom_domain: true}]`）。原先指向 Vercel 的同名 DNS 记录需先移除，**保留 Vercel 项目不删**以便回退。
- 登录限流在 CF 下取 `cf-connecting-ip`（Vercel 下仍取 `x-forwarded-for`）。
- `maxDuration=300`（business 路由）在 Workers 不生效；墙钟时间不限，CPU 受套餐 `cpu_ms` 限制（AI 调用多为 I/O 等待，不计 CPU）。请求体上限 100 MB（Free/Pro）。
- 包体：本地 dry-run 约 13.8 MiB / gzip 2.83 MiB（免费上限 3 MiB、付费 10 MiB；中文字体走静态资源不计入）。

## 6. 回滚

1. **Worker 版本回滚**：`npx wrangler deployments list` / `npx wrangler versions list` → `npx wrangler rollback <version-id>`。
2. **切回 Vercel**：Custom Domain 从 Worker 移除 → DNS 指回 Vercel → 按《Vercel-BREVO-环境变量清单》确认 env → Redeploy。
3. **关停真发**：`npx wrangler secret delete BREVO_API_KEY` → 点发送应提示 `BREVO_CONFIG_REQUIRED`。
4. DB：有业务数据优先前滚，见《二期-生产上线手册》回滚节。

## 7. 冒烟（Ego Lite，人工）

1. `GET /api/health` → `{"status":"ok"}`；`/login` 渲染；未登录访问 `/workspace` 跳 `/login`。
2. 管理员登录（含 MFA）→ 工作台各页能读数据（确认 Hyperdrive 两库都通、标记校验通过）。
3. 上传 / 下载一个小附件（Supabase Storage）；导出 PI、单证、退税核对表各一份，确认中文正常。
4. 获客：对一条 **approved** 草稿，人工点「经 Brevo 发送」一次 → `sent_at` / `brevo_message_id` 落库，Brevo 日志可见。
5. **禁止**用脚本 / CI / Agent 自动真发；Agent/MCP 仍禁 `outreach_send*`、SMTP。
6. Host 不上云（Cloudflare/Vercel），仍只在本机 127.0.0.1 运行。

## 8. 阻塞项 / 已知限制

| 项 | 状态 | 说明 / 选项 |
| --- | --- | --- |
| **PDF 生成**（PI、单证、退税核对表） | ✅ 本地 workerd 已验证 | 静态 Yoga wasm、标准字体映射、ASSETS 中文字体；三类逐页文本与 Node 一致。生产仍须人工冒烟。 |
| 知识库 PDF 文本抽取 | 降级 | `assistant/pdf.ts` 仅 filesystem 驱动下调 python，Vercel 上本就返回空，CF 同。 |
| `proxy.ts`（Node middleware） | ⚠️ 实验性 | OpenNext 1.20.3+ 实验支持；本地 workerd 验证 `/workspace`→`/login` 跳转正常。 |
| Hyperdrive + Supabase pooler 的 `verify-full` | 待线上验证 | 失败则 `verify-ca`。 |
| Next 升级 16.4.2 → 16.4.5 | 已改 lock | OpenNext 1.20.16 要求 ≥16.4.5（11-03 安全修复）。演示 worktree 的 `node_modules` 仍是 16.4.2，演示结束后 `npm ci`。 |

## 9. PDF 构建与资源

方案：保留 `@react-pdf/renderer`（版式零改动），只替换 Workers 不支持的三处加载方式：

| 卡点 | 处理 |
| --- | --- |
| pdfkit 运行时 `createRequire('#standard-fonts/*')` | `scripts/cf-patch-pdf.mjs` 在 OpenNext 构建后把 28 处（打包 handler 与复制的 pdfkit 各 14）替换为 `globalThis.__RESELAT_PDFKIT_STD_FONTS__[...]`；数量不符直接失败。数据由自定义入口 `cloudflare/worker.ts` 静态 import `pdfkit/standard-fonts/*`。 |
| yoga-layout 3.2.1 从字节编译 Wasm | 构建脚本把 base64 解出为 `.open-next/reselat/yoga-3.2.1.wasm`（校验魔数、版本、71736 字节）；`cloudflare/worker.ts` 静态 import（wrangler 打成 `WebAssembly.Module`），并只对该长度的字节拦截 `WebAssembly.instantiate`。 |
| 8.3 MB 中文字体走 fs | 构建复制到 `.open-next/assets/_pdf-fonts/NotoSansSC-Regular.otf`，作为静态资源上传（不进 Worker 包；该 URL 公开可下载，字体为 OFL 许可）；运行时经 `ASSETS` 绑定读取、`fontkit.create`，模块级缓存。Node/Vercel/本机仍按原路径读磁盘。 |

部署注意：
- 只用 `npm run cf:deploy`（含守卫 + 构建 + PDF 补丁）；**不要**单独 `wrangler deploy` 未打补丁的产物。升级 pdfkit / yoga-layout / react-pdf / OpenNext 后，补丁计数或 wasm 校验不符会让构建失败，需重新适配。
- `wrangler.jsonc` 的 `main` 已改为 `cloudflare/worker.ts`。
- CPU：建议 Workers Paid，并在 `wrangler.jsonc` 取消注释 `"limits": {"cpu_ms": 60000}`（默认 30 s 也足够，留余量）。

本地 workerd 实测（8791，假值；curl 墙钟时间，首次含冷启动 + 读取/解析字体）：

| PDF | 页数 | 首次 | 第二次 | 中文 | 与 Node 比对 |
| --- | --- | --- | --- | --- | --- |
| PI 1 行 | 1 | 0.26 s | 0.02 s | ✅ | 字形+坐标逐字一致 |
| PI 100 行 | 8 | 0.15 s | 0.14 s | ✅ | 一致；`check-pdf-layout.py` 通过 |
| 单证 PI | 1 | 0.03 s | 0.02 s | ✅ | 一致 |
| 单证长单（30 行、长字段） | 9 | 0.12 s | 0.12 s | ✅ | 一致 |
| 退税核对表 | 1 | 0.02 s | 0.01 s | ✅ | 一致 |

生产仍需人工冒烟：登录后导出一份 PI、一份单证、一份退税核对表，确认可打开、中文正常。
