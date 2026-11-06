# 2026-10-27 财务费用、成本与站内风险实施记录

## 范围与实际状态

用户要求费用申请、报销、订单成本与利润变化分析、业务流程风险和AI辅助提醒；随后选择DeepSeek与按角色／订单归属的站内通知。

已完成本地实现、真实私有角色PGlite集成测试、构建和隔离虚构UI验证；**本轮新增SQL未应用到云端，财务功能尚未发布，DeepSeek未启用、未配置真实密钥、未产生模型费用**。不把隔离UI与数据库分层验证描述为云端端到端验收。

设计和具体变更审核见 `docs/architecture/2026-10-27-财务费用与订单风险.md`；业务库追加SQL为 `scripts/sql/finance-expenses-costs.sql`。

## 代码与数据边界

- `src/modules/finance/`：金额规则、输入与DTO、费用、订单成本和风险页面。
- `src/server/finance/`：费用状态机、成本不可变快照、风险作用域、DeepSeek固定端点、预留与异常人工核对。
- 新页面：`/workspace/expenses`、`/workspace/costs`、`/workspace/risks`；现有business API增加对应读写命令，财务导航与顶栏提示接通。
- 沿用admin/sales/operations和原认证MFA；完整成本仅管理员，其他角色仅接收本人负责订单的脱敏风险；费用本人／管理员可见，不能审批自己的申请。
- 四张追加表：expense_claims、order_cost_plans、risk_reads、risk_ai_runs。无DELETE授权、无身份库改动、无新增依赖、无外部自动财务同步、无真实转账。
- 报销原始凭证目前按编号关联线下／已有资料，独立电子附件未接入；没有实现完整会计总账、员工借款备用金和税额核算。

## 关键回归与修正

1. 聚焦测试先出现缺少新模块的失败，然后实现规则与服务，恢复通过。
2. 补充发现：新增已确认费用低于原类别预算时，单纯max(人工预计,已确认)会掩盖增量。失败回归实测仍显示4000而预期不输出确定利润；加入confirmedCostHash后，确认成本变化要求重审。保存同时检查evidenceFingerprint，旧页面必须拒绝。管理员复核每类全量预计后才能恢复利润判断。
3. 缺成本、缺FX和未知基线不伪装为0成本。即使有未知项，已确认成本超过收入仍发高风险提示。
4. 批准报销与付款不重复叠加；已确认承诺与已付款金额分开；取消／冲销保留历史；同凭证重复提交拒绝；关联申请占用额度按公司锁事务校验。
5. AI请求先原子预留与认领，同请求重放不再调用；未知状态保留预留、不自动重试。同人同单有未决请求时阻止另起请求；管理员核对服务商记录后可关闭异常，但不释放已预留额度。回执私有保存，结果不进HTML。

## 最终验证

实际工作副本：`/private/tmp/siliantai-finance-work-20261027`。由原Git工作区真实文件复制并逐项hash核对，共592个初始文件；排除真实.env、凭据、私有附件、.git、缓存和旧artifacts。没有使用UI替身覆盖真实项目。

| 命令／检查 | 实际结果 | 临时日志 |
| --- | --- | --- |
| npm ci --ignore-scripts --offline | 从现有缓存恢复447包；无新增依赖 | /private/tmp/siliantai-finance-local-install.log |
| npm test -- --maxWorkers=2 | 73个测试文件、249项通过 | /private/tmp/siliantai-finance-final-tests.log |
| npm run build | Next webpack构建通过，包含三个新路由 | /private/tmp/siliantai-finance-final-build.log |
| npm run typecheck | 通过 | /private/tmp/siliantai-finance-final-types.log |
| npm run lint | 0错误，2项原有monitor脚本变量警告 | /private/tmp/siliantai-finance-final-lint.log |

新增测试：tests/finance-risk.test.ts、tests/deepseek-risk.test.ts、tests/business/finance.test.ts。覆盖JPY及多币种精度、实际差异、未知成本、申请额度、本人审批拒绝、有效跨公司拒绝、凭证重复、付款幂等及冲销、成本快照、风险已读隔离、确认成本变化重审、旧页面拒绝、AI预算及重放、未知与人工核对。

隔离UI使用 `/private/tmp/siliantai-finance-preview-20261027`，仅该目录的认证与API为虚构替身，独立于真实工作副本。已操作验证费用草稿保存、运费上涨后的负利润显示、风险标为已读、模型关闭时明确提示、未勾选核对确认时表单checkValidity=false、勾选后提交成功。它验证界面交互，不冒充真实DB或真实模型调用。初次点击因定时重渲染失效，检查当前页面后用语义定位重试成功。

## 磁盘中断与恢复

原卷 `/Volumes/数据` 两次断开，命令明确报Device not configured，均停止原目录写入，没有在缺失路径重建目录。首次重连发现末尾修改未落盘，按记录补齐；用户批准“可以复制”后，从原项目建立本机真实工作副本，在本机独立依赖上完成验证。临时预览副本不作为源码恢复依据。

同步规则：只写本轮变更，并与复制时原文件hash比较；发现用户另有修改则保留冲突，不整树覆盖。真实源码快照不含密钥或业务数据，不能替代数据库和Storage备份。

## 未覆盖及后续审核

- 自复核已完成；尚未提交／合并；独立人工审核、云端迁移、真实授权会话的财务闭环和实际模型质量评估仍待进行。
- 规则基于已录入数据，不能自动发现未录入的原料、运价和市场变化；不代替海关、税务、合同及会计专业判断。
- 站内采用轮询且按订单分页，浏览器关闭时不后台外发；没有建立定时任务、邮件或企微发送。
- DeepSeek实际启用须单独配置服务器密钥、核实模型及单价、批准硬上限并设置供应商侧额度；默认关闭、0预算，本轮没有真实API费用。
- 云端仅在审核具体追加SQL与原测试站发布后执行；回退应用时保留财务新表及审计，不删除记录当回滚。

## 用户最终决策

用户明确选择“先保留本地版本，暂不上线”。因此本轮不应用远程迁移、不发布测试站、不配置真实模型密钥或启用付费调用。249项回归与构建结果对应本地实现。源码快照：artifacts/backups/2026-10-27-finance-local/siliantai-finance-local-2026-10-27.zip，SHA256为dbbaa1febf23eb947b4d0cf1352bdef9613a2abbc3a880515e5226a3c8684bd5。快照创建于本条决策补记之前，仍标记LOCAL_VERIFIED_NOT_DEPLOYED；原包保持不可变。
