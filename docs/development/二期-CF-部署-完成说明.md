# 二期 · Cloudflare 部署适配完成说明（CF）

> 2026-11-05 晚，本地分支完成；未 push、未登录 Cloudflare、未创建任何线上资源、未动生产 Supabase/Vercel。
> 分工：Codex 完成首轮（配置、脚本、login-limit、初版文档；其 DB 实现与 preview 未达标），调度方审计后重写 DB 分支、补构建守卫、跑通 build / workerd 预览并补全文档。

## 改动

- 依赖：`next` / `eslint-config-next` 16.4.2 → **16.4.5**（OpenNext 1.20.16 的 peer 下限，含 11-03 安全修复）；新增 `@opennextjs/cloudflare@1.20.16`、`wrangler@4.158.0`（dev）。
- 配置：`wrangler.jsonc`（nodejs_compat、assets、WORKER_SELF_REFERENCE、`DEPLOYMENT_TARGET=cloudflare`、`keep_vars`、Hyperdrive 占位）、`open-next.config.ts`（不启用 R2 增量缓存）、`public/_headers`、`.dev.vars.example`；`.gitignore` 加 `.open-next/ .wrangler/ .dev.vars cloudflare-env.d.ts`；tsconfig/eslint/vitest 排除构建产物。
- 脚本：`cf:build`（先跑 `scripts/cf-build-guard.mjs`，存在 `.env*` 即拒绝——OpenNext 会把 .env 文件打进 Worker）、`cf:preview`（8791）、`cf:deploy`、`cf:upload`、`cf:typegen`。`dev/build/start/test:local` 不变；`vercel.json` 保留。
- 代码：
  - `src/server/db/cloudflare.ts`（新）：CF 下只走 `HYPERDRIVE_IDENTITY` / `HYPERDRIVE_BUSINESS` 绑定，缺绑定或 project ref 非法/相同即 `NOT_CONFIGURED`；连接按请求上下文缓存（不跨请求复用 socket）；无 `prepare:false`、`fetch_types:false`；保留 `deployment_identity` 标记校验。通过 OpenNext 的全局 context symbol 读取 env/ctx，Node 运行时（Vercel/本机/测试）不引入新依赖。
  - `src/server/db/client.ts`：`DEPLOYMENT_TARGET=cloudflare` 时转到上面模块；其余路径不变。
  - `src/server/auth/login-limit.ts`：CF 下取 `cf-connecting-ip`。
  - 文件存储：未改；CF 下 filesystem 驱动 fail-closed，Supabase Storage 路径（fetch 实现）可用。
- 测试：`tests/cloudflare-deployment.test.ts`（10 项：配置/无明文密钥/脚本/gitignore/.dev.vars.example/IP 头/Hyperdrive 必需/无 context fail-closed/filesystem 拒绝/构建守卫）。

## 验证

- `npx vitest run`：121 文件 / 480 测试全绿；`npx tsc --noEmit` 通过。
- `eslint`：改动文件 0 问题；全仓 30 errors 均在未改动的既有文件（agent 测试/脚本）。
- `npm run cf:build`：通过（proxy.ts 以实验性 Node middleware 打包）。`wrangler deploy --dry-run`：13.0 MiB / gzip 2.6 MiB。
- 本地 workerd（`wrangler dev --port 8791`，假值 `.dev.vars`，用后删除）：`/login` 200 渲染、`/api/health` 200、`/workspace` 307→`/login`、`/api/workspace/records` 401。
- PDF 探针（临时路由，已删除未提交）：500 `No such module "#standard-fonts/Helvetica"` → **PDF 在 Workers 不可用**，列为阻塞项。

## 阻塞 / 待用户

见《Cloudflare-部署清单》§1、§8：Cloudflare 账号（建议 Workers Paid）、wrangler login、两套 Hyperdrive + CA、vars/secret、域名；PDF 决策。
