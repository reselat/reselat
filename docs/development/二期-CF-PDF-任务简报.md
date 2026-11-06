# 二期 · CF-PDF：让 PI / 单证 / 退税核对表在 Cloudflare Workers 上可用

> 工作目录：`/Users/oliver/.codex/worktrees/reselat-cf/外贸工作站`（分支 `codex/cf-deploy`）。不 commit、不 push、不登录/部署 Cloudflare、不碰 3120 与 8787、不改 e0 worktree、不写密钥、不改 `next-env.d.ts`。

## 现状（调度方已查清）

- 栈：`@react-pdf/renderer@4.9.0` → `@react-pdf/layout`（`import ... from 'yoga-layout/load'`，yoga-layout 3.2.1，Emscripten 从 base64 字节 `WebAssembly.instantiate`）→ `pdfkit@0.20.1`（Next 把 `@react-pdf/renderer` 列为 server external，所以由 OpenNext 的 esbuild 以 node 条件打包，解析到 `pdfkit/js/pdfkit.node.mjs`）+ `fontkit@2.0.4` + `@react-pdf/font`。
- 调用点：`src/templates/pi.tsx`（renderPi）、`trade.tsx`（renderTradeDocument：PI/SC/PO/CI/PL，签名图片用 `{data:Buffer,format}`）、`refund-check.tsx`（renderRefundCheck）；字体 `src/templates/pdf-fonts.ts` 用 `Font.register({family:'NotoSC',src:path.join(process.cwd(),'assets/fonts/NotoSansSC-Regular.otf')})`（8.3 MB）。
- workerd 三道坎：
  1. `pdfkit.node.mjs` 末尾 `const require$1=createRequire(import.meta.url); registerStdFontLoaders({Helvetica:()=>require$1('#standard-fonts/Helvetica'),...14 个})`，PDFDocument 初始化默认字体 Helvetica → workerd 报 `No such module "#standard-fonts/Helvetica"`。node build 不导出 `registerStdFonts`。`pdfkit` 的 exports 有 `pdfkit/standard-fonts/<Name>`（default → `.mjs`）。
  2. yoga：workerd 禁止字节编译 Wasm；但允许 wrangler 静态导入的 `.wasm`（得到 `WebAssembly.Module`），`WebAssembly.instantiate(module, imports)` 可用。
  3. 字体：Workers 无 fs；8.3 MB 不能打进 Worker 包（当前 gzip 2.6 MiB，付费上限 10 MiB）。Workers 静态资源单文件 ≤25 MiB，可走 `ASSETS` 绑定。`@react-pdf/font` 的 `FontSource.load()` 只在 `loadResultPromise===null` 时调用 `_load()`；`Font.getFont({fontFamily})` 返回 FontSource。`fontkit.create(uint8)` 可从字节建字体。
- OpenNext 的 esbuild 没有用户插件/alias 钩子；它会把 `.wasm` 交给 wrangler。OpenNext 支持自定义 Worker 入口（wrangler `main` 指向自写文件，`import handler from './.open-next/worker.js'` 再 `export default`，并 `export *` 其余导出）。

## 选定方案（保留 react-pdf，版式不变）

1. **自定义 Worker 入口** `cloudflare/worker.ts`（wrangler `main` 改为它）：
   - 静态 `import yogaWasm from '../.open-next/reselat/yoga-3.2.1.wasm'`（构建脚本生成，见 3）；在模块顶层包装 `WebAssembly.instantiate`：当第一个参数是 ArrayBuffer/TypedArray 且字节长度等于 yoga wasm 长度时，改为 `originalInstantiate(yogaWasm, imports)` 并返回 `{module: yogaWasm, instance}`；其余调用原样转发（无法匹配就抛原错误）。如 Emscripten 走 `instantiateStreaming` 也同样处理。
   - 静态 import 14 个 `pdfkit/standard-fonts/*` 数据，挂到 `globalThis.__RESELAT_PDFKIT_STD_FONTS__`（键为 `#standard-fonts/` 后的名字，如 `Helvetica`、`HelveticaBold`）。
   - `export default { fetch: handler.fetch }`（或直接 re-export handler），`export * from '../.open-next/worker.js'`（保留 DO 等导出）。
   - 该文件从 tsconfig 排除或给 `*.wasm` / `.open-next` 加声明，保证 `tsc --noEmit` 绿。
