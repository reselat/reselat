# 独立测试数据库初始化审阅单

状态：尚未执行；用户此前批准创建独立测试项目，但具体云端迁移仍单独确认。

## 目标

仅trade-workstation-test独立Free项目，Supabase ref qgbsikqgunmsipegkvda，新加坡区域。未修改原有暂停项目。费用上限0；不升级套餐、不部署、不发送邮件、不上传本机客户/订单。

## 执行内容

SQL源：scripts/sql/auth-admin-schema.sql（本地PGlite已执行验证）。

1. 新建私有trade_private schema，撤销PUBLIC schema访问。
2. 新建companies、employees、audit_events、business_records、record_shares、integration_outbox六张表。
3. 员工角色限定admin/sales/operations，停用默认false；最后管理员更新保护、员工身份不可变。
4. business_records按公司/种类/对象独立保存客户、产品、供应商；不是整份Workspace JSON。不包含订单/收付款事务迁移，不声称所有旧业务页面已多人共享。
5. 创建或检查专用app_backend角色：无超级用户、CREATEROLE、CREATEDB或BYPASSRLS；只授予必要表读/写列与审计追加，不允许改员工身份/公司、不允许DDL或删除审计。初始NOLOGIN，连接凭据须后续安全配置，未配置时服务端503。
6. integration_outbox只预留外部财务API幂等键、外部ID及同步状态，默认disabled，无财务角色、无外部调用或费用。

## 应用前核查

先只读检查该新项目表/角色与Schema版本，确保无同名既有业务资源；发现冲突停止，不覆盖。迁移以新增方式记录；禁止在旧项目执行。

## 本地验证与范围

PGlite实际运行约束、角色SET ROLE、表权限、DDL拒绝和审计删除拒绝；不宣称已验证跨连接并发、Supabase真实Auth、MFA或连接池。这些需云端隔离测试补齐。

## 恢复方式

若初始化失败，停止工作区业务写入，保持/demo本机试用；不删除云端表/角色，不重置原有浏览器资料。检查迁移状态和新增资源后用追加修复迁移处理。应用代码可回退入口到/demo，不靠删除审计或用户恢复。新项目尚无真实业务数据，不承诺未经演练的恢复时间。

## 后续引导

- 在Supabase Auth配置关闭公开注册；MCP插件无Auth设置管理接口，需用平台支持的设置方式完成并复核，不能假称已关闭。
- 首位管理员账号需用户指定，现未创建Auth用户、员工、公司或管理员。无“首个注册用户自动管理员”。
- 管理员MFA绑定后才允许管理API。新员工创建/邮件邀请尚未启用；先完成受控引导，发送真实邮件单独确认。
- 专用数据库连接凭据只写本机.env.local或部署密钥管理器，不在聊天粘贴密码；当前仅配置项目URL与publishable key。
- 订单、采购、出运、收付款、合同/单据和退税业务仍在/demo本地试用，不自动搬入云端；后续逐个命令迁移并验证，不能把登录壳当作全系统多人版。

补充最小授权：公司行锁需UPDATE列权限，仅授予companies.name，不授予id；管理员敏感访问还需要核实auth.sessions当前会话，故仅授予app_backend对auth.sessions.id/user_id的SELECT和auth schema USAGE，不授予其他认证列或任何Auth写权限。
