# M-SEND 实施说明

已增加管理员人工发送命令、获客工作台按钮、草稿发送字段与审计。Agent 路径沿用白名单拒绝发送。审批、回写均保持独立。

部署需应用 `20261105160000_outreach_send.sql`。服务端配置 `BREVO_API_KEY` 和 `BREVO_SENDER_EMAIL`，可选 `BREVO_SENDER_NAME`，默认名称 Trade outreach。发送正文使用纯文本。测试使用 mock transport。

发送前先持久化占位并记录 dispatch，再调用事务邮件 API。每草稿仅允许一次 dispatch，包括失败或结果不确定的请求，需管理员在 Brevo 核对后人工维护。此保守策略避免网络超时、并发点击、数据库回执失败造成再次外发。成功保存 sent_at 和 brevo_message_id。外部服务与数据库无法原子提交，回执写入失败时需人工核对。

下期处理 webhook 退订、投诉与 bounce。

验证结果为 `npm test -- --maxWorkers=2` 全部 120 文件、470 测试通过，`npm run typecheck` 通过。新增测试覆盖缺配置、mock 回执、未批准拒绝、落库与重复发送拦截。Agent 拦截复用路由白名单，尚未增加发送动作的独立路由测试。

## local-test / rehearsal 迁移补丁（2026-11-05）

local-test 在初始化或打开既有库时检查 `brevo_send_started_at` 字段，缺失时执行 `20261105160000_outreach_send.sql`，补齐 sent_at、brevo_message_id 和 brevo_send_started_at；已升级库再次打开不会重复执行非幂等迁移。保留原时间戳。

rehearsal phase2 显式加入 followup_redraft 和 outreach_send，并将幂等的 followup_redraft 纳入重放成功检查。未改发信业务语义或密钥策略，未访问生产库或真实外呼。

验证：`node scripts/rehearsal/migrate.mjs` 通过（13 个 phase2 迁移及重放检查）；`npm test -- --maxWorkers=2` 通过（120 文件、470 测试）；`npm run typecheck` 通过。
