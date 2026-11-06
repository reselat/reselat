# Supabase 双项目与 Vercel 部署

更新：2026-10-25。本文件说明部署拓扑与上线步骤。独立在线测试站现已部署，基础客户/产品/成员读取已验证；尚未完成完整共享业务验收。最新部署与生产压缩故障修复见 [部署记录](../evidence/2026-10-25-online-test-deployment.md)。

## 数据与管理边界

| 层 | 当前目标 | 职责 |
| --- | --- | --- |
| Vercel | `trade-workstation-test`，Next.js，Singapore `sin1` | 页面与服务端 API；分别连接两库，不将密钥交给浏览器 |
| 身份 Supabase | `trade-workstation-test` / `qgbsikqgunmsipegkvda` | Auth、MFA、成员、角色、停用归档、身份审计 |
| 业务 Supabase | `trade-workstation-business-test` / `wjrwqkduohqpqzigmhys` | 公司商业资料、客户产品与后续订单、采购、出运、收付款、业务审计；业务文件使用此项目的私有 Storage |

这是两个独立 Supabase 项目，并非同库分 schema。Vercel 现阶段部署一个应用，管理员界面与业务工作区共用登录；数据、凭据、权限与迁移分别管理。身份库不增加订单数据；业务库不复制员工角色或密码。两侧仅通过稳定公司/员工 UUID 关联，不使用跨库外键。

`identity_backend` 只访问身份目录，`business_backend` 只访问业务库。运行时校验连接用户名、项目 ref 与数据库用途标记；没有旧 `TRADE_DATABASE_URL` 回退。每次业务写入前重新检查身份，身份故障时拒绝；已经通过身份检查的跨库在途请求可能完成，不承诺分布式原子撤权。

## Vercel 配置

项目根目录已有 `vercel.json`：Next.js、Singapore `sin1`、`npm ci --ignore-scripts`。沿用 `npm run build`，不在安装/构建中运行数据库迁移。

`next.config.ts` 显式把公开数据库 CA 打入服务端产物，并把中文 PDF 字体打入 API 产物。`.vercelignore` 排除 `.env*`、本机构建、依赖目录、文档、测试及业务样本；不排除运行时所需的 `scripts/database-tls.ts`、证书和字体。`.vercel/` 不进入 Git。

Node.js 选用与本地验证一致的 24.x。当前 package.json 未强制 engines；创建 Vercel 项目时核对其实际 Node.js 设置，不能以本机版本推断云端版本。

## 环境变量按用途配置

| 变量 | 来源与边界 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 仅身份项目 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 仅身份项目公开 key；不能填 secret |
| `APP_ORIGIN` | 当前部署准确的 HTTPS origin，无末尾斜杠；写 API 严格校验 Origin |
| `TRADE_COMPANY_ID` | 两库已有的同一稳定公司 UUID |
| `IDENTITY_PROJECT_REF` | 身份项目 ref |
| `IDENTITY_DATABASE_URL` | 身份项目 `identity_backend` 专用低权限连接 |
| `SUPABASE_AUTH_ADMIN_KEY` | 身份项目仅服务端 key，供成员创建和核对 |
| `BUSINESS_PROJECT_REF` | 独立业务项目 ref |
| `BUSINESS_DATABASE_URL` | 业务项目 `business_backend` 专用低权限连接 |
| `IDENTITY_DATABASE_CA_CERT` / `BUSINESS_DATABASE_CA_CERT` | 可不设置，默认读取打包的公开 CA；不要填本机绝对路径 |

服务端变量仅在 Vercel 环境变量管理中配置，不在聊天、命令参数或文档粘贴值。不把 `.env.local` 当部署文件上传。Preview 与 Production 分别配置；测试库不得默默视为生产库。业务 Storage 独立 key 和私有桶尚未实现配置，不使用身份 key 替代。

服务端数据库使用对应项目 Connect 页的 Transaction pooler，端口 6543；用户名保留 `<purpose>_backend.<project-ref>`。运行时代码支持该端口，且关闭 prepared statements。Session pooler 5432 保持兼容。本机初始化向导仍使用 5432；不要把角色初始化、密码重置或迁移放到 Vercel 构建过程。不要在连接 URL 追加 TLS 参数，驱动统一严格验证证书链与主机名。Vercel线上已通过6543读取两库；本机探针超时不能覆盖该实际结果。

Preview URL 确定后需为该环境设置准确 `APP_ORIGIN` 并重新部署；不能关闭同源检查解决 403。身份项目 Site URL/允许重定向地址若要变更，按实际使用的登录流程审核后配置，不使用任意域名通配符。

## 迁移、验证和恢复

1. 本地先执行测试、lint、build，构建后执行 typecheck，检查 CA 与字体的 `.nft.json` 跟踪结果。
2. 区分身份迁移与业务迁移。已应用双库初始化 SQL 保持冻结；新业务基础和主档 SQL 尚未云端应用，之后只在业务项目追加经审阅的迁移。
3. 确定 Vercel 账号/项目/环境后，配置该环境的独立凭据，创建受保护 Preview。当前账号可见其他项目，不复用或覆盖它们。
4. 用虚构数据验证登录/MFA、管理员访问、员工范围、未登录拒绝、双库目标校验，再逐项验证已接通业务功能。本地 PDF demo 接口在 production 模式禁用，不能作为共享单据接口验收。
5. 部署异常先切回上一已验证应用版本。数据库只做前向修复；回退应用前核对旧版本与新 schema 是否兼容，不自动删除表、文件或历史记录。首次部署若无上一版本，停止将流量指向失败部署并保留现场，不声称存在可回滚版本。

新增云端 SQL、私有桶、测试资料、Vercel 项目写入/部署及生产发布按明确目标审核后执行。当前部署配置不代表共享订单、附件、签名或完整退税资料包已经交付。

官方依据：[Supabase 连接方式](https://supabase.com/docs/guides/database/connecting-to-postgres)、[Next.js 文件跟踪](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)、[Vercel 项目配置](https://vercel.com/docs/project-configuration)。
