# 客户合同/开票资料与管理员操作记录

## 范围

用户明确要求操作记录仅管理员、我方公司资料归财务、客户管理补齐开票和合同公司信息。架构与字段说明见docs/architecture/2026-10-25-customer-company-fields.md。

实现：财务导航增加我方公司资料，保留既有管理员维护权限。客户编辑/新增分基础、合同主体、开票资料，新增10个可选字段，提供“公司 / 开票资料”只读抽屉。字段经过Zod校验、现有JSONB保存、客户范围投影与订单冻结快照；旧资料兼容、银行前导零保留、旧客户端遗漏字段不清空。SC使用合同全称/注册地址/注册号/授权签署人；PI/CI使用开票抬头/地址电话/税号；PO/PL与收货人不替换，客户开户资料不作为卖方付款指令。不改历史单据，不自动税务开票。

权限：此前全局audit已限制admin，但指定订单audit允许有订单范围的业务员/运营。按本次用户明确要求，新增回归先证实旧行为后将两类读取统一限制admin，订单详情仅管理员显示“操作记录”页签，非管理员参数直入也不渲染；不删除任何审计记录。沿用鲜活身份、MFA、同公司校验，不改变其他业务权限。

## 验证

- 新客户schema/用途投影/单据主体/税号显示4项测试先失败后通过；订单指定audit回归先失败后通过。
- 本地PGlite实际事务测试覆盖保存重读、旧客户端更新保留字段、其他客户负责人无记录、运营禁止客户写入、订单快照、PI/SC主体区分、仍未签署、确认后更新主档不回写、销售/运营全局及订单audit拒绝与管理员成功。
- 首次全量与build并行时出现既有identity测试beforeEach 10000ms超时，其余202项通过；未增加超时/删减断言。完成构建后用vitest run --maxWorkers=2重跑全量，62文件203测试全部通过（新增6项）。日志/tmp/siliantai-customer-all-tests-final.log。
- 最终build、构建后typecheck通过；lint无error，仍为巡检脚本2条既有warning；git diff --check通过。
- 真实模板生成PI/SC虚构PDF并经pdfplumber文本校验：PI有开票抬头/Tax ID，SC有合同全称/注册号/签署人；无客户银行作为付款指令；SC仍unsigned。Poppler渲染并查看PI及SC两页，最终重渲染SC第二页无重叠或截断。测试样本artifacts/pdf/customer-company-PI.pdf、customer-company-SC.pdf，PNG在artifacts/customer-company/。
- ego-browser本机隔离预览渲染真实组件和虚构只读接口。验证查看抽屉3组、编辑16输入字段、bankAccount 000012345回填、390px时页面和dialog宽度/滚动宽度均390、未保存输入保留；深色抽屉rgb(20,28,46)/输入rgb(15,23,42)。我方资料归财务；sales/operations均无audit/admin/settings入口。模态框阻止点击背后的主题按钮符合预期，关闭后再切换。窗口最小化导致截图不可用，未强行恢复，未声称取得新UI截图。浏览器任务和本机预览均已结束，未升级Ego Lite。

## 发布与边界

发布沿用已授权trade-workstation-test/prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9，CLI文件快照；未commit/push，不把巡检HEAD当部署来源。dpl_9Cip2W8jFPu9De2ypVqW3x34kwhA已READY，原固定测试站别名生效，公开登录页HTTP200。前版dpl_HXJUydGGahMqWiiicXaSmxGGJwub可回退；所有字段可选，旧应用忽略新字段，无数据库回退需要，但回退应用也会恢复前版订单记录访问规则。

无需DDL，未修改已应用SQL、双库配置、收费资源、真实资料；云端未写虚构客户，未登录重测云端写入/PDF。字段保存与单据端到端证据属于本地真实PGlite事务+PDF运行时，Storage仍为已有模拟；不宣称云端业务验收。
