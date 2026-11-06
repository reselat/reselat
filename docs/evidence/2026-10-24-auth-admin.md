# 登录与管理员实施证据

2026-10-24，完整档。用户批准三角色方案、固定依赖及独立零预算测试项目创建，随后明确使用当前连接账号。

## 实际动作

- 新建trade-workstation-test，ref qgbsikqgunmsipegkvda，ap-southeast-1；工具返回ACTIVE_HEALTHY。当前组织Free，创建报价0美元/月，未要求confirm_cost。无付费升级。
- 安装固定版本Supabase JS/SSR、postgres、开发用PGlite，npm --ignore-scripts；安装审计0。未据此假称既有风险已由安全团队关闭。
- 项目URL与publishable key写被忽略.env.local，不输出值；无高权限密钥或数据库密码入代码/聊天/文档。
- 登录/退出、SSR Cookie刷新、受保护工作区、TOTP MFA页面、管理员角色/启停、共享客户/产品按对象API与页面。入口/重定向、同源写、字段白名单、当前员工状态与角色、版本冲突、数据库低权限连接检查。
- scripts/sql/auth-admin-schema.sql仅本地执行；尚未云端建业务表、未创建公司/员工、未发邮件或导入真实数据。

## 验证

- auth-live-red.log：身份辅助模块缺失见红；auth-local-green.log：可信员工/角色/MFA、SQL约束、数据范围本地通过。
- auth-db-permissions-red.log：未配置app_backend角色时失败；补最小授权后通过。
- shared-records-red.log：共享投影模块缺失见红；auth-projection-red.log：客户额外银行字段未过滤见红；补字段白名单后回归。
- 最后管理员、非法角色、员工身份不可变、app_backend能读必要表/不能DDL与删除审计；PGlite实测，不等于真实连接池并发验证。
- 初次lint拒绝在try/catch内构造JSX，已将会话捕获与组件渲染分开，不关闭规则。
- 最终全量命令记录auth-admin-{tests,typecheck,lint,build}.log；最终数字待本轮完成补记。

## 待批准与待验证

云端SQL审阅单：docs/architecture/2026-10-24-auth-cloud-initialization.md。独立测试初始化需用户确认。首位管理员、公开注册关闭、专用连接凭据、真实双账号/MFA/撤权联调尚未完成。

订单/采购/出运/收付款/单据与退税仍为原/demo本机试用；未迁移的页面不挂入登录工作区，不声称全系统多人共享。外部财务仅有默认disabled的outbox契约草案。

## 独立复核与浏览器

- 独立只读复核发现1项Important，无Critical：app_backend仅SELECT无法执行公司FOR UPDATE行锁。auth-lock-red.log实际42501；补companies.name列级UPDATE（不含id）后auth-lock-green.log通过。新增以app_backend执行真实本地事务：公司锁、员工版本更新、客户写入、审计追加，并验证不能改公司ID。作者回归不是二次独立复核。
- 浏览器实测/admin未登录跳/login；/api/admin/employees与共享资料API返回401且no-store，无数据正文。
- 虚构无效账号auth-test@example.test登录被拒绝，未创建账号或外发邮件。没有真实账号，不据此声称成功登录、MFA或角色管理云端联调通过。测试浏览器空间已结束，未升级工具。

管理员MFA通过后额外检查JWT session_id与当前auth.sessions的user_id匹配，拒绝已撤销会话。SQL仅授予会话id/user_id列只读，PGlite使用本地Auth表夹具验证其他列及删除不可访问；未将夹具验证称为真实Supabase会话撤销集成。

## 本轮最终验证

21个测试文件、91项测试通过；typecheck、ESLint、build均exit 0。未提交/push、未部署、未应用云端SQL。当前停在约定的共享测试初始化审批点，不能声称员工已可实际登录使用或全业务多人协作已完成。

## 用户确认后的云端初始化（2026-10-24）

- 用户明确回复“ok，可以”，授权执行审阅单的独立测试初始化。
- 先读核实目标trade-workstation-test无trade_private schema、无app_backend角色，public/trade_private无表，Auth用户数0；未触碰原暂停项目。
- apply_migration initialize_trade_auth_admin返回success:true；迁移历史version 20261023233026。
- 已应用SQL原稿scripts/sql/auth-admin-schema.sql SHA256：007b0409663b413d249cec60512dae9d3147de4e11db63d5dbff53063d8cadc6。原稿冻结，后续共享修改使用追加迁移；首行draft注释是应用前历史，不作为当前状态。
- 云端复查：私有业务表6；anon/authenticated无schema USAGE；app_backend NOLOGIN且无superuser/createrole/createdb/bypassrls；可使用name列行锁、不能改公司ID、不能删审计、可只读Auth会话ID；employee_count 0。
- get_advisors security返回lints:[]，不等同于应用完整安全审计或生产上线通过。
- 尚无公司、管理员或员工业务数据；没有发邮件、导入localStorage、设置数据库密码、启用后端LOGIN或部署。真实登录工作区仍需受控账号引导与专用连接配置。

补充验证限制：尝试通过连接器SET LOCAL ROLE app_backend做只读探针，云端返回42501 permission denied to set role；连接器当前数据库角色没有该角色成员资格。未添加成员关系或扩大权限绕过。此前云端权限值为has_*_privilege只读检查，不能称为已用真实app_backend连接执行成功。该错误不改变已成功迁移；真实低权限连接联调留待专用凭据配置后执行。

## 首位管理员引导

用户回复已创建账号。只读核实Auth用户数1、company/employee数均0，读取仅UID、不读取邮箱/密码；显式关联用户指定的唯一新账号为启用admin，创建测试公司并写bootstrap.admin审计。邮箱确认布尔值为true。不存在自动首个注册提权。

