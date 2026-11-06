# 完整共享外贸工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Implement task-by-task in this session, with one final independent readonly review. Track completion against evidence, not code presence.

**Goal:** 让用户以管理员、业务员、运营完成从客户和产品到采购出运、合同单据、收付款及退税资料包的共享系统测试。

**Architecture:** 保留双独立数据库及现有Auth/MFA/成员管理，业务实体和约束只放独立业务库；所有页面经受权API访问。新增按实体划分的事务仓储、作用域服务和私有文件适配器，复用精确金额和PDF渲染；逐项替代本机demo行为，不上传整份Workspace JSON。

**Tech Stack:** 现有Next.js/React/TypeScript/zod/postgres/React-PDF/Supabase/Vitest/PGlite；拟将现有间接fflate 0.8.3 MIT固定提升为直接依赖，仅用于ZIP，安装前单独获批。

**Spec:** docs/superpowers/specs/2026-10-24-complete-shared-workstation-design.md，用户已确认，包括运营指派采购/出运权限扩展。

## Global Constraints

- 单公司自营采购出口，先有销售订单再采购；角色仅admin/sales/operations，无finance、会计总账、自动报关/退税或专业CA签约。
- 身份库不新增业务数据；业务库不镜像实时角色/密码，不建跨库员工外键。新关联通过身份库确认有效员工，保留历史UUID。
- 正式工作区/workspace统一入口；/demo是隔离本机历史区，不自动导入、不作为完整共享功能入口。
- 数量/单价四位定点NUMERIC(24,4)，金额最小单位整数NUMERIC(38,0)，JSON为字符串；服务端精度范围校验。币种USD/CNY/EUR/GBP/HKD/JPY按现有currencyScale，不合并异币金额。
- 所有业务读写带company_id及scope；管理员敏感API仍需MFA/有效会话。已通过鉴权的跨库在途操作不能承诺立即撤回。
- 业务写、版本、数量预留/分配/释放、业务审计同事务。正式文档/文件不覆盖、不随主档或签名变化重渲染。
- 文件PDF/PNG/JPEG≤10MiB，签名PNG/JPEG≤2MiB；ZIP原始文件总量≤50MiB且≤100文件。无SVG/HTML或可执行附件；文件检查不等于真伪鉴定/病毒扫描。
- 新业务Storage secret仅本机隐藏配置，不能复用身份secret、不能暴露浏览器。云端迁移/桶/测试资料及ZIP直接依赖分别审阅批准；不发邮件、不付费、不部署生产、不删除历史。
- 无Git仓库，不初始化/提交；已应用迁移冻结，只追加。Native执行方式已确定，不重新询问；最终独立评审只读、不读.env或真实个人信息。

## Review Focus

- 多批采购/到货/出运并发：同销售行和来源不能被重复占用，取消也不能重复释放（Tasks 4–5）。
- 客户移交后旧页面仍开着：新请求拒绝，关联未完成订单同步移交，不能让共享只读用户编辑（Tasks 2–3）。
- 正式单据生成期间主档/印章变更：固定确认快照与授权，返回同版字节，不新增盖章使用（Tasks 8–9）。
- Storage上传成功而数据库确认失败：不能把未知结果当未上传、重复覆盖或删除用户文件（Task 7）。
- ZIP中有敏感采购凭证、缺件或超限：逐文件授权，整包拒绝/明确缺件，不能只在列表隐藏（Task 10）。

## 文件与接口约定

新增业务服务src/server/business/，schema/纯逻辑src/modules/business/，界面src/modules/business/ui/；保留src/modules/workspace为隔离demo，不把其useWorkspace接入真实共享状态。

- BusinessActor使用既有Employee；ScopeContext={companyId,userId,role,version,aal}，服务器产生，客户端不能提交替代。
- MoneyMinor/Decimal是校验过的十进制字符串；UUID在所有新增持久化ID校验中强制。DTO按角色显式投影。
- 所有命令都有requestId UUID；现有实体修改含expectedVersion；统一响应{ok,code,data?}，已提交结果未知用专门状态，不宣告回滚。
- 分页{items,nextCursor?,total?}，默认50；筛选参数白名单，SQL参数化；禁止任意表名/字段更新接口。
- DB事务类型复用postgres.TransactionSql；每任务公开业务函数接收actor，函数内部执行scope校验，不让路由遗漏权限。

