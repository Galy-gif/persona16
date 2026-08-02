# 首批人物评测协议 v0.8：最终交付质量与模型健康

> 协议版本：`pilot-character-scenarios-v0.8`
> 当前 Prompt 组装版本：`pilot-runtime-prompt-v0.9`
>
> 2026-07-31：人物生产投影改为“轻量社交存在 + 默认休眠的潜在倾向”。协议 0.8 的交付门与模型健康定义不变，但旧 `pilot-runtime-prompt-v0.8` artifact 不能作为当前 Prompt 的完整通过证据；详见 [ADR-0019](../adr/0019-keep-character-dispositions-latent-until-relevant.md)。
> 房间协议版本：`pilot-room-participation-v0.2`
> 架构决策：[ADR-0018](../adr/0018-gate-on-final-delivery-and-observe-model-health.md)
> 历史基线：[协议 0.7 三批冻结复测](pilot-character-retest-v0.7-aggregate-2026-07-25.md)

## 1. 目标

v0.8 判断用户最终看到的回答是否正确、自然、有角色感，不再要求模型在系统保护之前达到固定“裸考”通过率。

协议保留两条互不替代的证据：

- 最终交付决定是否可发布；
- 原始模型表现用于说明重试和兜底依赖是否健康；延迟与成本在后续同 SHA 模型对照中采集。

## 2. 人工校准真相集

`eval/src/pilotSemanticCalibrationTruthSet.ts` 保存人工固定标签，覆盖：

- v0.7 最近四条自然边界修复和四条自然纠错；
- 继续建议、追问、回应菜单、重开决定、编造历史、缺少承认或停止、现实责任越界；
- 只修改时间、否定、说话人物或动作对象的历史最小对照。

每条标签包括是否允许最终交付、预期硬错误、质量观察和允许使用的历史证据。Judge 不参与生成或修改标签。

## 3. 交付验证

验证接口返回两个列表：

| 字段 | 作用 | 是否触发重写/兜底 |
| --- | --- | --- |
| `blockingViolations` | 禁止建议、问题、菜单、重开决定、无来源历史、未确认现实责任、缺少必要承认或停止等 | 是 |
| `qualityObservations` | 不够简短、关系动作显影弱、用户措辞保留不足、人物感弱等 | 否 |

“关系动作不够明显”仍能让关系质量评测失败，但不能单独替换一条安全自然的用户可见回复。

历史证据由结构化分析统一匹配人物、行为、对象、时间和事实状态。关键语义不同的最小反例必须被拒绝。

## 4. 生成、重试与兜底

生产与评测只使用一套 `TurnFrame → RelationshipEffect → SemanticTurnActPlan`。

- 首答无硬错误：直接交付，同时记录质量观察。
- 首答有硬错误：重试只收到动作计划与本次硬错误的修复说明。
- 重试恢复：记录 `retryRecovered=true`。
- 重试仍失败：尝试同一计划允许的安全兜底。
- 兜底也有硬错误或不存在：停止交付，不运行 Judge。

倾听、边界修复和用户纠错为林衡、夏栩、周禾、许野分别提供两条人工审过的变体。选择由人物、动作和稳定 `turnKey` 决定，并避开最近开头；其余十二位兼容人物使用中性版本。所有变体都再次经过同一硬验证器。

逐条结果明确保存：

- `originalModelScoreable`、`originalViolations`、`originalQualityObservations`；
- `retryRecovered`、`attemptsUsed`；
- `modelScoreable`、`modelViolations`、`modelQualityObservations`；
- `deliverySource`、`fallbackUsed`、`fallbackKind`、`variantId`；
- 最终 `scoreable`、`violations`、`qualityObservations`。

## 5. 发布门

`evaluationPassed` 必须从逐条 artifact 重算，并同时满足：

1. 四位人物的九个共用场景最终交付及人物评审通过；
2. 边界修复最终交付 4/4；
3. 纠错更新最终交付 4/4；
4. 关系动作最终交付和可观察差异 4/4；
5. `owner-gap-regression`、`all-pass`、`named-agent-first`、`needs-user-input`、`all-four-required` 五个房间 case 全部通过；
6. 无来源历史、现实责任和全产物表达水印硬门通过。

原始模型在某个四人动作中 0/4 不会单独否决发布；最终交付下降仍立即否决。

artifact 复用必须匹配协议、Prompt、房间版本、模型运行签名、提交 SHA 和干净评测源。门、`modelHealth` 与跨样本表达门都从逐条记录重算，不能信任手填摘要。

## 6. 模型健康

`modelHealth.blockingThreshold` 在 v0.8 固定为 `null`。记录：

- 首答通过数；
- 重试恢复数；
- 兜底次数与未恢复模型数；
- 按动作分类的兜底率；
- 首答硬错误代码分布；
- 首答质量观察代码分布。

这些 artifact 内指标用于定位模型、Prompt、检查器和兜底依赖，不直接改变 `evaluationPassed`。延迟与成本不是当前 artifact 字段，而是后续 DeepSeek/Anthropic 同条件盲对照的独立测量项。

生产 trace 只增加动作类型、尝试次数、错误/观察代码和兜底元数据，不为评测额外复制用户原文。

## 7. 验证与后续复测

本地发布前必须完成 typecheck、全量单测和 Web 生产构建。校准与 artifact 测试必须证明：

- 最近自然边界修复和纠错不再被误杀；
- 建议、追问、菜单、历史编造和责任越界仍被拦截；
- 历史最小反例不能通过；
- 首答、重试、角色化兜底和无兜底停止路径均可复现；
- 修改汇总字段不能伪造通过；
- 原始纠错模型 0/4、最终兜底 4/4 时总门仍按最终交付计算。

检查器稳定并冻结同一语义/eval SHA 后，需另获授权再用当前 DeepSeek V4 Pro 连跑三批。随后按[候选模型盲对照协议](pilot-model-comparison-protocol-v0.8.md)，以相同动作计划、样本、验证器和固定 Judge/仲裁器与 Anthropic 路径盲对照兜底率、延迟、成本和人物自然度。Claude Sonnet 5 不接受非默认采样参数，因此两组统一采用“不传采样覆盖值”的 `provider_default` 策略，而不是伪称使用了相同的数值温度。v0.8 不执行微调。
