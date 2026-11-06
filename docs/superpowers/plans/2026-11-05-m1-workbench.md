# M1 获客工作台 Implementation Plan

> 按用户要求由当前 agent 独立实施，使用 executing-plans，不派发子 agent。

**Goal:** 导航按业务重组，E6 获客闭环在同页呈现。
**Architecture:** shared.tsx 保留角色过滤与路由；独立纯函数计算步骤，prospecting.tsx 复用 E6 hooks 与命令，只加结构。
**Tech Stack:** React / TypeScript / Vitest。
**Spec:** docs/development/二期-M1-任务简报.md

## Global Constraints
只学 Kevin 流水线和 EvoFlow 指挥心智，不复制源码、不嵌入；不改后端与 MCP 禁区；不发信、不接生产库、不读 .env；本机仅 loopback。仅 M1。

## Review Focus
- 非 admin 不显示获客入口；任务中心仅 admin + local-test。
- 所有旧业务链接保留；任务中心不再藏在设置。
- 无选择、缺背调、草稿、待审、批准、拒绝均有明确步骤。
- 步骤依据最新草稿，不依赖审批列表筛选。
- 窄屏恢复单栏，步骤链接支持键盘定位。

### Task 1 导航与工作台
- [x] tests/prospecting-workbench-ui.test.ts 先测导航角色、流水线状态与锚点，运行确认失败。
- [x] shared.tsx 重分组，任务中心上移；prospecting-pipeline.tsx 提供步骤计算和步骤条。
- [x] prospecting.tsx 改标题、双栏和区段，保留 E6 命令；workspace.css 添加结构样式。
- [x] 运行定向测试及完整 npm test、npm run typecheck。
- [x] 自审差异、写完成说明、仅暂存本次文件并提交。

Ruling: 用户已明确执行简报并要求独立实现，因此直接按简报实施，不另开方案确认或派发评审子 agent。现有 linked worktree 复用。