### Task 1: 业务授权、事务及基础schema

**Files:** 新建src/server/business/{access,commands,errors}.ts、src/modules/business/{schemas,types}.ts、scripts/sql/complete-business-foundation.sql、tests/business/{access,commands,schema}.test.ts；修改src/server/workspace/records.ts、相关路由的角色DTO复用边界。

**Interfaces:** authorizeBusiness(actor,resource,action):Promise<void>；runBusinessCommand(actor,{requestId,kind,payload},handler):Promise<CommandResult>；assertPrecision(value,kind:'quantity'|'price'|'minor'):string。命令追踪仅存安全hash/对象ID/状态，不存密码、附件正文或完整个人资料。

- [ ] 先写拒绝测试：跨公司、停用/归档/身份故障、客户share只读、未指派运营、采购敏感字段；相同requestId不同载荷拒绝、同载荷重放同结果。
- [ ] 执行npx vitest run tests/business/access.test.ts tests/business/commands.test.ts，确认缺实现见红。
- [ ] 编写业务基础追加SQL：命令幂等表、受锁编号计数器、客户访问关系扩展及角色相关业务scope字段；所有业务表私有，角色不持久化到业务表。
- [ ] 实现服务端fresh身份检查、作用域和固定错误分类；事务内业务scope重读/版本校验。HTTP适配统一sameOrigin、request body大小和no-store，不输出原始异常。
- [ ] 用独立PGlite实例验证角色最小权限、命令冲突/重放、事务回滚和跨公司拒绝；定向测试通过。后续每份迁移也加入schema测试，而非等云端才发现权限错误。

### Task 2: 主档、跟进、客户分配共享和移交

**Files:** 新建src/server/business/{parties,catalog,followups,customer-access,company}.ts、src/app/api/workspace/{followups,customer-access,settings}/route.ts、scripts/sql/shared-master-data.sql、tests/business/{masters,customer-transfer}.test.ts；升级现有records API及src/modules/account/records.tsx替代入口。

**Interfaces:** saveParty/saveProduct(actor,input)；addFollowup(actor,{customerId,date,note,nextDate,expectedVersion,requestId})；previewCustomerTransfer(actor,{customerId,targetUserId}) -> 客户/跟进/未完结订单清单及version；transferCustomer(actor,{previewVersion,targetUserId,requestId})；setCustomerShare(actor,{customerId,userId,enabled,expectedVersion,requestId})。新增员工关联必须assertActiveCompanyMember；公司商业资料仅业务库。

- [ ] 写失败测试：无效/跨公司目标员工、share只读越权、旧移交预览、无权跟进、产品采购字段泄漏、未复核HS标已审核拒绝。
- [ ] 执行npx vitest run tests/business/masters.test.ts tests/business/customer-transfer.test.ts确认见红。
- [ ] 实现主档分页/搜索/版本、跟进时间线和到期待办；产品完整HS字段及管理员复核，运营只能编辑草稿。旧版产品快照不反向变化。
- [ ] 实现移交事务：更新客户owner/共享，关联未完成订单跟随移交（Task 3表落地后补联调），保留created_by；已完结订单显式只读授权，不暗改历史。无订单表时本地服务不得静默跳过，在Task 3集成后才勾选整项完成。
- [ ] 创建管理员“分配/共享/移交”可视化面板、预览和确认，失败可重试且不丢非敏感输入。定向测试通过；银行信息及采购默认值只对获权DTO返回。

### Task 3: 销售订单与统一订单详情

**Files:** 新建scripts/sql/shared-sales-orders.sql、src/server/business/{orders,order-snapshots}.ts、src/modules/business/{order-schema,order-state}.ts、src/app/api/workspace/orders/route.ts、orders/[id]/route.ts、orders/[id]/actions/route.ts、tests/business/orders.test.ts；新建/workspace/orders及详情/新建页面。

**Interfaces:** createOrder(actor,OrderDraftCommand)；updateOrder(actor,{id,expectedVersion,...})；transitionOrder(actor,{id,action:'submit'|'confirm'|'cancel'|'complete'|'revise',expectedVersion,reason?,requestId})；getOrderDetail(actor,id) -> role-filtered header/lines/workflow summaries。

