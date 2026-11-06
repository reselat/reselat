# RESELAT Assistant E0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可重复的本机虚构测试与可核验的上游证据，确定DSH、指定微信会话和PDF提取能否支持已确认的夜间接待设计。

**Architecture:** 在独立实验目录建立纯类型契约、模拟通道和证据判定器，不添加业务路由或云端数据库表。真实渠道验证单独受控执行；没有证据的能力保持unverified，不能由模拟测试升级为supported。

**Tech Stack:** 沿用TypeScript、Zod、Vitest；E0不安装DSH、OCR或微信客户端依赖，不启用真实模型。需要运行上游时先根据固定版本与权限审查形成单独可审阅步骤。

**Spec:** [已确认设计](../specs/2026-10-31-reselat-phase2-assistant-pilot-design.md)

## Global Constraints

- 作者与版权所有者：朱春茂；完整版RESELAT为基线，万捷副本不变。
- 首阶段默认模拟模型和测试资料，外部调用预算0，不读取或复制现有真实Key。
- 无真实客户外发；未明确同意的微信账号操作不执行。
- Bot不持有数据库管理连接、微信密钥、主加密密钥或讲师长期会话。
- 图片和语音不纳入自动回复；报价必须人工审核发布。
- 不修改现有AI任务枚举，不将现有1美元／日额度视为DSH额度。
- E0没有真实通道依赖时仍应能离线运行；真实验证未完成必须明确记录。

## Review Focus

- 模拟成功被误报为真实微信可用：Task 1判定器测试拒绝升级。
- 切换客户窗口／账号后误发：Task 2模拟器测试拒绝不同绑定。
- 发送超时后重试造成重复报价：Task 2测试保留unknown且拒绝重发。
- DSH隐藏记忆／压缩调用绕过预算：Task 3调用清单含未知路径时保持blocked。
- PDF跨行／扫描内容提取错价：Task 4逐字段比较和人工审核门槛测试。

---

## 文件边界与共同约定

新建 `experiments/assistant-e0/`，不接入Next.js运行链；测试放 `tests/assistant-e0/`。事实报告位于 `docs/research/2026-11-01-assistant-e0/`。不存聊天原文、账号凭据、真实客户PDF或未经审查的截图。

现有 `src/server/integrations/contracts.ts` 是旧接口预留，`src/server/ai/tasks.ts` 是已上线的确定性任务；仅作为边界参考，不在E0修改。实施开始先按using-git-worktrees技能建立隔离工作区，确认原HEAD和已有未跟踪文件。

### Task 1: 能力与证据契约

**Files:** Create `experiments/assistant-e0/evidence.ts`; Test `tests/assistant-e0/evidence.test.ts`。

**Interfaces:**
- `Capability = 'conversation_identity' | 'read_text' | 'send_text' | 'delivery_receipt' | 'human_takeover' | 'reconnect' | 'model_call_coverage' | 'pdf_extraction'`。
- `Evidence = {capability: Capability; environment: 'mock'|'real_test'; outcome: 'pass'|'fail'|'not_run'; reference: string; revision: string}`。
- Produces `assessCapability(items: Evidence[]): 'supported'|'unsupported'|'unverified'`。空集／只有mock／没有有效reference或revision均unverified；有效real_test的fail优先于pass，同一轮冲突证据不允许支持。新的上游版本用独立清单评估。

- [ ] Step 1: 在上述测试写断言：空集和mock/pass为unverified；real_test/pass含引用与版本为supported；混合pass/fail为unsupported；缺证据字段为unverified。
- [ ] Step 2: `npm test -- tests/assistant-e0/evidence.test.ts`，预期缺模块FAIL。
- [ ] Step 3: 实现上述类型与纯判定函数，不依赖环境变量或网络。
- [ ] Step 4: 重跑同命令，预期全部PASS。
- [ ] Step 5: 只暂存本任务文件，提交 `test: define assistant capability evidence gates`。

### Task 2: 可重复的虚构会话通道

**Files:** Create `experiments/assistant-e0/channel.ts`, `experiments/assistant-e0/mock-channel.ts`; Test `tests/assistant-e0/channel.test.ts`。

