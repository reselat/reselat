# DSH／DS-Bot固定版本核实

日期：2026-11-01。作者与版权所有者：朱春茂。仅静态源码研究，未执行运行时、安装依赖或提供API Key。

## 候选与许可

- 官方Harness：deepseek-ai/deepseek-harness，提交 `ce7073d51254c26cd63b22a60835b8f948deb447`；[MIT许可](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/LICENSE)。
- 社区插件：Fei2411/DS-Bot，提交 `f823773b07ec6ca29d60b31c31af30218a68000d`；[Apache-2.0许可](https://github.com/Fei2411/DS-Bot/blob/f823773b07ec6ca29d60b31c31af30218a68000d/LICENSE)。不是DeepSeek官方Bot产品。
- 这些是本轮研究候选，不是已经确认相互兼容、获准安装的生产版本；第三方组件后续分发需保留相应许可和NOTICE要求。

## 入口和调用清单

| 路径 | 固定源码／发现 | RESELAT网关约束结论 |
|---|---|---|
| reply | [channel.js](https://github.com/Fei2411/DS-Bot/blob/f823773b07ec6ca29d60b31c31af30218a68000d/ds-bot/src/host/channel.js) 的POST /api/bot接待内部动作 | 仅确认内部通道；完整生成链和受控出口尚未证明，unverified |
| memory | [memory.js](https://github.com/Fei2411/DS-Bot/blob/f823773b07ec6ca29d60b31c31af30218a68000d/ds-bot/src/host/memory.js#L1273) 使用ctx.llm.stream | 不经过现有RESELAT runAiTask；尚无接入网关证据，unverified |
| compaction | [summarizer.ts](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/compaction/compaction-basic/src/summarizer.ts#L163) 独立发起ctx.llm.stream | 不能只限制主回复；尚无受控证据，unverified |
| background | 目录树存在ds-bot/src/host/schedules.js；未穷尽插件和后台触发 | unverified；inventoryComplete=false |
| discovery | [providers.js](https://github.com/Fei2411/DS-Bot/blob/f823773b07ec6ca29d60b31c31af30218a68000d/ds-bot/src/host/providers.js#L196) 使用ctx.llm.discoverModels | 额外网络请求也需统一出口核实，不能当成纯本机操作 |

实际清单判定blocked。离线函数的eligible测试只是合成完整清单的行为测试，不是以上上游已通过。未声称穷尽所有上游调用。

## 权限和停止

[安全模型](https://github.com/Fei2411/DS-Bot/blob/f823773b07ec6ca29d60b31c31af30218a68000d/SECURITY_MODEL.md) 明确Docker路径使用danger-full-access、approval never，容器是隔离边界；不能直接给它挂载ERP密钥或企业数据库目录。

[Docker文档](https://github.com/Fei2411/DS-Bot/blob/f823773b07ec6ca29d60b31c31af30218a68000d/docker/README.md) 区分DATA_DIR／DSH_HOME与WORKSPACE_DIR，允许自定义模型端点，并要求备份前停容器。未来试验先固定独立Compose项目，停止使用docker compose -p <试验项目> stop，不使用会删除数据的down -v；本轮没有容器可停止。

内部HTTP通道不能当稳定公共API。配置自定义模型端点不是全部路径已强制计费的证明；后续要在无真实Key环境做全出口捕获，覆盖主回复、记忆、压缩、后台、发现及插件工具。

个人微信是否能可靠识别会话、读消息与发送回执，此仓库研究未证实；不能把DS-Bot团队聊天界面当微信连接器。
