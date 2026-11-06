# aiclient 地图搜客接入结果

日期：2026-11-06（本工作树）
范围：获客工作台「1. 发现 / 搜客」+ Agent 白名单；不改 aiclient 本体，不部署、不 push。

## 已交付

- 获客第一步新增「地图搜客 · aiclient」面板：国家/城市/行业关键词、20/40/60 条、语言、官网补邮箱；结果表格可全选/勾选后导入。
- 新增服务端代理 `src/server/business/leadtool.ts`，浏览器只调用本站命令，不直接接触 `x-app: leadtool`：
  - `POST {LEADTOOL_BASE_URL}/api/search`
  - `POST {LEADTOOL_BASE_URL}/api/enrich`（仅在勾选 enrich 时）
  - 默认 `https://aiclient.reselat.de5.net`，只允许 HTTPS（本地调试允许 `http://localhost` / `127.0.0.1`）。
- 新增业务命令：
  - `maps_search`：返回 aiclient 原始候选行，可选 enrich，不写库。
  - `maps_import`：接受搜客参数（服务端先搜后导），或接受 UI 已勾选并规范化的 `rows`；写入线索库。
- 导入统一走 `upsertLead`（与手工/JSON 导入同一 SQL），`source='maps'`，保留 `placeId`、`mapsUrl`、`address`、`phone`、`notes`；同一邮箱 upsert 合并。
- Agent 新增 `maps_import` 写工具，仅 `prospecting` 角色可见；权限复用现有 `leads_upsert` 权限，不新增数据库迁移。
- 红线保持：`maps_import` 只写 `leads`，不创建草稿、不提交审批、不发送 Brevo、不调用 approve/reject；Agent 仍无法调用发送/审批动作。

## 邮箱策略

- 有合法邮箱：小写后作为合并键。
- 无邮箱或上游邮箱格式无效：使用稳定、不可路由的占位地址：
  `noemail+{sanitized placeId}@maps.import.local`
- `notes` 写明「无公开邮箱」或「上游邮箱格式无效，未使用」，并附带行业、国家、城市、官网、评分/评价数、邮箱来源。
- UI 在线索列表和详情中把占位地址标为「无邮箱」，同时显示占位地址本身，避免误认为真实可发信邮箱。

## API / 命令契约

### `maps_search`

```json
{
  "requestId": "uuid",
  "payload": {
    "country": "Germany",
    "industry": "industrial valves",
    "city": "Hamburg",
    "maxResults": 20,
    "language": "en",
    "enrich": false
  }
}
```

返回 `{rows, note?, enriched?, enrichError?}`。`enrichError` 是警告，不阻断导入。

### `maps_import`

搜索后直接导入：

```json
{
  "requestId": "uuid",
  "payload": {"country": "Germany", "industry": "valves", "maxResults": 20, "enrich": true}
}
```

或导入 UI 已勾选的行：

```json
{
  "requestId": "uuid",
  "payload": {
    "rows": [
      {
        "name": "Buyer GmbH",
        "email": "sales@buyer.example",
        "source": "maps",
        "placeId": "ChIJ...",
        "mapsUrl": "https://maps.google.com/?cid=...",
        "notes": "行业：valves"
      }
    ]
  }
}
```

返回：

```json
{"id":"batch uuid","leadIds":["..."],"imported":2,"skipped":0,"errors":[],"enrichError":"LEADTOOL_TIMEOUT"}
```

没有可导入行时返回 `NO_IMPORTABLE_MAPS_ROWS`；上游错误映射为 `LEADTOOL_UPSTREAM_FAILED` / `LEADTOOL_TIMEOUT` / `LEADTOOL_INVALID_RESPONSE`，HTTP 502/504，不把上游原始响应体透传给浏览器。

## 权限与 Agent

- 路由：`src/app/api/workspace/business/route.ts` 的 `maps_search` / `maps_import` 均要求现有获客门禁。
- Agent 调用 `maps_import` 时，路由和事务内各校验一次：
  `assertAgentWrite(actor, roleCode, 'leads_upsert')`。
- `scripts/agents/tools.mjs` 中 `maps_import` 的 authority 显式设为 `leads_upsert`，因此：
  - 现有 `20261105100000_agent_roles.sql` 的 `allowed_actions` 约束不用改；
  - 被缩减为仅 `leads_upsert` 的 prospecting 角色仍可使用地图导入；
  - 角色停用或移除 `leads_upsert` 后，工具从 `tools/list` 消失且调用被拒绝。
- `maps_import` 不接受 approve/reject/send 参数；相关动作也不在工具白名单。

## 主要文件

- `src/modules/business/maps-lead-adapter.ts`：原始行 schema、邮箱策略、notes 组装、UI/命令共用映射。
- `src/server/business/leadtool.ts`：aiclient HTTP 客户端、超时、错误归一化、enrich。
- `src/server/business/maps.ts`：`maps_search` / `maps_import` 业务命令。
- `src/server/business/lead-upsert.ts`：手工/JSON/Maps 共用的线索 upsert。
- `src/modules/business/ui/prospecting.tsx`：搜客面板、勾选导入、无邮箱标识。
- `src/app/api/workspace/business/route.ts`：命令分发与 Agent 门禁。
- `scripts/agents/p1-schemas.mjs`、`scripts/agents/tools.mjs`：Agent schema/工具白名单。
- `src/server/business/http.ts`：搜客错误的中文安全提示与状态码。
- `.env.example`、`.dev.vars.example`：`LEADTOOL_BASE_URL` 可选配置。

## 测试

新增：

- `tests/business/leadtool.test.ts`：mock fetch，覆盖 URL、`x-app`、请求体、超时、上游错误、非法 base URL、enrich。
- `tests/business/maps-lead-mapping.test.ts`：有邮箱/无邮箱/非法邮箱/空名称回退/JSON Maps 导入。
- `tests/business/maps-import.test.ts`：PGlite + mock fetch，覆盖 search→import、source=maps、placeId/mapsUrl 保留、enrich、UI rows 模式、无草稿/无审批、角色拒绝、不可导入。
- `tests/business/maps-agent-tool.test.ts`：`maps_import` 仅 prospecting 可见、复用 `leads_upsert`、角色缩减/停用即拒绝、其他角色不可见。
- `tests/maps-prospecting-ui.test.ts`：搜客面板字段与“仅入库、不发信/不审批”文案。

执行结果（本机）：

- `npm run typecheck`：通过。
- 相关新增/受影响测试：通过。
- `npx vitest run`：500 passed / 1 failed；失败为 `tests/business/access.test.ts` 中一条既有断言（要求 admin `aal1` 的 `confirm` 被拒绝），与 `tests/auth-live.test.ts` 明确采用的“password-only administration”策略冲突。该文件与本次改动无关，未修改。
- `npx eslint`（本次改动文件）：通过。
- 测试未调用真实 aiclient；生产环境需在目标环境设置 `LEADTOOL_BASE_URL`（或使用默认值）并确认出网。

## 未做 / 后续

- 未部署、未 push、未改 aiclient、未改 Brevo 人点发流程。
- 未做真实线上 rehearsal；建议上线前在获客页做一次只读搜索 + 导入 1 条测试线索，再核对 `leads.source='maps'`。
- 未单独提供 `maps_enrich` 命令；enrich 作为 search/import 的可选步骤，失败不阻断入库。
