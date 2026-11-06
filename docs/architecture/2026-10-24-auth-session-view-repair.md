# 管理员会话核验修复（需人类审核）

状态：本地方案验证通过，待批准共享测试数据库写入与权限访问路径调整。

根因：auth schema 属于 supabase_admin；项目postgres仅有USAGE，没有GRANT OPTION。先前grant命令及本次restore_auth_schema_usage迁移返回成功，但实际USAGE未授予app_backend。真实低权限查询仍42501，不能声称修复完成。原初始化SQL及已应用迁移不改写。

目标环境：现有独立外贸测试项目，无费用、不读写业务内容、不发送邮件。

具体变更：应用scripts/sql/add-auth-session-view.sql，建立trade_private.active_auth_sessions，只投影auth.sessions.id/user_id；视图以postgres已有读取能力执行，app_backend只获视图SELECT。随后session.ts查询改为该视图，保留会话ID与用户ID匹配及MFA条件。私有schema不向anon/authenticated开放，不增加Auth写权限。不使用security definer函数或高权限应用连接。

授权边界：这是有意的受限视图权限代理，不能设置security_invoker=true，否则会重现缺少auth USAGE的问题。视图只暴露原方案已允许读取的两列。

本地验证：tests/auth-session-view.test.ts真实PGlite验证两列读取、其他字段/直接Auth访问/写入拒绝、原会话删除后视图即时不可见；通过。尚未云端应用或真实浏览器验收。

回滚：先恢复应用原查询（会恢复原来的拒绝状态），再以追加迁移revoke select on trade_private.active_auth_sessions from app_backend；视图可保留无应用访问。不删除认证数据。

原因：共享环境数据库写操作和核心权限路径调整，依项目AGENTS规则需人类审核。

## 已批准并执行

用户回复ok后应用add_private_auth_session_view追加迁移。实际app_backend连接执行空结果会话查询通过；SELECT=true，DELETE=false，anon/authenticated schema USAGE=false。应用session.ts已切换私有视图，MFA及会话匹配条件保留。112测试、lint、build、构建后typecheck通过。真实浏览器管理员页面待用户刷新确认。安全顾问仅提示既有泄露密码保护未启用，未为此修改套餐或设置。
