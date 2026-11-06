# 在线测试站部署与当前故障

日期：2026-10-25（Asia/Shanghai）。用户明确要求部署上线进行测试，随后在浏览器完成Vercel登录及工作台登录/MFA。使用独立测试项目的production槽位提供固定测试地址，不等于真实业务生产验收。

## 已执行

- 当前Vercel账号下新建`trade-workstation-test`，project ID `prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9`；Node 24.x、Next.js、Singapore sin1、basic构建机，保留默认Deployment Protection。未升级套餐或启用付费附加项。
- 固定测试地址：https://trade-workstation-test.vercel.app 。沿用身份与业务两个独立Supabase测试项目，没有新建/重置账号、MFA、角色、数据库或应用新SQL。
- CLI 65.2.0通过用户已登录浏览器完成device授权。CLI link追加本机忽略配置中的OIDC变量，核实原有必需配置仍存在、文件权限0600；未输出任何凭据。
- 云端9项变量通过本机直接传输配置，三项服务端变量已核实为`sensitive`：IDENTITY_DATABASE_URL、BUSINESS_DATABASE_URL、SUPABASE_AUTH_ADMIN_KEY。其余为公开登录配置、公司UUID、项目ref和固定APP_ORIGIN。浏览器公开key未替换为secret。
- 上传前dry-run确认140个普通文件中无.env、Git、开发目录、业务样本或文档。进一步排除开发目录及未使用变量字体，仅保留实际PDF字体与公开CA。没有把.env作为源码上传。
- 首次部署`dpl_Bzf7W97VAxBSCY18ShA95ySFYPiT`：READY，构建1m8s；诊断补丁部署`dpl_3YF6fU8oE19dGz9NPSCBg7fP1LAU`：READY，构建58s，已关联上述固定测试地址。

## 实际验证与发现

- 浏览器实际渲染中文登录页；用户报告成功登录并完成MFA。已登录成员API `/api/admin/employees` 返回200。
- 未登录管理API及共享records API均返回401/UNAUTHENTICATED，no-store；未关闭鉴权、MFA、Vercel保护或TLS。
- **未关闭故障**：使用已登录会话读取客户/产品共享records API均返回400/REQUEST_FAILED。不能宣称业务读写或双库在线闭环已通过。
- 只读目录核验业务库所需列存在，business_backend具有business_records/record_shares/company_profiles读取权限，业务表无RLS策略；没有通过扩权修复问题。
- 本机6543连接探针和原5432查询探针均超时，仅说明本机探针没有取得结果。线上身份读取成功，不把本机超时直接推断为云端根因。
- 安全诊断补丁仅记录固定event/location、生成requestId、白名单SQLSTATE/网络码及固定错误类型，不记录SQL、请求正文、参数、邮箱或密钥；客户端继续固定安全错误响应。新增测试先失败后通过。
- 本地53文件172测试通过，lint、build、构建后typecheck通过。日志见2026-10-25-online-*.log及diagnostics-{red,green}.log。仅此本地结果不替代上述线上失败。

## 当前定位限制与下一动作

诊断时执行环境时间较已复现请求前移约8小时；最近时间窗口无记录，而Hobby日志接口明确拒绝超出保留期的旧请求查询。原浏览器TaskSpace已消失，未另建空间绕过用户控制。已请用户打开/workspace/customers并点击“加载 / 刷新资料”，以产生可用的新安全错误码；不索取登录密码或业务正文。

当前线上共享范围只有成员管理及客户/产品基础入口，完整共享订单、采购、出运、收付款、单据/附件/退税包仍未实现。`/demo`为浏览器本机资料试用，不能作为多人共享业务平台交付；其本机PDF接口在production禁用，不能以在线demo替代正式单据验收。

下一动作：从用户新触发的共享客户请求取得安全错误码，定位并修复线上故障，再验证客户/产品读取。现有两个部署可以保留作故障对照；如需要回滚，只将测试项目固定地址切回已验证部署，不删数据库或文件。由于首版也有同一业务读取故障，回滚首版不能声称已修复。

## 故障已关闭：生产压缩改变SQL tag调用顺序

用户随后明确允许重新打开测试站自动复测，新TaskSpace 5复用了已有登录状态。安全日志确认最新失败为TypeError/NOT_A_FUNCTION。

实际生产产物将源代码`await (await businessDatabase())`后的SQL tag输出为`await await businessDatabase()`后的SQL tag，导致Promise被当函数调用。使用当前Next的loadBindings/minify，虚构最小async accessor能够稳定复现同一TypeError；不能将此归因于数据库授权或密码。

修复三处：records API GET、共享服务listRecords/getCompany，均先`const db=await businessDatabase()`，再`await db`调用SQL tag。没有修改SQL、身份复核、MFA、公司范围、角色投影或云端权限。`.begin`调用没有同类tag问题，未顺手改动。

新增tests/production-records.test.ts读取真实GET源码，经当前Next SWC转换及压缩后执行：修复前正常读取400而非200，修复后正常读取200、销售员请求供应商403且不发起SQL。该测试覆盖实际压缩行为，不以源码字符串匹配代替执行。

最终修复部署：`dpl_GK6rE1f4kZoniFen2YTwTN8zPcUT`，READY，固定地址仍为https://trade-workstation-test.vercel.app 。已登录真实线上只读复测：customer records 200且records数组合法，product records 200且records数组合法，members API 200。客户页实际点击“加载 / 刷新资料”后无错误提示；未创建或导出云端业务资料。

最终本地54文件176测试通过，build/typecheck通过；lint exit0，另一路scripts/codex-progress-monitor.mjs保留2条既有未使用变量warning，未改该流程。独立只读复核通过，指出生产回归直接覆盖GET，服务层两处依赖既有集成测试及静态复核。HEAD在巡检流程中持续更新，本轮未提交；不能把HEAD当作不可变部署来源，部署以CLI上传文件及上述deployment ID为准。

剩余范围：完整共享订单/采购/出运/收付款/正式单据/文件签章/退税包仍未实现；真实业务写入、多员工协同与云端并发未验收。下一步回到已批准的12任务共享业务实施计划，勿把本轮已关闭的读取故障写成仍待密码/权限配置。
