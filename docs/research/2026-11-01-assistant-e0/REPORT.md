# RESELAT二期E0验证报告

日期：2026-11-01。作者与版权所有者：朱春茂。

## 结论

离线实验工件已实现；真实夜间自动接待尚未通过验收。原线上程序、云库、真实模型Key和万捷副本未改动。代码保存在codex/reselat-assistant-e0隔离分支，未合并、推送或部署。

## 证据矩阵

| 能力 | 模拟／静态证据 | 真实状态 |
|---|---|---|
| conversation_identity | 拒绝不同企业／账号／会话绑定 | unverified，未操作微信 |
| read_text | 模拟重复消息只接收一次 | unverified，未读取微信 |
| send_text | 仅虚构内存通道发送 | unverified，无实际外发 |
| delivery_receipt | unknown保持原结果、不重试 | unverified，无微信回执证据 |
| human_takeover | 接管版本变化、重连不解除暂停 | unverified，未证实桌面发送原子性 |
| reconnect | 绑定变化与断线拒绝发送 | unverified，未运行采集器 |
| model_call_coverage | 固定版本源码确认记忆／压缩另行调用，清单未穷尽 | blocked，未注入密钥；不是支持状态 |
| pdf_extraction | 本机pypdf真实读取单页虚构PDF，两行16字段与基准一致 | 仅该文本样本supported；企业复杂PDF／扫描仍unverified |

判定器必须按同一能力、同一版本清单评估，mock不能升级真实状态。上述真实微信矩阵均为not_run，revision／reference无实测值，不能凭此生成supported记录。模型覆盖blocked是接入门槛状态，与能力证据的unverified区分。

## 验证

基线82个测试文件、278项通过。新增实验覆盖证据门槛、绑定与接管、未知回执、调用路径完整性、报价错页／币种／单位／条件／版本与重复行。完整回归86个测试文件、299项全部通过（原278项＋新增21项）。

类型检查通过；lint 0错误，原有scripts/codex-progress-monitor.mjs两条未使用变量警告（sizeNow、staleSessions），新增实验无lint错误。未改依赖清单。

PDF探针：python3 experiments/assistant-e0/pdf-text-probe.py /private/tmp/reselat-e0-pdf-text，通过；环境需已安装pypdf，未新增安装。该脚本只是重复实验方法，不是产品提取服务，不证明OCR和复杂排版支持。

## 下一步

- E1可据此规划人工审核／版本发布，不依赖先提供真实模型Key；抽取器仍需覆盖复杂PDF样本。
- E2可开发持久化模拟接待服务，不能把当前MockChannel直接当生产实现。
- E3真实接入仍需完成全部模型出口控制、固定运行时组合兼容性以及微信身份／回执／人工接管实测。
- 真实微信实测流程见[实测单](wechat-runbook.md)，固定源码见[上游核实](upstream.md)，PDF限制见[PDF验证](pdf.md)。

## 独立审查和执行取舍

固定审查范围c6688a1..61740c7；独立审查无Critical／Important，可合并离线工件。审查者未重新获取上游链接，并因沙箱禁止Vitest写.vite-temp而未能独立复跑；本报告299项通过来自执行者的真实运行，不代表审查者复跑成功。

保留一个小项：quote-probe.test.ts未单列specification规格错配用例，当前实现已比较规格，后续补回归覆盖。

执行决定及代价：

1. 恢复已审阅技能脚本的用户执行位，以支持脚本互调；影响仅本机技能执行权限。
2. 复制已装依赖替代软链接，以通过现有打包测试；增加本机磁盘占用，不新增依赖。
3. 增补已有pypdf虚构文本探针；简单样本不能外推复杂PDF支持。
4. 真实微信／接管／扫描OCR保留unverified；尚不能启用真实自动接待。
5. 持久化和不同attempt ID重复回复约束留给E2；E0内存模拟器禁止作为生产服务。
6. 上游使用执行者固定提交源码证据，审查者未重复下载；静态结论仍须运行时验证。
7. 测试使用执行者全量运行证据，审查者未独立复跑；不声称双重运行验证，集成后仍需再测。
