# 成员管理追加迁移：执行前审核

状态：本地实现和验证完成，等待共享测试迁移批准。

目标：trade-workstation-test（qgbsikqgunmsipegkvda），现有独立测试项目；不涉及旧项目、生产、邮件、收费或永久删除。

最终SQL：scripts/sql/member-management.sql。仅追加，不修改已应用的初始迁移和会话视图。

变更：
- employees新增可空archived_at，以及归档即停用的CHECK；历史记录默认为未归档。
- app_backend增加employees INSERT、display_name/archived_at列UPDATE。
- app_backend增加audit_events SELECT；对外API按本公司筛选并只投影固定摘要。
- 新增私有member_provisions创建追踪表，仅存请求ID、公司/操作者、姓名、角色、状态、Auth UID和时间；无密码/邮箱正文；无anon/authenticated授权。app_backend只能SELECT/INSERT及更新状态、UID和时间，无DELETE。
- 更新最后管理员触发器覆盖归档；身份仍不可变。成员变更与创建关联均锁公司并复核操作者，保留版本控制和审计。

应用后验证：用实际app_backend查询新列和空创建列表、核对权限元数据，不读取实际成员资料；验证未登录管理API返回401。实际虚构账号创建/角色更新/归档需额外明确批准测试对象。服务端Auth密钥由用户运行隐藏配置脚本，不在聊天中传递。

回滚：先恢复上一版管理员页面/API；追加迁移撤销本轮新增INSERT/UPDATE/审计SELECT/追踪写权限，保留新增列、表和审计，不删除已创建账号或业务关联。旧版会话查询使用私有视图，保持不动。需要恢复已归档成员由管理员逐一核对后恢复，不批量重启账号。

本地验收：39文件129测试、lint、build、构建后typecheck通过。PGlite执行真实SQL验证归档保护和关联保留；创建流程端口测试重复提交/未知结果/关联失败；真实PGlite追踪/恢复集成验证旧请求超50条可翻页恢复且不会重复关联。此处未实测网络级数据库并发或真实Auth创建。

界面：桌面1440与窄屏390检查；虚构创建提交、角色矩阵、搜索空态、审计和待处理页通过；抽屉Escape关闭与焦点返回通过。用于验收的虚构页面及fetch模拟已移除，不进入最终构建。

独立只读复核：无Critical，1项Important（历史请求被50条截断）已补分页并加API/PGlite恢复回归。真实成员创建/登录/归档闭环仍未验收。
