# 本地部署候选文件

状态：架构讨论和开发底座，尚未在Docker/真实服务器验收。不要把本目录当作一键安装器。主方案在 `docs/architecture/思链台本地化与二期扩展方案.md`。

## 已包含

Next.js standalone多阶段非root镜像、独立业务Postgres、私有文件卷、Caddy局域网TLS/互联网TLS两种配置。无DB公网映射，Auth由另外的官方自建Supabase身份栈提供，应用只使用其Auth API与独立identity_backend连接。容器版本当前为候选固定tag；上生产前校验来源、架构支持与漏洞并锁定digest。

## 安装前必须完成的工作

1. 安装Docker Compose并核定服务器OS/CPU架构、磁盘、备份和域名。本开发机没有Docker，未实际运行本清单。
2. 按官方Supabase自建Docker文档准备身份栈，固定上游版本，关闭开放注册，配置TOTP/MFA及站点URL，确保kong不向公网开放完整Studio/API。内外公共URL必须匹配APP_ORIGIN。密钥不复用云验收环境。
3. 官方身份Compose的db服务需在其共享网络添加alias `identity-db`（kong使用其默认alias），把实际网络名写入IDENTITY_DOCKER_NETWORK。检查该网络中没有其他同名服务，业务DB不可加入身份栈的默认数据库服务名。
4. 从本目录.env.example复制到.env并chmod600。IDENTITY_PROJECT_REF/BUSINESS_PROJECT_REF是本实例20位用途标记，不是新建托管项目；两库必须不同，marker行需与配置相同。两个数据库URL使用各自用途角色，口令做URL编码。
5. 完成空库初始化和最小权限角色登录配置。身份顺序：auth-admin-schema.sql → add-auth-session-view.sql → identity-management.sql；业务顺序：business-initial-schema.sql，然后tests/helpers/full-business.ts中businessMigrations顺序。注入两库标记和同一公司UUID、首位员工的Auth UUID。这里只说明依赖顺序；可靠新装/升级工具及首管理员引导尚待D1开发，不建议手工拼SQL交付客户。保留NOLOGIN到口令安全配置完成后再开启LOGIN。
6. 注册首管理员、启用MFA，确认成员停用和管理员会话撤权有效；切勿开启免鉴权“本地模式”。

配置完成后，候选启动命令（从本目录执行）：

```sh
docker compose --env-file .env -f compose.yml config --quiet
docker compose --env-file .env -f compose.yml up -d --build
```

数据库初始化未完成时健康探针也仅代表应用存活，不代表业务就绪。app /api/health不会泄露数据库配置，也不检查DB可用性；后续需管理员可见的readiness诊断。

## 局域网和互联网

LAN用Caddyfile.lan；让客户端DNS解析SITE_HOST到服务器内网IP，并信任Caddy根CA。HTTP不满足Secure Cookie/Web Crypto/MFA。互联网改Caddyfile.internet和可公开验证域名，在受控入口映射80/443；分域DNS让办公室和外出员工访问同一域名同一实例。更改NEXT_PUBLIC值要重建镜像，它是构建期配置，不是只重启容器。

只暴露网关，不暴露Postgres、身份数据库、Studio或私有文件。无公网地址时需要选定VPN/隧道并验证，不保证Compose自行打通网络。

## 备份与回退

备份范围：业务DB、身份DB/Auth、private-files卷、必要配置与加密密钥、Caddy CA/证书、版本及迁移记录。不要把这些放入代码GitHub仓库。先定义停写窗口或一致性快照，定期异机恢复；docker compose down -v会删除数据，不能用作更新命令。

更新应用先备份、拉取固定版本、跑CI和迁移预检，再替换app镜像；保留旧镜像。schema变化需确认旧应用兼容，不能把应用镜像回滚等同于数据回滚。数据迁移、容灾与首次安装仍需D1-D3验证。

参考：
- https://supabase.com/docs/guides/self-hosting/docker
- https://nextjs.org/docs/app/api-reference/config/next-config-js/output