**Interfaces:**
- Consumes Task 1证据类型，模拟结果只标mock。
- Produces `Binding = {companyId:string; accountId:string; conversationId:string}`。
- `Message = {binding:Binding; externalId:string; text:string; occurredAt:string}`。
- `SendAttempt = {id:string; binding:Binding; takeoverVersion:number; text:string}`。
- `Receipt = {attemptId:string; state:'sent'|'rejected'|'unknown'; externalId?:string}`。
- `MockChannel` constructor(binding:Binding)，提供 `receive(message:Message): 'accepted'|'duplicate'|'rejected'`、`takeover():number`、`disconnect():void`、`reconnect(binding:Binding):boolean`、`send(attempt:SendAttempt):Promise<Receipt>`、`setNextOutcome(state:Receipt['state']):void`。
- 初始takeoverVersion=0；takeover递增且暂停发送，reconnect不解除暂停。此模拟器不实现自动恢复接待或生产持久化。

- [ ] Step 1: 写测试：同消息ID在相同绑定只接受一次；相同ID不同企业／账号／会话rejected；接管后旧version不能发送；断线拒绝发送；错误binding重连false；模拟unknown后相同attemptId重试返回原unknown，不产生第二次发送；sent重复请求返回原receipt。
- [ ] Step 2: `npm test -- tests/assistant-e0/channel.test.ts`，预期缺模块FAIL。
- [ ] Step 3: 实现内存模拟器与契约；记录每个attempt的第一次结果。明确注释不能用其内存去重替代E2持久化，也不能证明个人微信桌面接管原子性。
- [ ] Step 4: 重跑测试，预期PASS；Task 1验证mock结果仍unverified。
- [ ] Step 5: 只暂存本任务文件，提交 `test: add synthetic assistant channel probe`。

### Task 3: 固定DSH候选与全部模型调用路径

**Files:** Create `experiments/assistant-e0/model-coverage.ts`, `tests/assistant-e0/model-coverage.test.ts`, `docs/research/2026-11-01-assistant-e0/upstream.md`。

**Interfaces:**
- `CallPath = {name:string; sourceRef:string; status:'controlled'|'bypasses_gateway'|'unverified'}`。
- Produces `assessModelCoverage(paths:CallPath[], inventoryComplete:boolean):'eligible_for_scoped_trial'|'blocked'`。
- 必须覆盖 `reply`、`memory`、`compaction`、`background` 四项；上游不存在该功能时，需记录源码证据，仍以对应路径的controlled状态表示“已证明无调用”，不能省略。inventoryComplete必须true，所有路径需源码引用且controlled。

- [ ] Step 1: 写测试：缺background、unknown、bypasses_gateway、空sourceRef、inventoryComplete=false均blocked；完整控制清单eligible_for_scoped_trial。该状态不代表已批准付费调用。
- [ ] Step 2: `npm test -- tests/assistant-e0/model-coverage.test.ts`，预期FAIL。
- [ ] Step 3: 实现纯判定器。
- [ ] Step 4: 只读核对候选官方 `deepseek-ai/deepseek-harness` 和社区 `Fei2411/DS-Bot` 的仓库关系、LICENSE、精确commit、插件接口、所有模型调用入口、工具／目录权限、停机方法。候选身份尚未用户点名确认；记录选择依据，不把社区插件标官方产品。只做源码研究，不下载执行安装脚本、不授予桌面权限。无法验证内容标unverified。
- [ ] Step 5: 重跑测试PASS；文档逐项给出固定版本的永久源码链接与核对日期。列出哪些未知需要运行探针，不用文档声称替代实测。
- [ ] Step 6: 只暂存任务文件，提交 `docs: pin assistant runtime research and call coverage`。

### Task 4: PDF价格提取验证与审核门槛

**Files:** Create `experiments/assistant-e0/quote-probe.ts`, `tests/assistant-e0/quote-probe.test.ts`, `tests/assistant-e0/fixtures/quote-expected.json`, `docs/research/2026-11-01-assistant-e0/pdf.md`。

