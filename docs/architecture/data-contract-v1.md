# 本地首轮数据契约

状态：设计契约，未应用数据库迁移。演示数据不能作为持久化实现。

## 字段与关联

业务主键采用 UUID；编号与主键分开。业务表均含 company_id，表头含 version、创建和更新内部操作者 ID。租户字段是单主体防误关联，不代表多租户平台通过验收。

| 对象 | 关键字段 | 关系和约束 |
| --- | --- | --- |
| staff | auth_user_id、company_id、enabled、role | 身份来自 Auth，角色来自受控档案 |
| customers | owner_id、company_id、name | 共享通过 customer_shares(customer_id,staff_id) 唯一关系 |
| contacts / followups | customer_id、company_id | 服务层核验关联同公司 |
| products | sku、name_zh、name_en、unit、customs_code、customs_verified_at | company_id＋sku 唯一；编码字符串，不自动推断 |
| suppliers | company_id、name | 采购资料与销售资料分权限 |
| sales_orders / lines | currency、minor_scale、version；quantity、unit_price、amount_minor | 明细正数，金额整数，描述在确认时快照 |
| purchase_orders / lines | supplier_id、sales_line_id、quantity、cancelled_qty | 一采购行对应一销售行；供应商拆单可多行 |
| receipts / lines | purchase_line_id、accepted_qty、rejected_qty、reversal_of | 保留原始流水，异常量不可出运 |
| shipments / lines | sales_order_id、sales_line_id、quantity、state、version | 首发批次与行所属销售订单一致 |
| shipment_sources | shipment_line_id、receipt_line_id、quantity、state | 预留／消耗／释放，来源同销售行 |
| packages / lines | shipment_id、package_no、shipment_line_id、quantity | 同批次，箱号唯一；重量维度明确 |
| documents / versions | type、source_id；version、snapshot、template_version、render_state、generation_token | 内容确认后只读，版本唯一 |
| attachments / associations | object_key、mime、size、sha256、business_id | 显式业务关联约束；文件私有 |
| idempotency_requests | actor_id、command、key、request_hash、result | 三元键唯一；同键异请求拒绝 |
| audit_events | actor_id、action、entity_id、version、request_id | append only，不存个人资料或正文 |

## 数值

quantity／unit_price 为精确十进制；amount_minor 为整数，通过字符串过 JSON。测试样例采用 HALF_UP，不代表生产财务规则已确认。允许币种、scale、最大量和舍入在生产前冻结。

## 连接与权限

私有 schema 不暴露 Data API；app_backend 为非超级用户、无 BYPASSRLS，只授必要 DML／执行权限，不授 schema 管理或审计修改权。迁移账号独立。连接池模式、自定义角色和事务行为需真实隔离数据库验证。

当前 /api/orders 返回 503 SERVICE_NOT_CONFIGURED。演示页和 PI 接口只访问封闭的虚构样例，不映射员工身份，不连接 Supabase。
