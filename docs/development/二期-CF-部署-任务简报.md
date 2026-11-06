# 二期 · Cloudflare 部署适配任务简报（CF）

> 目标：生产部署从 Vercel 改为 Cloudflare Workers（`@opennextjs/cloudflare`），数据库仍是两套 Supabase（identity / business）。
> 本任务**只做本地代码与文档适配**：不 push、不 merge、不登录 Cloudflare、不 `wrangler deploy`、不创建任何线上资源（Worker / Hyperdrive / R2 / 域名 / secret），不碰生产 Supabase / Vercel。
> 工作目录：独立 worktree `/Users/oliver/.codex/worktrees/reselat-cf/外贸工作站`（分支 `codex/cf-deploy`，基于 `5888af0`）。**不要**进入或修改 `/Users/oliver/.codex/worktrees/reselat-assistant-e0/…`，**不要**占用/停止 127.0.0.1:3120（领导演示在跑）。不要创建或修改 `.env.local`。

## 已核实的外部事实（2026-11-05）

- `@opennextjs/cloudflare@1.20.16`（2026-11-03）peer：`next >=16.4.5`、`wrangler ^4.148.0`。已由调度方安装：`next@16.4.5`、`eslint-config-next@16.4.5`、`@opennextjs/cloudflare@1.20.16`、`wrangler@4.158.0`（devDep），均 `--save-exact`。
- Next 16 `proxy.ts`（Node middleware）自 1.20.3 起**实验性**支持，需 `nodejs_compat`。本仓库有 `src/proxy.ts`，必须验证 build 能过。
- 官方配置：`wrangler.jsonc`（`main: .open-next/worker.js`、`assets.directory: .open-next/assets`、`binding: ASSETS`、`services: WORKER_SELF_REFERENCE`、`compatibility_flags: ["nodejs_compat","global_fetch_strictly_public"]`、`compatibility_date` 取 `2026-11-05`）、`open-next.config.ts`（`defineCloudflareConfig`）、`.dev.vars`、`public/_headers`（`/_next/static/*` 长缓存）、`.open-next` 入 gitignore。`build` 脚本必须仍调用 `next build`（现有 `next build --webpack` 保留）。
- Workers 无文件系统、不能运行时动态 require、不能用字节动态编译 Wasm（`Wasm code generation disallowed by embedder`）；跨请求复用 I/O 对象（socket）会报 `Cannot perform I/O on behalf of a different request`。
- Hyperdrive：支持 postgres.js ≥3.4.5；可上传 Supabase 根 CA 并设 `--sslmode verify-full`；**Hyperdrive 下不要用 postgres.js `prepare:false`**，建议 `max:5, fetch_types:false`，每请求新建 client。Workers 直连 TCP 无法传入自定义 CA（`ssl.ca` 不生效），Supabase 证书由其私有 CA 签发 → 直连很可能无法做 CA 校验。

## 摸底结论（调度方已查）

| 项 | 现状 | Workers 影响 |
| --- | --- | --- |
| `vercel.json` | regions sin1 | 保留，作回退 |
| `@vercel/*` | 无 | — |
| `DEPLOYMENT_TARGET` | 仅 `self-hosted` 分支（next.config standalone、services.ts、db/config.ts、storage.ts、login-limit.ts） | 新增 `cloudflare` |
| `VERCEL` | login-limit 取 `x-forwarded-for`；local-test guard `!VERCEL`；start-local-test 剥离 | CF 需取 `cf-connecting-ip` |
| 文件存储 | 非 filesystem 时用 Supabase Storage（`BUSINESS_PROJECT_REF`+`BUSINESS_STORAGE_ADMIN_KEY`，fetch 实现） | 可用；filesystem 在非 self-hosted 已 fail-closed |
| DB | `postgres@3.4.9`，模块级 Map 缓存连接，`prepare:false`，`readFileSync` 读 CA，`node:crypto X509Certificate` 校验 | 需 CF 分支：每请求连接 + Hyperdrive 优先 |
| PDF | `@react-pdf/renderer@4.9.0` + yoga-layout 3.2.1（wasm）+ `renderToBuffer`；字体 `path.join(process.cwd(),'assets/fonts/NotoSansSC-Regular.otf')`（8.3MB） | 高风险：wasm 动态编译、fs 读字体、包体积 |
| `assistant/pdf.ts` | `child_process` 调 python，仅 filesystem 驱动时 | CF 下自然返回 ''，确认不被打包报错 |
| local-test | PGlite（devDep，`serverExternalPackages`）、`readFile` SQL | 仅 dev；确认不进 Worker 或不致 build 失败 |
| `maxDuration=300` | business route | Workers 忽略；CPU 限制见文档 |
| Host | `scripts/agents/*` | 不上云，不进 Worker |