- [ ] 写失败测试：业务员建单无需成本/供应商、金额伪造重算、旧版本、共享客户只读不可建单、已确认覆盖/越权确认拒绝；管理员确认冻结公司/客户/产品/HS。
- [ ] 执行npx vitest run tests/business/orders.test.ts确认见红。
- [ ] 追加orders/order_versions/order_lines及操作版本引用；company/owner/operation assignee等范围字段明确。编号由受锁计数器生成，不用数组长度。金额使用现有domain函数并检查精度。
- [ ] 实现草稿/待确认/已确认/履约/完成/取消；变更以新版本冻结，已有后续操作时约束拦截。列表和详情不聚合整库Workspace。
- [ ] 联调客户移交：确认未完结订单跟随移交、旧业务员下一请求拒绝；scope与版本测试通过。采购、出运等页签在对应任务实现前不冒充已完成。

### Task 4: 采购拆分、确认和到货

**Files:** 新建scripts/sql/shared-procurement.sql、src/server/business/{purchases,receipts}.ts、src/app/api/workspace/purchases/{route.ts,[id]/actions/route.ts}、receipts/route.ts、tests/business/procurement.test.ts、采购列表/详情及订单采购页签组件。

**Interfaces:** createPurchases(actor,{orderId,orderVersion,groups:[{supplierId,currency,lines:[{orderLineId,quantity,unitCost}]}],requestId})；confirmPurchase(actor,{id,expectedVersion,requestId})；recordReceipt(actor,{purchaseId,lines:[{purchaseLineId,quantity}],requestId})。

- [ ] 写失败测试：拆成两供应商/币种、同销售行累计超采购、重复提交、超到货、指派运营范围、业务员请求采购成本、取消重复释放。
- [ ] 执行npx vitest run tests/business/procurement.test.ts确认见红。
- [ ] 追加purchase_orders/lines、销售采购分配、receipts/receipt_lines；稳定关联销售来源，供应商/商品商业信息冻结。事务按稳定顺序锁销售行和采购行，预留/确认/取消同审计事务。
- [ ] 实现草稿、提交、管理员确认、到货进度和取消限制；运营可看指派订单具体采购成本，不开放全公司采购默认值。
- [ ] 两连接并发重复占用/超量回归；本地无真实TCP数据库时PGlite验证约束/事务并明确并发实测限制，不用mock宣称多连接已通过。

### Task 5: 分批出运及来源分配

**Files:** 新建scripts/sql/shared-shipments.sql、src/server/business/{shipments,allocations}.ts、src/app/api/workspace/shipments/{route.ts,[id]/actions/route.ts}、tests/business/shipments.test.ts、出运/装箱组件。

**Interfaces:** createShipment(actor,{orderId,lines:[{orderLineId,quantity,sources:[{receiptLineId,quantity}],packages,netKg,grossKg,cbm,marks,dimensions}],ports,transport,requestId})；confirmShipment/cancelShipment(actor,{id,expectedVersion,reason?,requestId})。

- [ ] 写失败测试：无到货来源、来源属于另一销售行/公司、跨来源重复分配、累计超销售量/到货量、毛重小于净重、两批金额舍入和取消二次释放。
- [ ] 执行npx vitest run tests/business/shipments.test.ts确认见红。
- [ ] 追加shipments/lines/source_allocations，所有量正数约束；事务锁源到货/销售行按统一顺序，确认占用，取消精确释放并记审计。
- [ ] 正式CI/PL已经生成时，取消需先作废关联版本，保留原文件；不因取消而删单据。实现订单出运页签、独立出运列表和可用量选择。
- [ ] 采购→到货→两批出运→取消/重放本地数据库闭环验证，数量汇总与明细一致。

### Task 6: 业务收付款、首页与业务审计

**Files:** 新建scripts/sql/shared-payments.sql、src/server/business/{payments,dashboard,business-audit}.ts、src/app/api/workspace/{payments,dashboard,audit}/route.ts、tests/business/{payments,dashboard}.test.ts、工作台/收付款UI。

**Interfaces:** submitPayment(actor,{kind:'sale'|'purchase',refId,amount,currency,date,reference,note,requestId})；confirmPayment/voidPayment(actor,{id,expectedVersion,reason?,requestId})；getDashboard(actor,today) -> 分币种应收/应付/逾期及范围内待办。