新增本机隐藏TTY输入配置脚本scripts/configure-database.mjs与docs/setup/管理员首次连接配置.md；尚未使用真实连接串运行。脚本校验目标新测试项目，避免误连旧库；原管理员连接只在内存，专用连接写忽略.env.local并0600。已有LOGIN角色时拒绝自动轮换。

语法和lint通过，非TTY拒绝且不回显输入的测试已加入。真实连接配置、MFA、公开注册关闭仍未完成。

配置脚本独立只读复核发现1项Important：连接URI查询参数可被postgres驱动用来覆盖账号，破坏目标校验。新增parseSetupTarget严格拒绝所有query/hash、非postgres数据库与非5432端口，仅允许目标项目postgres管理员；database-setup-target-red.log见红，修复后全量94项测试、类型、lint通过。非TTY执行按预期exit1且不回显输入。配置脚本未使用真实凭据运行，不能声称已完成低权限连接。

## 配置失败的安全诊断修订

用户反馈原向导仅输出笼统失败。尚无原始错误，不能推断是密码或TLS；云端复查app_backend仍NOLOGIN/无高权限，确认尚未完成角色变更。按systematic-debugging先补边界诊断，不关闭TLS、不扩权、不索取连接串。

新增白名单阶段/错误码诊断，原始消息即使含密码/主机也不会输出；支持保留[YOUR-PASSWORD]后单独隐藏输入密码并URL编码。database-setup-diagnostics-red.log见红，修订后全量98测试、类型、lint、脚本语法通过。指南同步更新。真实失败原因仍待用户重跑后的脱敏码确认，不能声称真实连接已修复。

## TLS根因与实际修复

用户新诊断为connect/SELF_SIGNED_CERT_IN_CHAIN：此前只启用verify-full，未配置Supabase专用CA，造成链验证失败。已加入共享databaseTls配置、CA内容校验与CLI --ca/环境变量支持，移除运行时TLS disable分支，拒绝关闭证书验证。

首次尝试supabase.com/downloads/prod-ca-2021.crt返回404，未使用该结果；随后沿官方GitHub Studio SSLConfiguration与custom-content.json定位生产CA实际HTTPS地址，下载200，检查CA标志/颁发者/有效期/固定SHA256指纹，存于assets/certificates。脚本和应用默认加载并由配置脚本持久记录公开CA路径。

脚本scripts/check-database-tls.mjs对用户提供的公开会话池host进行PostgreSQL STARTTLS；严格CA/主机名验证通过，日志database-tls-probe.log。没有发送数据库用户名/密码、Startup登录包或SQL，不改变云端角色，不将握手通过等同于数据库认证成功。

新增数据库TLS配置测试（无证书时仍严格验证、合法CA、私钥/无效内容拒绝、官方指纹）。最终结果见database-tls-{tests,typecheck,lint,build}.log。

## 28P01连续反馈排查

不继续归咎用户密码，也不重复重置。核验postgres可登录且无有效期限制，app_backend仍NOLOGIN；未读取密码/hash。用虚构特殊字符实际构造postgres驱动验证options.pass与options.user正确还原，只输出布尔结果。

直接项目host TCP可达，但严格TLS探针TLS_TIMEOUT，故未推荐未经验证的直连替换。正常会话池严格TLS此前通过。

发现并本地复现raw隐藏输入过滤只丢弃ESC、却留下[200~/[201~控制字符串；这可能污染终端粘贴密码，但不能证明用户本次错误即此原因。hidden-input-red.log先失败，修复为跨chunk终端序列状态机，并拒绝多行粘贴、支持Unicode退格。新增--check-only只读认证检查，打印经校验的公开项目/主机信息，不写角色或.env。

104项测试、类型、lint、脚本语法通过；真实认证仍待用户本机重跑，未索取或打印其密码，无云端写入。

### configure_role UNKNOWN 修订

用户正式配置失败后，只读查询确认app_backend仍NOLOGIN。实际脚本format参数缺少类型，以PGlite绑定参数离线复现42P18；补::text后见绿，测试同时执行虚构密码生成的角色DDL并核对无高权限。新增42P18固定脱敏提示。红/绿日志role-setup-red.log、role-setup-green.log；全量106测试、typecheck、lint、node --check通过，日志role-setup-{tests,typecheck,lint}.log。未读取或记录用户凭据，未写云端；实际重跑待用户完成。

### MFA二维码渲染

实际组件对Supabase多行SVG data URI未编码，虚构数据经Next getImageProps先失败；编码后同一测试及原始/已编码SVG回归通过。28文件108测试、lint、build通过，typecheck在build结束后重跑通过（首次并行触发生成文件暂缺）。证据mfa-qr-{red,green,tests,typecheck,lint,build}.log。未读取真实验证器密钥，未改认证要求，真实MFA闭环待用户验证。

### 中断后重复绑定

云端聚合发现1条unverified TOTP；官方错误说明同一用户factor不可同friendly name。原组件固定名称，修改为不指定可选名称，保留已有绑定记录；二维码处理成功后才更新factor。回归先红后绿，全量110测试、lint、typecheck通过，见mfa-enrollment-*.log。未调用真实enroll/unenroll，真实MFA仍需用户完成。

### 已批准私有会话视图

用户ok后云端add_private_auth_session_view迁移成功；实际低权限连接空结果会话查询通过，SELECT=true/DELETE=false/anon及authenticated schema USAGE=false。应用requireEmployee切换私有视图，保留AAL2与双ID匹配。112测试、lint、build、构建后typecheck通过，见auth-session-view-*.log。安全顾问仅既有Auth泄露密码保护关闭提醒。未读取实际会话值，真实浏览器admin待用户刷新确认。
