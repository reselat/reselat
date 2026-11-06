# RESELAT Local Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将已确认二期首阶段推进为可操作的本地验收版本，保留原业务模块，明确区分虚构本机验证与真实通道。
**Architecture:** 复用当前Next.js业务服务、身份/业务双库和确定性命令。仅开发时用两份独立PGlite持久库提供虚构身份，生产仍使用原认证链。知识库与接待服务新增独立模块，不启用未验证通道。
**Tech Stack:** 现有Next.js、TypeScript、PGlite、postgres.js、Vitest、Zod；不接入真实账号或Key。
**Spec:** ../specs/2026-10-31-reselat-phase2-assistant-pilot-design.md

## Global Constraints

本地虚构身份只允许development、显式RESELAT_LOCAL_TEST=1、非Vercel、loopback同源；不可在production绕过认证。独立.local-test-data目录必须Git忽略。真实微信和付费调用关闭；未完成能力明确标注。保留原财务与多模型代码。不改原云库、万捷副本，不复制秘密。

## Review Focus

生产误开虚构账号；跨域切换角色；重启丢失数据；虚构资料污染云库；知识未审核即用于回复。各实现任务必须包含相应失败测试。

### Task 1: 本机完整工作台

Files: src/server/local-test/{guard,sql,database,session}.ts; src/app/api/local-test/session/route.ts; scripts/start-local-test.mjs; tests/reselat-local-runtime.test.ts; 修改src/server/db/client.ts、src/server/auth/session.ts、src/app/login/page.tsx、package.json、.gitignore。
Interfaces: localTestEnabled(env):boolean、localTestAuthority(host,origin):boolean、localDatabase('identity'|'business'):Promise<postgres.Sql>、localSession(admin):现有会话类型；本机入口POST /api/local-test/session仅在同源loopback签发虚构角色cookie。
- [ ] 写守卫生产/云端/跨域失败与参数化SQL回滚测试；运行看到缺模块失败。
- [ ] 基于既有万捷本机适配器复用必要底座，使用RESELAT命名与全量业务迁移，不复制万捷业务删减或数据。
- [ ] 接入本地条件分支并展示明确测试身份选择；npm run test:local监听127.0.0.1:3120，清空继承云配置。
- [ ] 验证测试PASS，真实浏览器进入管理看板、客户与订单页，新建虚构资料并重启后仍存在。
- [ ] 提交任务与运行证据。

### Task 2: 知识与审核发布

本任务详细字段与PDF文件限制基于E0证据另列子计划；界面包含原件、候选条目、人工更正、发布及撤销，不依赖真实模型。规则禁止未发布报价被接待服务引用。

### Task 3: 接待与交接

本任务另列持久化接待任务子计划；可用虚构消息验证夜间白名单回复、工作时间草稿、接管、版本引用、重复消息与unknown核对。真实微信/邮箱未接通时不得提供暗示已连接的状态。

### Task 4: 验收与交付

完整测试、构建、浏览器三角色闭环与独立审查。记录未接通真实能力与正式部署前置条件。用户要求最终效果不等于授权真实账号外发；只在已验证能力范围内交付。

## 执行记录

用户已选择直接执行并明确要求继续到可操作版本。本计划Task1可立即执行；Task2/3在落实接口和失败测试子计划后连续推进，不重复询问实施方法。
