# 双库实施台账

用户已确认分库设计及实施计划，沿用Native执行。主智能体唯一写入；最终独立复核只读。不创建云资源、不应用共享SQL、不移动或删除数据，不读取真实业务正文和密钥值。

Ruling: 连接访问器返回Promise<Sql>，首次使用前强制核验数据库用途标记；相比原计划同步签名可保证调用者不会漏掉目标核验。身份库可独立就绪，不依赖业务库配置；业务写入仍先实时身份鉴权。

## 实际结果

- 独立连接与用途标记：separation-config-{red,green}.log；没有TRADE_DATABASE_URL回退。
- 两个PGlite实例：身份角色无旧业务读权限；业务实例无员工/Auth/角色表；归属UUID保留，业务内部跨公司关联拒绝。separated-schema-{red,green}.log及全量。初次本地缺anon平台角色导致fixture失败，补齐平台角色后通过，未放宽权限断言。
- API拒绝及角色/版本复核：separated-records-{red,green}.log。实际双实例低权限SQL集成：separated-records-integration.log，覆盖身份查询→客户写入/更新→同事务业务审计、旧版本冲突、停用拒绝；Auth SDK返回模拟，不声称真实Auth或网络级并发通过。
- 配置错误/非TTY不回显、分用途保存：separated-setup-{red,green}.log；独立复核1项Important：确定回滚后临时文件阻塞重试，修复后新增清理归属/提交未知保护回归separation-recovery-{red,green}.log。提供--recover-config实际认证后合并未完成配置；共享配置文件锁不自动绕过，强制退出残留锁需维护者检查。
- 管理界面只改配置提示与创建禁用状态；SSR实际渲染检查separation-admin-readiness.log，业务未配置不影响身份就绪后的成员管理。视觉布局沿用前轮已核验组件，本轮未进行新的真实用户浏览器登录。
- 45文件145测试、lint无告警、build、构建后typecheck与两个配置脚本语法检查通过。separation-{full-tests,lint,build,typecheck}.log。
- 原已应用auth-admin-schema.sql SHA256仍007b0409663b413d249cec60512dae9d3147de4e11db63d5dbff53063d8cadc6，未修改共享迁移。

## 云端只读检查

- 当前组织仅外贸项目ACTIVE_HEALTHY、旧项目INACTIVE，未恢复旧项目。get_cost(project)对既定组织返回monthly amount=0；不是实际创建账单或配额保证。
- 旧业务行数：business_records=0、record_shares=0、integration_outbox=0、record.*审计=0、storage.objects=0。未读取正文或个人数据；本机demo不在盘点范围。
- 无云端新项目/迁移/数据写入/角色启用/密钥配置。本地.env.local未为分库新增或替换任何值。

## 待办与边界

最终云端审核docs/architecture/2026-10-24-separated-database-cutover.md；用户批准后才执行。真实双库连通、原账号MFA访问、员工创建、共享业务切换、备份恢复和旧角色/旧表物理清理未验收。旧空业务表及app_backend仍在旧项目，不把应用代码改线声称物理分库已完成。

## 云端获批执行补记

- 用户ok后，get_cost复核monthly amount=0；旧业务records/shares/outbox/业务审计/storage.objects仍0。
- 创建business项目wjrwqkduohqpqzigmhys，名称trade-workstation-business-test，ap-southeast-1，ACTIVE_HEALTHY。
- 应用identity迁移separate_identity_permissions/version20261024060716、business迁移initialize_independent_business/version20261024060735。base SQL显式begin/commit去除，使用工具迁移事务；追加实际项目用途标记。业务空company_profiles使用身份目录实际核实的稳定UUID，没有复制业务正文。
- 实际has_*核验：identity_backend schema_access/session_view_read/member_create=true，legacy_business_read/audit_delete=false，active_admins=1；business_backend schema_access=true，anon/authenticated_access/audit_delete=false，company_profiles=1，业务schema身份表0，平台内置Auth users0。
- 两个新专用角色LOGIN均false，等待用户隐藏输入连接配置；工具元数据核验不等于真实低权限网络连接已通过。旧混合角色与空表仍保留。
- 业务安全顾问lints=[]；身份仅既有Auth泄露密码保护关闭提醒，未擅自修改设置。
- 未记录管理员密码、未写.env、未发送邮件、未创建员工或业务测试记录、未删除数据、未操作旧暂停项目。

## 用户完成双连接配置后的实测

两次--verify-saved分别identity/business通过；实际低权限连接对身份会话视图/员工新列、业务表空结果查询通过；身份旧业务读权限false；匹配公司商业目录1；文件权限0600。未改密码、未输出凭据或读取业务内容。服务确认cwd后由7358重启为session66603，登录200/admin未登录401。员工创建secret仍未配置，不能声称添加员工已可用。用户最后ROLE_ALREADY_CONFIGURED只是重复初始化保护，不应继续重设角色或运行--recover-config。

## Auth管理密钥已配置

用户完成隐藏配置后，检测存在且文件权限0600。Auth Admin getUserById(全零不存在UUID)返回404，确认身份端点接受管理密钥；不读取真实用户资料，不输出原始错误和密钥。确认项目服务10507后重启为session77966。登录页200，未登录创建接口POST401。没有创建真实或虚构员工、没有发送邮件；真实创建闭环仍需用户提交与验收。
