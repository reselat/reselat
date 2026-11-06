# 分库云端切换审核

状态：本地改造已完成，尚未创建业务项目、应用新SQL、移动数据或清理旧表。

## 实际盘点与费用

2026-10-24只读查询目标trade-workstation-test：business_records=0、record_shares=0、integration_outbox=0、record.*业务审计=0、storage.objects=0。未读取业务正文/邮箱/密码。原本机demo localStorage不在云库盘点范围，不导入。

组织沿用用户选定的Oliver-corp's Org（uuibslkwudobkdtqzrwm）；当前有1个ACTIVE_HEALTHY外贸测试项目及1个INACTIVE旧项目。Supabase get_cost对该组织新project返回monthly amount=0，费用硬上限0。不保证创建必获免费配额；若平台拒绝或报价改变立即停止，不恢复旧项目、不升级套餐。

## 提请批准的准确范围

1. 在上述组织新建trade-workstation-business-test，ap-southeast-1，与身份项目同区域，报价每月$0，硬上限$0。只创建这一个独立测试项目。
2. 现身份项目应用scripts/sql/identity-management.sql，并在同一受审迁移内插入用途标记：purpose='identity'，project_ref='qgbsikqgunmsipegkvda'。保留Auth、现管理员及MFA；新增identity_backend NOLOGIN、归档/创建追踪能力、最小权限及用途标记。原已应用SQL不改写。
3. 新业务项目应用scripts/sql/business-initial-schema.sql，并以工具返回的真实新project ref插入business用途标记；从身份目录只读获取本公司稳定UUID后，创建company_profiles空商业档案，仅id，不复制公司商业信息或假造业务资料。新business_backend为NOLOGIN。
4. 应用前重新核对旧业务计数；若不再为0则停止数据切换，单独展示迁移/对账方案，不自行导出或忽略新增数据。
5. 新SQL应用后检查权限、标记、私有schema和安全顾问。用户在本机隐藏配置两个低权限连接和身份Auth Admin key，服务重启后验证双连接和既有账号登录/MFA。

不包含：真实员工创建/测试账号创建、业务资料写入、邮件、生产、旧项目操作、永久删除、旧混合角色撤销或旧表清理。后两项另行审核；保留它们期间只能说“应用访问分离”，不能说“身份库已物理清空旧业务对象”。新项目ref取得后将写入执行记录，不猜测或手填虚构ref。

## 数据库职责及最小权限

- identity_backend：只进入身份trade_private，读公司目录/员工/身份审计/受限会话视图/标记；写员工有限列、追加身份审计和创建追踪。无旧业务表权限，无Auth直接写权限。
- business_backend：只进入trade_business，读产品/客户/供应商/共享关系/商业档案/标记；写业务资料有限列并追加业务审计。无员工/Auth/角色表和跨库员工外键；无DDL、审计删除、标记修改权限。
- 旧app_backend保留待审批清理，应用已不再使用。不能用“连接已切换”掩盖旧授权仍存在。

## 配置与恢复

见docs/setup/双数据库配置.md。用途标记必须在获批迁移时填入，未填时配置向导主动拒绝。两个向导阶段互不冒充双库已全部完成。初次启用失败明确未提交时仅清理本次创建的临时凭据文件；网络断开等未知结果保留，用--recover-config实际认证后合并该用途配置。

## 验收和回滚

本地使用两个独立PGlite实例，包含实际身份查询、业务低权限事务、乐观版本、业务同事务审计、停用拒绝及旧角色不混用的验证。Auth服务为虚构响应，本地通过不等于真实云端Auth/网络并发验收。

新库切换前失败：保留现有身份数据/旧业务表，修复新增资源或配置，不删除历史。切换后回滚：先停止新业务写，检查是否新增记录并对账；有新增时不直接切回旧库。新增资源/列/审计保留，撤权通过后续受审迁移。旧表清理必须单独获批且具备恢复证据。

## 2026-10-24 已获批并执行

用户回复ok批准上述云端范围。再次报价monthly amount=0且业务计数仍全部0后，新建trade-workstation-business-test（wjrwqkduohqpqzigmhys），ap-southeast-1，ACTIVE_HEALTHY。

- 身份迁移separate_identity_permissions，version20261024060716，包含identity-management.sql去掉显式事务包装后的内容及identity用途标记。
- 业务迁移initialize_independent_business，version20261024060735，包含business-initial-schema.sql及新业务用途标记；通过旧目录实际查询核对稳定公司UUID后在新库初始化同UUID空商业档案，未生成另一家公司或复制业务资料。
- 两份已应用SQL原文件冻结；SHA256身份6ca124fcdad2b4547510ea4325f9d7117d91723d529e482474aaf6285e79d0b8，业务f3ca242cff76310ec71d432a242833a8a2b9b877fa1d85bd99eaa95cffe653cc；后续只追加。
- 云端元数据核验：identity_backend能读受限会话视图、能INSERT员工、不能读旧业务表/删除审计；启用管理员1。business_backend私有schema USAGE=true，anon/authenticated=false，审计DELETE=false，company_profiles=1、业务schema身份表=0。
- Supabase每个项目自带系统Auth schema，业务项目内置Auth users=0且不用于平台登录；这里“无身份表”指业务schema未创建员工/角色/会话应用表，不声称平台系统Auth schema被删除。
- 新专用角色均NOLOGIN，未生成/保存用户的管理员连接；待用户本机隐藏配置。旧app_backend和旧空业务表保留，未经批准不撤销/删除。
- 业务项目安全顾问无告警；身份项目仍有既有泄露密码保护关闭提醒，未改变Auth设置或套餐。参考 https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection 。

当前完成的是云端结构和权限初始化，不是实际双连接和人员创建验收。下一步按双数据库配置指南分别配置身份、业务连接，再配置身份项目Auth Admin secret；不要在聊天发送密码或key。
