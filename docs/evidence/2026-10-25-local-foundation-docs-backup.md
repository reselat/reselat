# Workspace统一、文档与本地化底座

用户要求统一workspace、补CI、修正文档、开发总结写入Obsidian、GitHub私有备份，并设计本地双网络/财务/AI路线。随后明确：尚无服务器，需要独立头脑风暴方案与其另案交叉评审；确认新建Oliver-corp/siliantai私有仓库。

## 本轮开发和验证

- 登录页移除demo链接，Next配置将/demo及子路径临时重定向至workspace，finance映射payments；旧布局不能呈现第二套UI。未删除仍被测试/领域schema使用的历史代码。
- 当前README与维护手册明确postgres.js、原生FormData/Zod实际栈；v1.0和旧服务器方案头部标明历史性。
- 新增push/PR CI：锁文件安装、lint、224项测试、build/typecheck、self-hosted standalone构建；没有自动部署或生产密钥。
- 自建身份URL、同源浏览器Cookie名称、双库主机/角色/用途标记、私有网络TLS策略与文件驱动可配置。新增原子create-only磁盘存储，最终对象与分片物理目录分开，拒绝越界和符号链接。现有云配置和服务端角色检查保留。
- 财务事件与AI请求版本化schema/端口默认未激活；不向outbox写事件，不启动worker，不外发数据，不新增依赖。
- 提供候选Docker/Caddy/Compose与配置说明；未运行Docker，没有真实服务器、完整安装器、灾备或财务/AI供应商配置。候选方案标出D1-D5交付门槛。

验证：67文件224测试通过；默认云build、自建standalone build、构建后typecheck、lint通过（巡检脚本原2warning）；diff检查通过。本地standalone HTTP实测：health200、login200且无旧试用链接、/demo307到/workspace、/demo/finance307到/workspace/payments、/demo/orders/new307到/workspace/orders/new。未操作云库、未迁移资料或发布这轮改造到Vercel。服务验证结束关闭。

## 文档与Obsidian

已写入 /Volumes/数据/Obsidian/个人知识库/项目/思链台 ：开发总结与维护手册、通用开发交付模板、本地化与二期扩展候选方案、项目索引。技术栈与未来选型、已验证与待验收分列；未来财务/AI未冒充已接通。

## GitHub备份进度

连接器识别Oliver-corp，但本会话无创建/推送工具；CLI gh未安装。ego-browser任务15已打开GitHub登录页，等待用户登录；不索取聊天密码或token。尚未声称已创建仓库或云端备份完成。

推送前检查：.env、e2e会话、.vercel和artifacts被忽略；工作树和Git历史中的secret模式命中仅已核对的虚构测试字符串及TEST ONLY私钥拒绝样例，无实际DB URL/JWT模式命中。本检查不是通用秘密扫描的绝对保证。拟备份完整代码历史和本轮工作，业务数据库/私有文件不进GitHub。

2026-10-25续：用户完成网页登录后，已创建 https://github.com/Oliver-corp/siliantai 私有空仓库，origin指向该仓库。首个完整本地快照8951be4及可校验的main分支bundle已准备。直接HTTPS推送因无命令行凭据未成功；已校验SHA256并临时下载官方gh 2.103.2至/private/tmp，通过官方OAuth流程建立CLI认证。用户明确接受页面列出的repo/workflow及默认gist/read:org权限；GitHub随后要求Mobile安全验证，尚待平台返回成功。未在聊天或仓库记录口令/token。

## GitHub备份已建立（后续完成）

用户完成CLI授权和GitHub Mobile验证后，官方CLI确认账号Oliver-corp。已将完整main历史推送到私有仓库 https://github.com/Oliver-corp/siliantai ，仓库API核对visibility=PRIVATE、首个完整代码快照8951be4与远端提交一致。本地main已追踪origin/main。后续提交只更新备份状态文档。

CI已在GitHub触发，执行结果以仓库Actions页面为准：https://github.com/Oliver-corp/siliantai/actions 。本地224测试与两种构建证据不替代GitHub实际运行结果。未上传数据库、业务文件、.env、会话或.vercel配置；未发布新的线上应用。

## 首次CI资源差异与修复

GitHub run 40200603263：223测试通过，tests/business/files.test.ts的worker因V8约2048MiB堆上限触发SIGABRT；日志明确为Reached heap limit。10MiB归档测试原来对Uint8Array使用deep equality，逐元素断言展开代价过大。改为Buffer.compare全字节比较（仍保留10MiB、5分片、缺片/改片拒绝、重复及越权检查），没有跳过测试、降低文件大小或增大CI内存。NODE_OPTIONS=--max-old-space-size=2048下该文件4测试通过，随后推送重新运行完整CI。
