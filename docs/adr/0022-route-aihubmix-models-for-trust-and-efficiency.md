# 按信任任务路由 AIHubMix 模型与单聊控制链

- Status: Accepted
- Date: 2026-07-31

## 背景

陪伴产品的模型选择不能只看单次“聪不聪明”。用户信任依赖四件可观察的事：尊重当前回应边界、不虚构共同记忆、不猜测隐私政策、不替用户宣布隐藏偏好；同时普通聊天不能因为后台调度变得又慢又贵。

AIHubMix 提供 OpenAI 兼容端点、统一 `reasoning_effort`、模型目录与响应头中的实际模型归因。模型映射和 fallback 可按 Key 配置，因此评测前必须检查 `X-Aihubmix-Model`，且不能把未验证的静默 fallback 当成目标模型结果。

## 决策

1. 增加 `aihubmix` provider，默认 Base URL 为 `https://aihubmix.com/v1`，密钥只通过 `AIHUBMIX_API_KEY` 注入。
2. 当前默认人物模型与明确分析模型均为 `gpt-5.6-luna`；结构化安全/Director 调用使用 `deepseek-v4-flash`。`PERSONA16_ANALYSIS_MODEL` 仍可独立覆盖，便于后续重新 bakeoff。
3. 思考预算按任务而非人格固定开启：倾听、支持、修复和普通收尾关闭思考；明确分析使用高思考。结构化控制固定关闭思考。
4. 单 Agent 普通对话使用确定性调度，跳过没有新增价值的模型 Director；明确分析和多 Agent 房仍保留模型 Director。
5. 用户指出人物越过倾听边界时，直接使用按人物取样、经同一交付门验证的边界修复变体，不再为两句修复额外调用模型。
6. 最终交付硬门新增：无来源记忆肯定、无依据隐私承诺、替用户宣布隐藏偏好，以及跨单位相加。未明确要求详尽时超过 500 字只记录为质量观察，不触发重写；两次比较分析都因真正的硬错误失败时，使用通用、单位一致的加权比较法兜底。
7. 记录 AIHubMix token 估算成本；未知模型不伪造成本。生产账单仍以供应商为准。

## 小样本证据

- 相同信任边界场景中，四个候选模型均能通过基础边界检查；Luna 在承接感受、记忆诚实和隐私不承诺上更稳定，昂贵模型没有显示出足以覆盖成本差距的优势。
- 控制模型单样本中，Gemini Flash Lite No-think 更快但成本约为 DeepSeek Flash 的两倍；继续采用 DeepSeek Flash。
- 单聊跳过模型 Director 后，同一 Luna/DeepSeek Flash 场景从 4 次调用、约 8.8 秒、约 `$0.000526` 降到 2 次调用、约 4.1 秒、约 `$0.000110`。这是形成性运行证据，不等同于长期 SLA。
- 五场景套件覆盖轻聊、决策自主权、边界修复、记忆诚实和隐私诚实；人工复核发现并促成了比自动规则更多的修复，因此自动通过不能替代人工盲审或真实用户验证。

## 后果

- 普通单聊更快、更便宜，且不会为了展示人物性格强制运行分析机制。
- 多 Agent 房间化学反应不受单聊快路径影响。
- 默认模型与路由仍是形成性配置；正式发布前必须按冻结 SHA 运行既有盲测协议和真人评审。
- AIHubMix 的数据处理与上游策略不能由人物自行承诺。产品需要独立、可访问的隐私说明；人物只承认当前无法确认的边界。

## 官方依据

- [AIHubMix 快速开始](https://docs.aihubmix.com/cn/quick-start)
- [统一推理参数](https://docs.aihubmix.com/cn/api/unified-inference)
- [模型目录 API](https://docs.aihubmix.com/cn/api/Models-API)
- [模型映射与 fallback](https://docs.aihubmix.com/cn/api/Model-Mapping-Fallback)
- [数据隐私说明](https://docs.aihubmix.com/cn/api/Data-Pravicy)