**Interfaces:**
- `QuoteCandidate = {product:string; specification:string; unitPrice:string; currency:string; unit:string; page:number; conditions:string; sourceVersion:string}`。
- Produces `compareQuote(actual:QuoteCandidate[], expected:QuoteCandidate[]): {exact:boolean; differences:string[]; publishable:false}`。
- 金额按字符串保留精确十进制；E0永远不可发布，exact仅表示抽取与人工基准相符。引擎输出只进入候选，不调用现有业务写入接口。

- [ ] Step 1: 建立虚构基准（USD 12.30/kg、USD 0.10/pc两个不同产品），写测试：完整相同exact=true但publishable=false；错页、币种互换、单位互换、产品跨行错配、漏条件、少行、重复行均exact=false。顺序可不同，通过完整字段匹配比对，不按数组位置误判。
- [ ] Step 2: `npm test -- tests/assistant-e0/quote-probe.test.ts`，预期FAIL。
- [ ] Step 3: 实现比较器和差异列表，差异仅测试资料；不做浮点价格转换。
- [ ] Step 4: 研究当前机器可用提取工具，核对工具版本和许可。无工具时记录未运行而不安装；文本PDF与扫描PDF分别记录。未来取得企业PDF需另行同意资料范围，先用虚构样本。当前不能验证扫描准确率时不宣称支持OCR。
- [ ] Step 5: 重跑测试PASS；在pdf.md记录工具候选、样本类型、逐字段结果和未验证项，不以比较器测试代替PDF抽取实测。
- [ ] Step 6: 只暂存任务文件，提交 `test: add quote extraction comparison and review gate`。

### Task 5: 微信实测脚本说明与E0结论

**Files:** Create `docs/research/2026-11-01-assistant-e0/wechat-runbook.md`, `docs/research/2026-11-01-assistant-e0/REPORT.md`。

**Interfaces:** Consumes Tasks 1—4；报告每项Evidence、状态、阻断原因和下一步，不产生产品API。

- [ ] Step 1: 写人工实测流程：由用户确认测试账号及虚构会话→记录本机系统／客户端版本→绑定测试会话→读取唯一标记文字→经明确同意发送一次虚构回复→核对客户端可见结果／稳定消息标识→发送中人工接管→切换窗口／账号→断线重连→重复事件／回执超时。每步注明预期、实际、证据和清理退出方式。
- [ ] Step 2: 无当前账号控制及测试发送授权时，不执行真实步骤，所有相应能力为unverified；不以用户对未来自动回复的产品需求代替当前测试授权。若用户批准，先复核适用浏览器／桌面技能及采集器范围，发现依赖安装、系统权限变更或账号风险时提交具体步骤再执行。
- [ ] Step 3: 汇总报告：DSH候选及版本、许可、全部调用路径、PDF实测覆盖、微信证据矩阵、支持／阻断项。E0离线工件完成与真实能力验证完成分别列状态；unknown回执不重发。任一发送身份／接管／回执关键门槛未通过时，实际渠道维持只读／草稿，不称自动接待验收成功。
- [ ] Step 4: `npm test -- tests/assistant-e0` 全部PASS；`npm run typecheck`与`npm run lint`检查新增代码；最终`npm test`确认既有功能未回归。原有警告与新增错误分别记录，不伪造测试总数。
- [ ] Step 5: 只暂存报告文件，提交 `docs: report assistant E0 evidence and next gates`；交付E1/E2后续计划所需决策，不自动部署或启用真实调用。

## 自检与交接

本计划仅覆盖设计E0；业务日历／发送持久化／报价发布／临时授权／安装恢复由路线表后续子项目覆盖，不在模拟器中偷做生产实现。类型名与Task引用一致；Review Focus五项分别落到Tasks 1—4。实际微信实验可能需用户协助，不影响离线工件验证，但影响E3是否允许启用真实通道。

计划待用户审阅并选择执行方式后开始。建议Native完成小规模E0工件和研究，再独立复核；需要逐任务独立实施与审查时可选择Subagent-driven。
