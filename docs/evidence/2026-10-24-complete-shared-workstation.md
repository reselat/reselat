# SDD ledger — plan: docs/superpowers/plans/2026-10-24-complete-shared-workstation.md

用户已确认设计及实施计划，沿用Native，主智能体唯一写入。最终评审只读。不处理真实资料，不应用未审云端SQL。

Ruling: 当前目录从未初始化Git，无HEAD/分支；按既有授权原地实施，不擅自git init。技能sdd-workspace无执行权限，台账保存在本文件，不因此增加工具链/权限。
Pre-flight: Tasks 1→2–10共享actor/company/scope/command事务；统一Employee.id作为user ID，额外aal随服务器上下文传递，接口不得让客户端覆盖。
Pre-flight: Tasks 3→4→5→8/10共享销售版本/行UUID与来源数量；后续单据只引用确认版本，不能把demo字符串ID带入共享库。
Pre-flight: Tasks 7→8→9→10共享私有文件状态/hash；正式下载固定字节，跨Storage未知结果保留可核对意图。
Pre-flight: Task 11复用前述服务，demo保持隔离，不通过替换localStorage做全库JSON同步。
Task 1: in_progress。ZIP直接依赖授权异步已询问，未批准前不修改依赖声明。

## 2026-10-24 Supabase + Vercel 续作

用户确认继续既有项目，并明确Supabase+Vercel、身份角色与业务分开部署管理。保留双独立项目；本轮完成Vercel本地部署准备、6543运行时支持、统一业务HTTP字节限额及双库命令身份/幂等/回滚补测。最终52文件170测试、lint、build、构建后typecheck通过；独立只读复核无本轮新增可行动问题。

Task 1仍为in_progress：统一基础已验证，现有records路由尚未切入新入口，后续scope与实体联调不得以基础测试代替。Task 2及后续未勾选。ZIP依赖未新增，未执行共享迁移/桶/Vercel发布。详细记录与限制：2026-10-24-supabase-vercel-resume.md。

## 2026-10-25 独立在线测试站及读取修复

用户明确要求在线测试，已发布独立Vercel项目trade-workstation-test，固定地址https://trade-workstation-test.vercel.app 。保持双独立Supabase测试项目，未应用新SQL/桶或写业务资料。

线上读取暴露Next SWC对await SQL tag的压缩缺陷，已修复API与服务三处并增加真实GET源码生产转换/压缩执行回归。最终176测试、build/typecheck通过，lint无error（巡检脚本2条既有warning）；独立只读复核通过。最终dpl_GK6rE1f4kZoniFen2YTwTN8zPcUT已READY，已登录客户/产品/成员API均200、客户页面实际加载无错误。证据2026-10-25-online-test-deployment.md。

Task 1完整接入仍in_progress，Task 2及后续仍未勾选。在线基础共享站不等于完整业务平台；按既有计划继续共享主档/客户移交和订单，ZIP/Storage/业务SQL具体审批边界保持。

## 2026-10-25 完整共享实现及线上验收（进行中）

- 用户批准fflate0.8.3固定直接依赖，package/lock根声明已补；无升级其他依赖。
- Tasks1–11本地实体服务/API/统一界面已接通，追加10份业务SQL、私有文件/签名/PDF/退税导出；完整验收Task12进行中，不能把代码存在记为线上闭环完成。
- 最终实现基线58文件195测试通过，lint无error（原巡检2warning），build及构建后typecheck通过。独立只读复核发现的文档锁、领取竞争、DTO银行字段、完成状态、退税归类定位与ZIP恢复时间戳问题已修复；最后限定复核无新增明确高影响问题。
- 用户明确批准完整业务测试环境变更，业务迁移20261025013638_complete_shared_workstation_v1已成功应用；10源SQL从此冻结。业务库安全顾问无提醒；business_backend对39个应开放业务表空结果读通过、不可删审计/改快照正文，外部财务outbox维持42501拒绝。身份schema未改。
- 私有trade-private-files桶和独立BUSINESS_STORAGE_ADMIN_KEY已配置；首次60MiB桶受Free限额拒绝后收紧为50MiB，应用接口同步限制最终导出50MiB。未升级套餐，未显示密钥。审核清单docs/architecture/完整业务迁移审核.md。
- Vercel完整站dpl_JEJFUuukxQBUYcRfvRc6RawyZGYs READY，固定测试地址别名生效。8类业务读取200；客户/2供应商/2商品/跟进/销售确认及指派200，旧版本409/越权403。
- 用户单独批准docs/testing/云端虚构验收数据清单.md，创建2个SYNTHETIC E2E临时账号（sales/operations），无邮件，凭据仅本机忽略0600文件。实际以管理员浏览器和两个独立正常登录HTTP会话验收，未冒称三个隔离浏览器。
- 线上2个并发采购请求只成功1个，另1个QUANTITY_EXCEEDED；2币种采购/2到货/2批出运与三笔有效收付款成功，出运总额2485最小USD单位、各币种余额0；超到货/超出运/重复凭证拒绝，sales采购DTO为空，operations采购DTO银行字段为空。
- 线上虚构签名/客户附件分片及归档200，签名用途授权/绑定确认200。Vercel首次正式PI渲染返回FILE_NOT_READY、无file意图，问题未关闭；本机生产构建用同一虚构操作账号重放后已生成并归档该PI（200）。正在增加固定阶段安全诊断、定位Vercel环境差异，不能宣称线上PDF/ZIP验收完成。
- 临时测试账号尚在验收中，结束必须按授权停用这2个账号并验证新请求拒绝，不能忘记或停用原员工。