## 任务（按序）

1. **配置**：新增 `wrangler.jsonc`（name `siliantai`；`vars` 只放非密钥：`DEPLOYMENT_TARGET=cloudflare`、`NEXTJS_ENV` 不需要；`observability.enabled=true`；Hyperdrive 绑定 `HYPERDRIVE_IDENTITY` / `HYPERDRIVE_BUSINESS` 以注释占位，id 留 `<…>`；不要 R2/KV 等需要线上创建的资源，增量缓存不启用——本应用全是动态页）、`open-next.config.ts`、`public/_headers`、`.dev.vars.example`（只列变量名，值为空或形态说明）。`.gitignore` 加 `.open-next/`、`.wrangler/`、`.dev.vars`、`cloudflare-env.d.ts`（若决定提交 typegen 结果则说明理由）。tsconfig / eslint / vitest 排除 `.open-next`、`.wrangler`。
2. **npm 脚本**：`cf:build`=`opennextjs-cloudflare build`，`cf:preview`=`opennextjs-cloudflare build && opennextjs-cloudflare preview --port 8791`（端口不得是 3120；8787 已被本机其他服务占用），`cf:deploy`、`cf:upload`、`cf:typegen`（`wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts`）。`dev`/`build`/`start`/`test:local` 行为不变。**不要**在 `next.config.ts` 加 `initOpenNextCloudflareForDev()`（会影响 `test:local`），除非能证明无副作用。
3. **DEPLOYMENT_TARGET=cloudflare 代码分支**（保持 Vercel 与 self-hosted 行为不变，fail-closed 风格与仓库一致）：
   - `login-limit.ts`：cloudflare 时取 `cf-connecting-ip`。
   - `db/client.ts` + `db/config.ts`：cloudflare 时①不跨请求缓存连接（例如以 `getCloudflareContext().ctx` 为 WeakMap 键做每请求缓存，请求结束 `ctx.waitUntil(sql.end())` 之类，自行判断）；②若存在 Hyperdrive 绑定（`HYPERDRIVE_IDENTITY`/`HYPERDRIVE_BUSINESS`）用其 `connectionString`，不读 CA 文件、不传 `ssl.ca`、不用 `prepare:false`、`fetch_types:false`；③无绑定时按现有直连路径但不得 `readFileSync`（自行决定：fail-closed 报 NOT_CONFIGURED，或直连仅 `ssl:'require'`——请在文档写清安全取舍；调度方倾向「CF 必须走 Hyperdrive verify-full，否则 NOT_CONFIGURED」）；④保留 `deployment_identity` 标记校验（Hyperdrive 下 hostname 不再是 supabase 域名，需要 projectRef 标记校验兜底）。
   - `files/storage.ts`：cloudflare 下 filesystem 驱动保持拒绝；Supabase Storage 路径可用。
   - 检查 `pdf-fonts.ts` / react-pdf：尽量让 PDF 在 Workers 可用（如字体改为静态资产 URL 或打包导入；yoga wasm 静态导入/别名方案如 `workerd-yoga` 只有在确实可行且风险可控时做），否则**不要硬改**，在文档列为阻塞/降级项，并保证 Node（Vercel/本机/测试）行为不变。
