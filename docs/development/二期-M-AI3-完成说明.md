# M-AI3 完成说明

按路径 A、闸门 A 实现 Maps → leads 适配器。纯函数 normalizeMapsCandidate 接收外部候选，支持 placeId/place_id、mapsUrl/maps_url、notes/address/phone；姓名 trim，邮箱必填、校验并小写。复用 parseLeadBatch：source=maps 的行走适配器，按邮箱后写覆盖，失败行保留行号并显示。原 JSON 导入行为保留。

获客工作台现有粘贴/上传入口接受 Maps JSON，例如：

```json
[{"source":"maps","name":"Buyer","email":"buyer@example.com","place_id":"fixture-place","maps_url":"https://maps.google.com/?q=fixture","notes":"人工提供"}]
```

新增迁移 20261105170000_leads_maps.sql 扩展 source check，添加可空 place_id/maps_url/notes/address/phone 列。upsert 写入元数据，冲突时更新来源和显式提供的元数据，未提供的元数据保留；列表返回元数据并最小展示来源、地点 ID、URL、备注。RLS/grant 不变。演练迁移清单同步更新。

fixture 测试覆盖规范化、无效/缺失邮箱、空姓名、重复邮箱和数据库 upsert/list 元数据持久化。验证：npm test -- --maxWorkers=2；npm run typecheck；git diff --check，全部通过：118 个测试文件、465 项测试，typecheck 无错误，diff 检查无错误。

无真实 Maps/Places 调用、密钥、SMTP、发送或 Agent 审批改动；freshness strong/unknown 非否决语义保持不变。未操作生产库或 .env；迁移仅在本地 PGlite 测试执行，部署时需按顺序应用新迁移。
