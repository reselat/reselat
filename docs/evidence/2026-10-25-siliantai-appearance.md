# 思链台名称与双主题更新

用户要求：程序名“思链台”，浅色深灰配白、深色深蓝配黑，可切换。

实现：统一网页标题/applicationName、登录品牌、业务/成员管理/本机演示导航及新链条favicon。全局主题变量覆盖背景、表格、输入框、按钮、状态、抽屉与遮罩；固定右下角浅色/深色开关。只在浏览器siliantai-theme保存外观偏好，首次按系统外观选择；head常量脚本在首屏应用偏好，useSyncExternalStore更新开关及跨页storage事件。初始化时重新同步，处理事件发生在订阅前的时序；存储不可用时仍可使用系统默认及当前页切换。

本地验证：Next生产build、构建后typecheck通过；lint无error，仍为巡检脚本2条既有warning；git diff --check通过。此为可逆外观修改，未新增镜像实现的单测，既有197项业务测试基线未改动/删减，本轮未重跑全业务套件。

ego-browser隔离本机预览使用真实登录/工作台/成员管理组件和虚构只读API，无云端写入：浅深登录截图、深色表格/成员抽屉、切换后刷新记忆、跨标签页同步、390px视口与页面宽度均390、开关fixed层级35可点击；成员抽屉背景rgb(17,25,37)，输入框rgb(12,18,28)。常量初始化脚本验证保存值/系统偏好/非法值/存储拒绝5种情况通过。图片位于被忽略的artifacts/appearance/。

发布目标仍为已授权trade-workstation-test/prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9，固定URL保持https://trade-workstation-test.vercel.app。零新增依赖/工具链；未修改身份权限、业务逻辑、云端SQL、账号或密钥。应用过的SQL保持冻结。待发布READY后补在线验证结论；回退为前一READY dpl_GPLW1GiAtyJyKLeYzGvdqPdqUVbx，外观偏好值不影响业务资料。

发布结果：dpl_7RTjC6abEkLvnrdMBg4dwBRZB36m READY（2026-10-25），原trade-workstation-test.vercel.app别名生效。最终本机构建、类型与lint检查通过，切换时登录表单输入保留；无新增测试依赖或数据库变更。

线上ego-browser复测通过：标题“思链台 · 外贸业务工作台”、主标题“登录思链台”；深色页面背景rgb(9,13,19)，浅色背景rgb(244,245,247)，选择深色后刷新仍保持深色并正确更新按钮选中态。最后恢复原初始外观，保留线上登录页供用户使用。本机隔离服务已停止，无账号/业务写入。Ego Lite提示可选更新，未升级。
