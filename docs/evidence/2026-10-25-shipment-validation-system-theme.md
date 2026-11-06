# 出运表单错误与跟随系统主题

用户最新要求：截图填完不能保存出运；PI/CI及合同生成逻辑保持现状，不再调整下载入口；主题增加跟随系统选项。

## 原因与修复

只读核对截图中的SYNTHETIC E2E商品关联订单：一个历史完成单有采购和到货；当前确认单没有采购、没有到货。旧ShipmentForm无来源时仍允许填包装并发送lines=[]，服务端仅报通用字段错误。截图另有CBM=0，原有服务端要求体积为正。没有擅自创建到货或放宽来源校验。

前端prepareShipment现在逐项说明缺到货、无可用量、未分配出运数量、来源超量、箱数/净重/毛重/CBM错误。无可用到货时明确禁用保存并链接采购到货，隐藏不能分配商品的包装输入。合法来源填写后按精确数量构造请求；接口和数据库库存/并发/权限约束保持。增加按箱数及单箱长宽高（cm）计算总CBM的按钮，固定4位小数，30×30×30cm一箱为0.0270m³；人工CBM仍可直接填写。Submit增加独立disabled参数，避免无来源误显示处理中。

主题增加light/dark/system偏好，与实际data-theme分开；引导脚本保留既有浅深偏好，默认和非法值按系统。system监听matchMedia change实时变化，manual不随系统变化；localStorage偏好、跨标签同步、禁用存储降级保留。新增“跟随系统”按钮，不新增依赖。

用户取消单据入口调整，临时新增且未接入的document-download工具与测试已撤回。PI/CI/PO/PL/SC模板、生成确认、归档下载逻辑与前版相同，CO功能保留。

## 验证

- 4个出运表单回归先失败后通过：无到货/已耗尽拒绝、零来源数量、CBM=0、毛重小于净重、超可用量、合法请求及厘米换算。
- 既有真实PGlite完整业务测试改用prepareShipment构造首批出运，验证前端请求能进入实际createShipment并继续两批出运/付款/冲销，仍拒绝超量。
- 6个主题引导回归覆盖手动浅深、system、缺省、非法值和存储不可用。
- 全量65文件218测试通过；build、构建后typecheck、lint通过（巡检2条既有warning），git diff --check通过。未删改既有业务断言。
- ego-browser隔离预览以虚构无到货/有到货状态渲染真实组件；无到货显示明确说明、去采购链接、禁用按钮且无包装输入；CBM0显示具体商品字段错误；按钮计算0.0270，再提交正确quantity=1.0000、1个来源、CBM=0.0270，模拟HTTP成功后关闭表单。数据库真实保存依据上条PGlite集成测试，不把模拟HTTP当云端保存。
- 浏览器媒体模拟light→dark在system模式实时变色；manual light在系统dark下仍light；刷新记住system，第二标签接收dark/system同步。390px页面无横向溢出，三按钮控件左右119/376，在视口内。窗口最小化未取得新截图，仅记录DOM、颜色和交互，不强行恢复；检查任务与本地服务已结束，未升级浏览器工具。

## 发布

目标沿用独立测试项目trade-workstation-test/prj_oFhHpXdAH3ZLaehqqff2qiiLkOA9，发布前CLI只读目标核验通过。最终dpl_HmRxosKaxRD3F9Dy7wv76cb4M7Uv READY，https://trade-workstation-test.vercel.app固定别名生效。前版dpl_9aKN5RRp8nWn48ouYXMQiqrPi1Rm可回退，无SQL迁移/密钥/角色/业务资料/套餐变更。主智能体未commit/push，CLI文件快照不与巡检HEAD伪造绑定；未云端写入用户出运。