- [ ] 写失败测试：待确认不入已收、超额、币种不符、银行参考号重复、并发确认/冲销、无权看应付或公司银行信息、金额边界。
- [ ] 执行npx vitest run tests/business/payments.test.ts tests/business/dashboard.test.ts确认见红。
- [ ] 追加payments/payment_events，销售/采购引用采用明确外键或唯一可校验分支约束，不用任意type/id孤立引用。锁对应订单/采购计算有效余额，冲销追加事件不删除。
- [ ] 按角色范围计算首页欠款、到期跟进、待确认/采购/出运/缺件，所有数字来自数据库而非当前列表页；订单详情同步收付款。
- [ ] 输出外部财务API字段、鉴权、幂等/冲销/对账契约，outbox保持disabled，不发送第三方数据或提供假连接按钮；定向测试通过。

### Task 7: 私有文件上传、下载与失败恢复

**Files:** 新建scripts/sql/private-business-files.sql、src/server/files/{storage,upload,download,file-validation}.ts、src/modules/business/file-schema.ts、src/app/api/workspace/files/{route.ts,[id]/route.ts}、tests/files/{validation,authorization,recovery}.test.ts、订单附件UI及scripts/configure-business-storage.mjs。

**Interfaces:** createUploadIntent(actor,{orderId,category,name,size,mime,requestId}) -> intentId；uploadAndConfirm(actor,intentId,bytes)；downloadFile(actor,fileId):Promise<{bytes,mime,downloadName}>。BusinessStorage接口仅upload/download/stat，不让调用者传任意桶/路径；实现用BUSINESS_STORAGE_ADMIN_KEY和实际业务项目URL，不能用身份key。

- [ ] 写失败测试：跨公司/无权订单、采购敏感附件对sales、MIME/文件头不符、超限、路径穿越、重复关联、上传成功但DB确认失败、未知上传结果重试不覆盖。
- [ ] 执行npx vitest run tests/files/validation.test.ts tests/files/authorization.test.ts tests/files/recovery.test.ts确认见红。
- [ ] 追加file_assets/upload_intents及订单/单据受约束关联表，记录真实大小/hash/category/state。私有路径companyUUID/intentUUID，不信客户端路径；确认前内容/元数据核验。
- [ ] 后端代理multipart上传/受权下载，attachment/nosniff/no-store，不向普通员工给签名原图。意图失败状态和核对入口完整，不自动删除“补偿”真实对象。
- [ ] 隐藏配置脚本固定业务ref wjrwqkduohqpqzigmhys，与现有.env.config.lock共用，0600原子合并，不输出key、不创建bucket。真实私有桶及key由最终云端审批/用户本机操作完成。
- [ ] 本地文件适配器故障注入见绿；真实Storage行为须获批后另记，不能声称mock等于云端私有下载验收。

### Task 8: 合同/PI/PO/CI/PL共享快照与PDF

**Files:** 新建scripts/sql/shared-documents.sql、src/server/documents/{snapshots,service,jobs}.ts、src/modules/business/document-schema.ts、src/app/api/workspace/documents/{route.ts,[id]/route.ts,[id]/confirm/route.ts,[id]/download/route.ts}、tests/documents/{snapshots,jobs,access}.test.ts；修改src/templates/trade.tsx增加草稿/版次标识，保留原demo兼容。

**Interfaces:** createDocumentDraft(actor,{type,sourceId,terms?,requestId})；confirmDocument(actor,{documentId,expectedVersion,signatureUsageIntentId?,requestId})；renderDocumentVersion(actor,versionId) -> pending|rendering|stored|needs_reconciliation；downloadDocument(actor,id)读取固定已存字节。

- [ ] 写失败测试：任意JSON不能变正式单据、来源未确认/装箱缺失、业务员PO权限、改主档后历史不变、同幂等键不同版本、PDF成功但上传/完成状态失败。
- [ ] 执行npx vitest run tests/documents/snapshots.test.ts tests/documents/jobs.test.ts tests/documents/access.test.ts确认见红。
- [ ] 追加documents/versions/generation_jobs；确认时从服务端业务来源投影并冻结金额/条款/模板/人员版本，唯一正式编号。草稿水印、正式版次、作废和更正关联清晰。
- [ ] 复用renderTradeDocument和字体，SC编辑既有合同条款，PI订单来源/PO采购来源/CI和PL批次来源；构建适配器不读取整库Workspace。正式PO采购条款必填，不输出“待确认”当正式字段。
- [ ] 持久化生成意图、受控领取/重试状态与hash；上传路径按versionId不可覆盖，生成重复返回同版。旧文件下载不重渲染，Storage异常进入可恢复核对。
- [ ] 本地生成中英文/长描述/50行多页/页码表头/合计/箱重体积样本，渲染为图片检查，检查PDF字段/字节稳定性；布局验收不只用语法通过代替。

