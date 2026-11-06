# 思链台

作者：**朱春茂**

版权所有者：**朱春茂**

Copyright © 2026 朱春茂. All rights reserved.

版权声明见 [NOTICE](NOTICE)。

私有代码仓库：[Oliver-corp/siliantai](https://github.com/Oliver-corp/siliantai)。

外贸团队共享业务工作台。唯一业务入口为 `/workspace`，登录 `/login`，管理员成员管理 `/admin`；旧 `/demo` 统一重定向到正式入口，不再提供第二套可用UI。

当前技术栈：Next.js 16、React 19、TypeScript、postgres.js参数化SQL、原生FormData表单、Zod、Supabase Auth/SSR、React PDF、fflate。**未使用Drizzle或React Hook Form。** 锁文件是依赖版本依据。

## 当前功能与边界

客户/产品/供应商、订单审批、采购到货、出运装箱、PI/PO/CI/PL/SC与CO、私有文件、受控签章、业务收付款及冲销、退税资料准备、管理员审计、深浅/跟随系统主题已实现。业务收付款不等于会计总账，退税准备不等于自动申报。

现有验收站为Vercel+两个独立Supabase项目：身份与角色独立，业务数据库及文件独立。按用户要求保留SYNTHETIC验收数据。客户生产资料不得放入该验收环境。

本地服务器方向正在开发和方案评审：已增加standalone、配置化身份/双库、本地私有文件适配、候选Docker/Caddy文件和财务/AI契约；**尚无实际客户服务器，未完成安装、断网、双入口及恢复验收**。财务/AI默认不激活，不发送外部数据。

## 开发与检查

Node 24、npm lockfile；不要提交密钥或真实业务资料。

```sh
npm ci --ignore-scripts
npm run dev
# http://127.0.0.1:3000/login
npm test -- --maxWorkers=2
npm run lint
npm run build
npm run typecheck
```

`.env.example`为云验收配置模板；`deploy/local/.env.example`为候选自建配置。NEXT_PUBLIC变量属于构建期公开配置；管理密钥和数据库口令仅在服务端。CI在push/PR检查并构建self-hosted产物，不自动部署客户环境。

## 维护文档入口

- [RESELAT二期调研汇总与启动清单（2026-10-31）](docs/architecture/2026-10-31-RESELAT二期调研汇总与启动清单.md)：30家工厂、培训带运营、Meta优先、知识库与DSH Bot；区分已确认需求、旧方案及待定决策。

- [开发总结与维护手册](docs/development/思链台开发总结与维护手册.md)：当前实际架构、模块、权限、维护方法。
- [通用开发与交付模板](docs/development/通用业务系统开发与交付模板.md)：可复制用于其他项目。
- [本地化与二期扩展候选方案](docs/architecture/思链台本地化与二期扩展方案.md)：路线比较、双网络、财务/AI及交付阶段，待交叉评审。
- [本地候选配置说明](deploy/local/README.md)：已包含/未完成事项。
- [财务预留契约](docs/architecture/财务接口预留.md)、[系统测试手册](docs/testing/完整系统测试手册.md)。
- [原云验收部署说明](docs/setup/Supabase与Vercel部署.md)仅用于既有云环境。

文档以当前README与维护手册为准。根目录v1.0开发方案、旧本地服务器方案及docs/evidence是有日期的历史设计/证据，不是当前安装说明。历史模块部分schema仍被正式代码引用，不能直接删除整个src/modules/workspace目录。

## 云端备份与数据备份

GitHub私有仓库仅保存代码、测试、锁文件、迁移和无密钥文档。`.env*`、会话、.vercel、私有附件、数据库备份及构建产物均排除。代码备份不能代替身份数据库、业务数据库及私有文件的加密备份与恢复演练。

## 智能运维控制台（独立系统设计）

[设计包与交互原型](docs/operations/README.md)覆盖模型接入、定时多Agent、GitHub隔离扫描、修复复核及受控执行。当前仅设计和无网络调用的模拟原型，未连接真实运维能力或创建定时任务。


## 2026-10-27 财务、客户与退税清单预审

新增费用申请与报销、成本变化复核和站内风险；客户六类彩色标签、不可变公司内唯一编码及成交升级建议；退税资料包版本列表与脱敏AI清单预审。真实模型默认关闭，未配置时不把资料标记为AI通过。

- [客户分类、编码与退税预审契约](docs/architecture/2026-10-27-客户分类编码与退税AI预审.md)
- [本轮完整开发与发布复盘](docs/evidence/思链台本轮开发与发布复盘-2026-10-27.md)

财务成本不是会计净利润；AI清单预审不读取原件、不判断税率和退税资格。已有共享SQL冻结，新环境按迁移顺序初始化，不能仅复制新应用而漏掉业务库追加迁移。
