# Vercel PDF运行时字体打包修复

线上正式PI/PO在render阶段返回FILE_NOT_READY；确认快照、签名授权与上传素材仍保留。数据库未产生重复单据或文件意图。固定安全诊断记录render阶段与构建坐标，不输出原始单据、异常正文或凭据。

最小复现使用Next内置nodeFileTrace对pdfkit.node.mjs按node/import条件生成裁剪包。PDFKit 0.20.1内部通过createRequire加载#standard-fonts/Helvetica，但追踪只包含mjs入口，漏带Helvetica.cjs及其chunks/standardGlyphNames-*.cjs。隔离裁剪目录的PDFDocument构造真实失败MODULE_NOT_FOUND，完整node_modules目录不复现。

next.config.ts在现有API追踪包含规则补入node_modules/pdfkit/js/standard-fonts/**/*.cjs，不新增/升级依赖，不改变字体内容或正式快照。tests/production-pdf-trace.test.ts先见红，补全规则后在隔离临时目录用实际追踪文件＋配置包含项生成真实PDF通过；完整build产出的API NFT目录另行复制后同样构造PDF通过，包含15个所需CJS字体/共享块文件。最终60文件197测试、lint无error（既有巡检2warning）、build及构建后typecheck通过。

该修复发布后仍需以原测试单据重试Vercel归档并检查下载摘要；发布READY不代替线上PDF验收。正式版本与文件意图不可覆盖，已归档PDF仍返回固定字节。

最终复测：dpl_GPLW1GiAtyJyKLeYzGvdqPdqUVbx READY，原PO任务以及后续两批CI/PL、SC均在Vercel实际生成/归档200，下载PDF已渲染检查；退税检查PDF/ZIP同样成功。PI固定文件通过真实浏览器下载并核对SHA256。线上失败已关闭；详细范围和早期PI本机生产构建重放说明保留于聚合证据，不改写失败历史。
