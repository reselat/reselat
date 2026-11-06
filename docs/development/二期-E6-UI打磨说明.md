# 二期 E6 获客邮件页 UI 打磨说明

- 页面按工作台惯例重构为三个 `Panel`：线索（列表 / 新增 / JSON 导入）、背调与草稿、人工审批队列；统一使用 `Heading`、`Panel`、`ResourceState`、`MutationState`、`Status`。
- 线索改为 `shared-table-wrap` 表格，展示姓名、邮箱、来源、创建时间；点击行或“选择”按钮均可选中，选中行高亮并同步到背调与草稿区。
- JSON 导入改为 textarea + 主按钮，导入结果按成功/失败使用 `shared-feedback success/error` 展示，并给出成功/失败数量；Zod 原始错误压缩为“邮箱格式不正确”等中文提示。
- 审批队列增加中文状态筛选与表格；pending 行提供“人工批准 / 人工拒绝”，approved 行提供“回写客户与跟进”，并持续说明审批不会发送邮件、不会调用 SMTP 或外部发信服务。
- `Status` 仅补充 `approved`、`rejected`、`pending_approval` 的中文映射与徽章色，未改导航逻辑。
- 仅调整获客页布局与少量 `workspace.css` 专用 class；未改服务端命令语义、SQL、幂等、MCP、Host、技能加载器、审批闸门，也未新增发送能力。

## 验证

- `npm run typecheck` 通过。
- `npx vitest run tests/business/prospecting.test.ts tests/business/prospecting-batch.test.ts`：2 个文件、6 项测试通过。
- 本机测试站（http://127.0.0.1:3120）浏览器自检：桌面与 390px 视口无页面级横向溢出；线索选择、背调保存、草稿保存、提交审批、JSON 导入成功/失败提示均可见。