### Task 9: 签名印章图片、授权和使用记录

**Files:** 新建scripts/sql/controlled-signatures.sql、src/server/documents/{signatures,signature-usage}.ts、src/app/api/workspace/signatures/{route.ts,[id]/route.ts}、tests/documents/signatures.test.ts、公司签名设置与单据确认面板；在模板固定位置嵌图。

**Interfaces:** uploadSignature(actor,{name,bytes})；grantSignature(actor,{assetId,userId,purpose,enabled,expectedVersion,requestId})；prepareSignatureUsage(actor,{assetId,documentVersionId,requestId})；confirmDocument绑定usage intent，不允许复用到另一单据版本。

- [ ] 写失败测试：非管理员上传/授权、跨公司资产、停用资产/员工、无用途授权、2MiB边界、原图下载、重复生成重复盖章、授权后单据变更。
- [ ] 执行npx vitest run tests/documents/signatures.test.ts确认见红。
- [ ] 新表按资产/授权/用途意图/使用分开；数据库确认冻结图像hash与使用记录，文件渲染重试不消耗新授权。签名素材经专用受控服务读取，不复用普通附件权限。
- [ ] 单据确认显式选择图片和确认，模板只接受内部已核验字节，不接受外部URL；停用不改变已存PDF。页面准确显示“已加盖图片”，保留客户签署件作为独立附件，不标为专业电子签约。
- [ ] 定向测试及虚构签名渲染核验通过，真实公司印章不用于自动测试。

### Task 10: 退税资料复核、目录、检查PDF和ZIP

**Files:** 新建scripts/sql/refund-preparation.sql、src/server/refunds/{checklist,checks,exports}.ts、src/app/api/workspace/refunds/{route.ts,[orderId]/export/route.ts}、tests/refunds/{readiness,export}.test.ts、退税工作区；需批准后修改package.json/package-lock.json固定fflate 0.8.3直接依赖。

**Interfaces:** reviewRefundItem(actor,{orderId,key,status,linkedFileIds,reference,reason,expectedVersion,requestId})；getRefundReadiness(actor,orderId)；exportRefundPack(actor,{orderId,format:'csv'|'pdf'|'zip',requestId}) -> fixed artifact metadata。

- [ ] ZIP依赖改动前展示fflate已安装0.8.3/MIT、固定直接依赖及锁文件差异，无付费；未批准前完成其他任务与ZIP接口/测试，不从隐式间接依赖导入或伪造ZIP。
- [ ] 写失败测试：无文件不能标归档、未复核HS、采购/出运/CI/PL来源不一致、不适用无理由/未管理员确认、CSV公式注入、ZIP文件名穿越、越权/敏感文件、100文件/50MiB边界、缺件包冒充完整。
- [ ] 执行npx vitest run tests/refunds/readiness.test.ts tests/refunds/export.test.ts确认见红。
- [ ] 追加清单/复核/导出任务，保留现7类默认清单并可维护适用性；目录、检查PDF和ZIP都按服务端来源生成，缺件版本明确标草稿。
- [ ] ZIP逐文件复核授权/字节/hash，包含目录、检查表及文件清单摘要；任何文件失败不偷偷漏掉后返回成功。文件总量上限在读取正文前根据已验证元数据预检，并实际累计核对。
- [ ] 解压虚构包核对文件数量/名称/摘要及PDF内容，本地测试通过；不生成虚假报关/提单/税务凭证，不自动报税。

### Task 11: 统一业务工作台与全部交互联调

**Files:** 新建src/modules/business/ui/{shell,navigation,dashboard,customers,catalog,suppliers,orders,order-detail,purchases,shipments,payments,documents,files,refunds,settings}.tsx及分模块CSS/表单；修改src/app/workspace/{layout,page}.tsx、customers/catalog既有页；新增suppliers/orders/orders/[id]/orders/new/purchases/purchases/[id]/shipments/payments/documents/refunds/settings页；更新登录后入口与admin返回链接。

