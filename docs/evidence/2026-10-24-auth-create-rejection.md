# 员工创建拒绝：安全错误分类

用户认为邮箱未注册；原实现把所有4xx归为CREATE_REJECTED，并显示邮箱/密码泛化建议，无法据此定位。

只读检查：member_provisions rejected=1；身份Auth账号总数1且启用管理员关联1。统一日志不直接输出任何原始message、邮箱、IP、密码等，仅对序列化log_attributes查询固定码谓词；email_exists=1，其余所检weak_password/not_admin/validation_failed/rate_limit为0。按path直接取值未得到匹配，不能宣称request_id关联；随后查询安全时间聚合，email_exists为06:27:06Z、失败请求为06:27:02.197303Z，4秒时间关联高度吻合。无账号写操作。

修复：auth-create-errors固定分类；provision-flow仅传白名单code；drawer仅固定文案显示。旧历史记录不补造错误码；未知上游码不回显；500/408仍保留未知状态。新增分类及当前响应传播测试，先红后绿见auth-create-errors-{red,green}.log。

实际验证：全量153测试、lint、类型检查通过，日志auth-create-diagnostics-{tests,lint,typecheck}.log。构建日志auth-create-diagnostics-build.log。真实再次创建仍需用户提交，不自动使用其邮箱/密码重试。