## 2026-10-25 最终预发验收完成（覆盖上节进行中状态）

状态：本期已确认业务模块本地实现和测试站接通完成；不是业务生产/税务/外部财务验收。

动作与实际结果：

- 最终发布 `dpl_GPLW1GiAtyJyKLeYzGvdqPdqUVbx` READY，固定入口 https://trade-workstation-test.vercel.app/workspace 。Vercel仍Hobby/basic，两个Supabase项目与独立用途角色保持分开，未升级付费或更改域名/MFA。
- PDF失败根因是Next NFT按import条件追踪PDFKit 0.20.1时漏带默认Helvetica.cjs及其共享glyph块。隔离真实追踪目录可复现MODULE_NOT_FOUND，API输出追踪包含standard-fonts/**/*.cjs后见绿。实际最终build NFT目录包含15个CJS所需文件，构造PDF通过；线上原PO任务重试200，后续CI/PL/SC实际渲染归档及下载全部200。早期签名PI由本机生产构建针对同一已批准虚构云端版本生成归档，随后通过线上固定文件下载；不把该一次渲染冒称Vercel首次成功。
- 最终60文件197测试通过（包含真实裁剪包运行、精确金额/数量、角色投影、命令重放、领取交错、文件恢复、签名撤权、税则修订一致性与虚构联合恢复）；lint无error，原巡检2warning保留；build、构建后typecheck、git diff --check通过。没有删除/跳过基线测试。
- 真实线上管理员浏览器＋2个独立正常密码登录HTTP测试会话执行72个已完成命令阶段、22个记录观察。临时凭据/Cookie仅本机忽略0600文件；原管理员浏览器MFA未搬出或绕过，不声称三个隔离浏览器会话。
- 业务库只读最终计数：主档5（客户1/供应商2/商品2）、完成销售订单1、移交草稿订单1、确认采购2、确认出运2、有效付款3（另有超额验证待确认流水被冲销保留）、正式归档文档8、归档导出3、停用测试签名1。
- 完整链路：虚构客户/跟进→2商品销售确认→指派运营/供应商授权→2供应商/币种采购→2到货→2批并发出运确认→销售与采购收付款→PI/PO/CI/PL/SC→签名与客户附件→退税CSV/检查PDF/ZIP→完成→客户移交。出运合计2485最小USD单位，各币种未收/未付0。
- 失败/权限路径：2个并发同量采购请求仅1个成功、另1个QUANTITY_EXCEEDED；超到货/超出运/超额收款确认/重复凭证/旧订单版本/旧移交预览拒绝；只读跟进修改403；销售无采购DTO、运营无公司银行字段，销售下载PO和签名原图403；完成订单取消出运被INVALID_TRANSITION拒绝。
- 退税资料保持缺件草稿，未伪造报关/发票/税务凭证；ZIP实际解压12项（9源文件＋目录/检查PDF/manifest），逐文件SHA256全部吻合；同请求导出返回原fileId，PI重复下载/生成及停用签名后PDF摘要不变。未执行真实报税、转账或外部财务同步。
- 实际已登录浏览器逐页检查dashboard/customers/catalog/suppliers/purchases/shipments/payments/documents/refunds/signatures/settings/audit，全部无alert；订单全部8页签可读取，390px页宽与文档宽均390。浏览器从真实单据表点击下载PI成功，SHA256与接口下载原归档一致。独立本地隔离界面还验证表单Escape/聚焦、默认销售价和提交失败提示。
- PI/PO/CI/PL各1页，SC2页，退税检查PDF2页：提取确认页脚/虚构来源/草稿标签并渲染PNG目视检查，无观察到的覆盖/丢字。产物保存在本机被忽略artifacts/e2e/，无真实个人资料。
- 最终身份只读核验：SYNTHETIC E2E员工2名、停用2名；停用后两原有效登录会话的新业务请求均403，原员工未修改。虚构签名素材停用，既有PDF仍可下载。未登录业务/管理/文件API均401。
- 最终业务安全顾问无提醒；anon不可USAGE业务schema、authenticated不可SELECT订单，私有桶public=false，file_size_limit=52428800。已存在测试对象的匿名public URL返回400，不泄漏文件。

证据与交付：docs/testing/完整系统测试手册.md、docs/testing/云端虚构验收数据清单.md、docs/architecture/完整业务迁移审核.md、docs/architecture/2026-10-25-pdf-runtime-packaging.md、docs/architecture/财务接口预留.md。10份已应用SQL摘要保持批准时内容，自此只追加修复。

未覆盖与限制：本地Auth/Storage模拟不冒充网络；联合恢复为虚构PGlite数据目录＋模拟私有对象恢复，未执行Supabase真实业务备份/恢复；未做长期负载、多公司真实流量、真实印章、专业电子签约、税务/会计总账/外部财务或业务生产发布。旧身份空业务表与混合角色未擅自清理。所有本轮具体审批均已执行，无等待输入的剩余审批；未来范围需新授权。

任务结论：Tasks1–11本期功能已接入；Task12本地及受控测试环境验收已按上述实际范围完成。主智能体未commit/push，巡检进程自动提交保持不动；当前目录HEAD/main只作本机交接索引，不伪造与CLI文件快照部署一一对应。
