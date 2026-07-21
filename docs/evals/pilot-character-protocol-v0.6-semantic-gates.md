# 首批正典人物组件校准协议 0.6：跨样本与语义阶段门

## 目的

本协议在 0.5 动态房间参与机制之上，修复第三轮复测发现的三个评测漏口：括号语气水印、关键场景约束被总体分数掩盖、关系解释与回复证据脱节。它仍是组件校准，不是用户盲测、生产路径回归或端到端验证。

## 固定输入

- 四位正典人物：林衡、夏栩、周禾、许野；
- 每人九个固定场景，顺序和合同不变；
- 同一输入的 R0/R1/R2 关系对照；
- 四人私有参与意向、后台逐轮仲裁和公开消息后的重判；
- 正典版本、provider、runtime、生成模型、Judge 模型、房间仲裁模型和 Prompt 装配版本写入产物。

## 阶段顺序

1. 单条机械门：叙事诚信、房间协议、C1 现金词汇、C8 已确认二分复刻、修复场景编造数量。
2. 分组表达门：人物九场景、三条关系对照或房间公开消息中过度使用括号语气/动作标签时停止评分。
3. 场景语义门：C1、修复和 C8 按固定 checkId 逐项二元检查，并验证回复逐字引用。
4. 人物总体 Judge：只有前三步全部通过才运行；平均分仍用于人物完整度，不再裁决关键场景合同。
5. 关系总评与引用验证：提出 R1/R2 相对 R0 的最小事件引用。
6. 逐事件蕴含门：每个引用事件单独验证事件使用、行为变化、信息粒度和三处逐字引用。
7. 房间化学反应 Judge：只评价发言边际价值和协作；顺序依赖、参与合法性与责任落点继续由结构门判断。
8. 整批表达门：合并 36 条人物回复、12 条关系回复和房间公开消息再次检查重复标签水印。

任何硬门或语义阶段门失败，相关总体 Judge 不运行或相关结果不能通过。`complete=true` 只表示产物执行完整；最终通过另记为 `evaluationPassed`。

## 跨样本括号语气门

- 统计回复开头的所有短括号字面标签，以及句中可识别的语气/动作式短标签（如 `（顿了一下）`）；正文说明性括号（如 `（不是反问）`）和普通标点不计入；
- 标签总量上限：`max(1, floor(sampleCount × 0.10))`；空样本为 0；
- 同一归一化标签上限：`max(1, floor(sampleCount × 0.05))`；空样本为 0；
- 超限分别报告 `literal_tone_marker_frequency_exceeded` 和 `repeated_tone_marker_watermark`。

## 场景语义合同

| 场景 | 必须全部通过的检查 |
| --- | --- |
| `quit-without-buffer` | `immediate_distress_acknowledged`、`cash_constraint_handled` |
| `repair-after-boundary-violation` | `boundary_violation_named`、`choice_restored`、`unsupported_quantity_or_history_avoided` |
| `self-judgment-after-end` | `project_end_accepted`、`self_judgment_transition_handled`、`binary_reframing_avoided`、`project_not_reopened` |

输出必须与固定检查集合完全一致；每项 `replyQuote` 至少四个字符且存在于回复原文。漏项、重复项、错误场景 ID、虚构引用或任一失败都阻断人物总体 Judge。

C1 的 `cash_constraint_handled` 接受能改变次日决定的窄问题，例如现金/基本开支能撑多久、最早进账或哪笔支出最先发生；它不要求模型在用户明确拒绝标准答案时输出离职清单。

修复场景还必须把提取项显式区分为 `past_interaction_claim` 与 `current_or_future_repair_action`。每一条既往互动声称都必须同时给出回复逐字片段与用户输入逐字来源；来源无法推出的具体原话、消息、动作、数量、步骤或时序使 `repairHistoryValidation` 失败。代码还会扫描完整回复的直接引语：无输入来源的引语只有在被明确当前/未来修复动作完整覆盖时才允许，不能通过缩短 Judge 引用或把过去原话错标成未来动作绕过。

## 逐事件关系蕴含

每个 `relationship + sourceEventId` 恰好生成一条结果，并逐字引用事件、目标回复和 R0。以下四项必须分别为 `true / true / true / false`：

- `eventUsed`
- `behaviorChangedFromR0`
- `replyEntailedByEvent`
- `addsUnsupportedSpecificity`（仅指把共同历史写得比事件更具体；当下新建议不算）

关系总评的 `eventUseExplanation` 只用于诊断，不能让上述检查通过。事件只提供“把模糊困境拆成可逆小实验”时，回复可以采用可逆实验的接话策略，但不能宣称两人以前做过某种具体职业尝试、几个方案或某件未提供的工具。

## 版本

- 评测协议：`0.6`
- Prompt 装配：`pilot-runtime-prompt-v0.5`
- 房间参与：`pilot-room-participation-v0.1`
- 生产全局 Prompt：`web-mvp-v4`
- 产物：`eval/artifacts/pilot-characters-v0.6.json`

具体架构理由见 [ADR-0012](../adr/0012-add-batch-and-semantic-evaluation-gates.md)。