4. **测试**：新增 `tests/cloudflare-deployment.test.ts`（或类似）：wrangler.jsonc 存在且含 `nodejs_compat`、`main`、`assets`、无明文密钥；package 脚本存在；`.dev.vars` 在 gitignore；login-limit cloudflare 分支；db cloudflare 分支（Hyperdrive 与无绑定行为）；storage cloudflare 拒绝 filesystem。全量 `npx vitest run` 与 `npx tsc --noEmit` 必须绿；`npm run lint` 不新增错误。
5. **本地 OpenNext build**：跑 `npm run cf:build`，失败就定位具体模块修复（pglite、child_process、fs、proxy.ts、wasm 等）。成功后报告 `.open-next/worker.js` 及 handler 体积（gzip 后对比 Workers 免费 3 MiB / 付费 10 MiB 上限）。再用 `wrangler dev --port 8791`起本地 workerd，配一个**临时** `.dev.vars`（全部假值，`DEPLOYMENT_TARGET=cloudflare`，不放真实密钥；用完删除）确认 `GET /login` 返回 200 能渲染、`/api/health` 响应；若可能用 `NODE_ENV`/local demo 无法测 PDF 则说明。不要登录 Cloudflare 账号（`wrangler login`/`whoami` 都不要）、不要 deploy。结束后停掉 8791 进程。
6. **文档**：
   - 新建 `docs/development/Cloudflare-部署清单.md`：变量清单（只写名字与形态：Supabase 公共 URL/publishable key、IDENTITY/BUSINESS 项目 ref 与数据库、`SUPABASE_AUTH_ADMIN_KEY`、`BUSINESS_STORAGE_ADMIN_KEY`、`LOGIN_RATE_LIMIT_SECRET`、AI/DeepSeek、`AI_CREDENTIALS_ENCRYPTION_KEY`、`BREVO_API_KEY`、`BREVO_SENDER_EMAIL`、`BREVO_SENDER_NAME`、`APP_ORIGIN`、`TRADE_COMPANY_ID` 等——以 `.env.example` 和代码实际读取为准），哪些进 `vars`、哪些必须 `wrangler secret put`（`NEXT_PUBLIC_*` 需构建期可见，写清在本机构建时如何注入、不得入库）；Hyperdrive 创建命令（`wrangler cert upload certificate-authority` + `wrangler hyperdrive create … --sslmode verify-full`，连接 Supabase 直连或 session pooler 5432，不要 6543 transaction pooler）；域名与路由（custom domain / routes）；部署（`npm run cf:deploy`）与回滚（`wrangler rollback` / `wrangler versions` / 切回 Vercel DNS）；冒烟（人审批准 → 经 Brevo 发送，禁自动脚本真发）；CPU/请求体限制与 `maxDuration` 说明；阻塞项。
   - 修改 `docs/development/Vercel-BREVO-环境变量清单.md`（顶部注明：已非主路径，主路径见 Cloudflare 清单；内容保留作回退）、`领导演示-合分支说明.md`、`二期-生产上线手册.md`：部署口径改为 Cloudflare 为主、Vercel 回退；「Host 不上 Vercel」改为「Host 不上云（Cloudflare/Vercel）」；上线顺序写清：生产库备份 → 合分支推送 → Supabase 按顺序跑迁移 11–13 → Cloudflare 配 secret（及 Hyperdrive）并 deploy → Ego Lite 冒烟。
   - 新建 `docs/development/二期-CF-部署-完成说明.md`：改动、验证结果、阻塞项。

## 红线

- 仓库中不得出现任何真实密钥/连接串/token；`.dev.vars` 不入库。
- Agent/MCP 仍禁自动外发（不改 outreach 发信门禁）。
- 不 `git commit`、不 push（调度方审计后提交）；不改 `next-env.d.ts`。
- 不动 3120、不动 e0 worktree、不登录/部署 Cloudflare。
