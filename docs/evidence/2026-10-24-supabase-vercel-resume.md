# Supabase 双库与 Vercel 续作记录

日期：2026-10-24（Asia/Shanghai）。用户要求继续既有项目，采用 Supabase + Vercel，身份角色与业务分别部署和管理。本轮主智能体为唯一写入方；deployment_review 按既有计划执行独立只读复核，未读凭据、未改文件或操作云端。

## 实际变更

- 保留两个独立 Supabase 项目及现有账号/MFA。新增 Vercel Singapore 配置、禁止安装生命周期脚本、部署文件排除；本机环境文件和样本不随部署上传。
- Next.js 明确包含公开数据库 CA 和中文 PDF 字体；未更换证书、关闭 TLS 或改变角色权限。
- 运行时接受 Supavisor 6543 事务池，仅 pooler 主机可用；保留 5432、项目 ref、专用角色、路径、参数和用途标记校验。配置向导仍使用 5432，不改已有密码或连接文件。
- 共享业务 HTTP 基础入口改为流式限制100000实际字节，拒绝超限后取消流；无效 JSON/UTF-8 返回安全 INVALID_INPUT，超限返回 BODY_TOO_LARGE。现有旧版 records 路由尚未切入该统一入口，不能把基础函数修复视为所有业务路由已迁移。
- 补独立身份/业务 PGlite 集成：身份故障、停用、旧身份版本、跨公司、不同actor/kind幂等冲突、编号与审计回滚、命令历史不可更新/删除。未模拟TCP并发通过。
- 更新README和双库配置过时描述，新增部署步骤、环境变量归属、迁移与恢复说明。

## 验证

| 项目 | 实际结果 | 日志 |
| --- | --- | --- |
| 接手基线 npm test | 49文件159测试通过 | 2026-10-24-resume-tests.log |
| 修复前定向 | 3失败/2通过，复现6543拒绝、JSON分类和UTF-8限额缺陷 | 2026-10-24-deployment-red.log |
| 修复后定向 | 4文件10测试通过 | 2026-10-24-deployment-green.log |
| 双库命令集成 | 4测试通过，真实PGlite SQL、专用角色 | 2026-10-24-command-identity.log |
| 最终 npm test | 52文件170测试通过 | 2026-10-24-deployment-tests.log |
| npm run lint | exit 0 | 2026-10-24-deployment-lint.log |
| npm run build | exit 0 | 2026-10-24-deployment-build.log |
| 构建后 npm run typecheck | exit 0；最后新增测试后再跑通过 | 2026-10-24-deployment-typecheck.log |
| 实际文件跟踪 | admin页面与records API包含CA，PDF API包含中文字体 | 2026-10-24-deployment-assets.log |

追加流取消测试首次夹具误用Object.assign覆盖Request只读body，测试构造失败；改为原生ReadableStream请求后全量170通过，未修改业务断言。

云端只读：两个Supabase项目均ACTIVE_HEALTHY、Singapore；identity_backend读取employees=true、旧business_records=false、删除身份audit=false；business_backend读business_records=true、删除业务audit=false。工具多语句仅返回最后结果，本轮不以未展示的中间查询推断其他对象状态。Vercel返回6个既有项目，未见此工作站；list_teams返回空，未据此推断无可用账号或套餐。

独立只读复核未发现本轮新增可行动问题，明确未实测Vercel、云端6543自定义角色、网络并发及完整Auth/业务闭环。

## 未完成与边界

- 没有创建Vercel项目、写环境变量、部署、改DNS、迁移云端SQL、创建桶或写测试资料；未安装依赖、读取/输出密钥值或初始化Git。
- 已应用双库基础SQL冻结；完整业务基础/主档SQL仍为本地稿，未因本轮用户指定部署方式而自动应用。
- 统一命令和HTTP基础已验证，但Task 1不能因此认定所有页面/API已经接入；Task 2客户移交仍依赖Task 3订单表，完整12任务未完成。
- ZIP直接依赖授权、业务Storage key/私有桶、新业务SQL与云端测试对象仍待具体清单；实际Vercel发布需先确定目标项目和环境。生产不在本轮范围。
- 下一步：按既有计划接通共享主档/客户跟进与分配移交，并与共享订单事务联调，之后继续采购、出运、单据和收付款闭环。
