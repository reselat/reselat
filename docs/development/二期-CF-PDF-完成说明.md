# 二期 CF-PDF 完成说明

2026-11-05。本次保留 react-pdf 与原模板版式，Node 路径仍从磁盘注册 NotoSC；Cloudflare 改用 ASSETS 读取公开 OFL 字体，缓存 fontkit 字体对象，失败抛 PDF_FONT_UNAVAILABLE 并允许重试。

## 改动

- cloudflare/worker.ts：静态加载14个pdfkit标准字体与Yoga wasm，包装字节实例化为静态Module实例化，保留OpenNext导出。
- scripts/cf-patch-pdf.mjs：严格校验28处替换（handler打包副本及复制pdfkit各14），锁定Yoga3.2.1、检查wasm魔数、复制字体到静态资产。
- src/templates/pdf-fonts.ts 与 pi/trade/refund-check：异步确保字体；src/types/fontkit.d.ts 最小声明。
- package.json/package-lock.json：锁定fontkit2.0.4，cf:build追加补丁；wrangler.jsonc更换入口并说明PDF CPU设置；tsconfig.json排除专用Worker入口。
- 新增补丁、CF字体真实渲染、退税模板测试；更新部署清单。

## workerd 实测

使用临时探针和仅含假值的.dev.vars，8791本地运行；所有请求200。以下是x-render-ms（首/次），并非生产CPU指标。

| 类型 | 耗时 ms | 页数 | 中文 | 同夹具Node逐页文本/页数 |
| --- | --- | --- | --- | --- |
| PI | 57 / 14 | 1 | 有 | 完全一致 |
| 单证 PI | 34 / 20 | 1 | 有 | 完全一致 |
| 退税核对表 | 8 / 6 | 1 | 有 | 完全一致 |

PDF及headers、比较JSON保存在 /tmp/cf-pdf-check。探针路由、临时Node基线测试和.dev.vars均已删除；8791已停止，无监听。删除后重新构建，最终产物不含探针。

## 构建与限制

cf:build通过，补丁28处、Yoga71736字节。无探针dry-run：Total Upload 14133.70 KiB，gzip 2898.82 KiB。8.3MB中文字体在ASSETS，不打进Worker JS。建议Workers Paid设置cpu_ms=60000。

本地实测不代替生产部署冒烟；未登录或部署Cloudflare。当前Yoga走instantiate，未包装instantiateStreaming；升级后若切换加载路径需重新验证。Wasm长度匹配针对当前锁定版本，升级需同步构建校验。OpenNext/fontkit仍有既有axisIndex重复键构建警告。未commit、未push、未占用3120/8787、未改e0工作树、未修改node_modules文件、未写真实密钥。

## 测试与版式

最终全套vitest：124文件、485测试通过；tsc --noEmit退出0；改动文件eslint退出0。两个版式脚本均通过：PI1行1页、100行8页，表头/总额/行分隔检查通过；PI/PO/CI/PL各1页、长单9页均无越界。新增退税PDF输出 artifacts/pdf/refund-check.pdf。

## 调度方复核（审计）

- 修正：`package.json` author 被转义为 `\u…`，已还原中文；构建脚本补充 Yoga wasm 字节长度校验（与 `cloudflare/worker.ts` 拦截条件一致）；`ensurePdfFonts` 失败重试时不再重复注册字体源。
- 复测：重新 `cf:build`（PDF patch 28 处、Yoga 71736 字节），workerd 生成 PI 1/100 行、单证 PI/长单、退税核对表 5 份，用 pdfplumber 比对**字形 + 坐标 + 字号**与 Node 输出完全一致；Node 改造前后同样一致（版式零变化）。墙钟耗时见《Cloudflare-部署清单》§9（x-render-ms 在 Workers 内不可靠，以 curl 为准）。
- 最终：vitest 124 文件 / 485 测试通过；tsc 通过；改动文件 eslint 通过；dry-run 14133.78 KiB / gzip 2898.83 KiB；产物不含探针。