- [ ] 先读已确认设计与UI Operate质量规则，复用admin视觉token；不重做一套不一致的管理导航。
- [ ] 写界面纯逻辑/服务契约测试：角色菜单与操作、只读共享、订单状态按钮、空/错/冲突、防重复提交及分页；不把固定截图字符串当端到端证明。
- [ ] 将Tasks 2–10组件接入真实API，所有列表自动加载，表单明确必填、确认及安全错误；详情各页签都有真正数据操作，无“稍后开发”按钮。局部状态可在浏览器，持久业务不得写localStorage。
- [ ] 一次登录进入/workspace；业务员无管理入口，管理员可往返/admin；运营只见指派履约资料，直访/导出仍由服务器拒绝。
- [ ] 使用隔离虚构适配器先做桌面/390窄屏集中检查、键盘/抽屉/横向表格/长字段验证；至多一轮集中修正复查。验收用临时模拟页面从最终构建移除，不让模拟绕过真实接口。
- [ ] 将原demo完整标识留在/demo，无正式导航误连它；不自动搬本机数据。

### Task 12: 完整验收、联合恢复、云端受控应用

**Files:** 新建docs/testing/完整系统测试手册.md、docs/architecture/完整业务迁移审核.md、scripts/test-fixture-workflow.mjs、scripts/backup-business-test.mjs、tests/business/full-workflow.test.ts及恢复测试、本轮聚合evidence与PROJECT_CONTEXT补记。

- [ ] 写并运行完整本地双库SQL流程：虚构公司/管理员/销售/运营→客户分配→销售确认→两供应商采购→到货→两批出运→文档/签名→收付款→附件/退税包→移交/停用。所有金额、数量、摘要、DTO/导出拒绝逐项断言；Auth/Storage模拟明确标注，不冒充网络实测。
- [ ] 虚构联合备份/恢复演练涵盖数据库、文件、关联/hash和可下载性，不导出身份密码hash/secret；恢复到隔离实例，记录实际结果与限制。
- [ ] 执行npm test、npm run lint、npm run build、npm run typecheck（构建后顺序运行）；保留153测试基线。任务内先红后绿，全量仅在有代码变更或新失败时重跑，不为数字制造测试。
- [ ] 最终独立只读复核本轮完整权限、数量/资金、SQL、文件/签名和跨服务恢复；登记只读范围，不读.env/真实用户资料。Important先补失败用例再修，不能以作者自测代替独立复核。
- [ ] 展示按编号排列的全部最终追加SQL、最小角色授权、业务Storage私有桶、回滚及配额限制，一次申请本轮现有测试项目应用；身份旧业务空表/旧混合角色删除不在范围。获批后只追加应用并真实低权限核验，冻结已应用SQL。
- [ ] 用户在本机隐藏配置业务Storage key；配置脚本只写本机配置不自动上传。检查私有桶/匿名拒绝/完整文件下载，密钥不进浏览器/聊天/日志。
- [ ] 提供显式虚构云端测试数据清单（测试邮箱/账号由用户选择且不贴聊天），单独获批后创建/写入；全程不发邮件、不用真实公司印章/客户凭证，不擅自清理测试账号或数据。
- [ ] 验收三身份真实浏览器完整闭环，管理员与业务员两个会话旧版本冲突、重复金额/数量拒绝、停用后新请求拒绝；记录预发实测范围，未做的项目单列。
- [ ] 测试手册逐步写用户预期结果、角色/数据准备和已知限制；全部本期业务模块接通后才邀请完整系统测试。外部财务适配器disabled、真实税务/生产上线不冒充本轮验收。

## 本轮执行与审批顺序

沿用此前确认的Native，由当前智能体连续实施，最后一次独立复核。先审阅本实施计划；开始后不在普通任务间反复询问是否继续。

有三类明确审批点：fflate固定直接依赖、最终云端SQL/私有桶及权限、具体虚构云端测试数据。服务端Storage secret由用户本机隐藏输入。其他本地范围内代码/测试/文档持续自主完成。上一次对分库SQL的批准不延伸为这次尚不存在的业务SQL批准。