2. **构建后补丁** `scripts/cf-patch-pdf.mjs`（`cf:build` = guard → `opennextjs-cloudflare build` → 本脚本）：
   - 在 `.open-next/server-functions/**/*.mjs|*.js` 中把所有形如 `<标识符>("#standard-fonts/NAME")` / 单引号版本替换为 `globalThis.__RESELAT_PDFKIT_STD_FONTS__["NAME"]`；**替换总数必须恰为 14**（或按实际唯一出现数校验，写成常量），否则 `process.exit(1)` 并打印原因——绝不静默。
   - 从 `node_modules/yoga-layout/dist/binaries/yoga-wasm-base64-esm.js` 提取 base64 写出 `.open-next/reselat/yoga-3.2.1.wasm`（校验 `\0asm` 魔数；版本必须 3.2.1，否则失败）。
   - 复制 `assets/fonts/NotoSansSC-Regular.otf` → `.open-next/assets/_pdf-fonts/NotoSansSC-Regular.otf`（作为 Workers 静态资源上传；OFL 字体可公开）。
   - 导出纯函数便于单测（如 `patchStandardFontRequires(source)` 返回 `{code,count}`）。
3. **字体加载** `src/templates/pdf-fonts.ts`：改为 `export async function ensurePdfFonts()`；三个模板改为 `await ensurePdfFonts()`。
   - 非 cloudflare（Node/Vercel/本机/测试）：**保持现状**（path 注册），输出不得变化。
   - `DEPLOYMENT_TARGET==='cloudflare'`：注册 `{family:'NotoSC',src:'https://assets.invalid/_pdf-fonts/NotoSansSC-Regular.otf'}`（仅占位），然后通过 OpenNext 全局 context（`globalThis[Symbol.for('__cloudflare-context__')].env.ASSETS.fetch(...)`，与 `src/server/db/cloudflare.ts` 同一做法）取字体字节，`fontkit.create(new Uint8Array(buf))`，把 FontSource 的 `data` 设为该字体、`loadResultPromise` 设为已完成 Promise。字节与 fontkit 对象做模块级缓存（纯 JS 对象，跨请求安全）；失败时清缓存并抛 `PDF_FONT_UNAVAILABLE`。
   - 如需直接依赖 `fontkit`，用 `npm install --save-exact fontkit@2.0.4`（与现有一致，避免重复）；缺类型就加最小声明。
4. **wrangler.jsonc**：`main` 改为 `cloudflare/worker.ts`；注释说明 `limits.cpu_ms`（Workers Paid，建议 PDF 场景设 60000）。

若实测发现以上某一步不可行，可调整，但须：不改 `node_modules`、不打 8 MB 字体进 Worker、Node 输出不退化，并在完成说明写清。

## 测试与验证

- 新增单测：补丁函数（14 处替换、计数不符时报错）、wasm 提取（魔数）、`ensurePdfFonts` cloudflare 分支（mock context：`ASSETS.fetch` 返回磁盘字体字节）在 Node 下真的渲染出含中文的 PI（`%PDF-` 且字节合理）、非 cloudflare 分支不变。
- 新增 `tests/templates/refund-check.test.ts`：用合理夹具渲染退税核对表并写 `artifacts/pdf/refund-check.pdf`（目前没有该测试）。
- `npx vitest run` 全绿、`npx tsc --noEmit` 绿、改动文件 eslint 无问题。
- 版式：`/tmp/pdfvenv/bin/python scripts/check-pdf-layout.py` 与 `scripts/check-trade-layout.py` 必须通过（先跑 `npx vitest run tests/templates`）。改造前 Node 基线已存 `/tmp/cf-pdf-check/node-before/`。
- `npm run cf:build` 通过，报告 `npx wrangler deploy --dry-run --outdir /tmp/cf-dry`（设 `WRANGLER_SEND_METRICS=false`）的 Total Upload / gzip。
- workerd 实测：临时 `.dev.vars`（假值，`DEPLOYMENT_TARGET=cloudflare`）+ **临时**探针路由 `src/app/api/cf-pdf-probe/route.ts`（`?kind=pi|trade|refund`，用测试同款夹具直接调渲染函数，返回 PDF 和 `x-render-ms` 头），`npm run cf:build` 后 `npx wrangler dev --port 8791 --ip 127.0.0.1`，三类各取一份存 `/tmp/cf-pdf-check/workerd-{pi,trade,refund}.pdf`，记录耗时（首个请求与第二个请求）。之后用 `/tmp/pdfvenv/bin/python` + pdfplumber 抽字检查中文、与 Node 版逐页比较文本与页数。**结束后删除探针路由和 `.dev.vars`，停掉 8791，重新 `npm run cf:build` 确保最终产物不含探针。**
- 更新 `docs/development/Cloudflare-部署清单.md`（去掉 PDF 阻塞，写字体资源部署方式、CPU limits、实测耗时）与新建 `docs/development/二期-CF-PDF-完成说明.md`。
