# v0.8 候选模型盲对照协议

> 状态：冻结后执行
> 对象：`deepseek-v4-pro` 与 `claude-sonnet-5`
> 发布协议：[最终交付质量与模型健康 v0.8](pilot-character-protocol-v0.8-delivery-quality.md)

## 1. 目的

本对照只回答一个问题：在最终交付质量不下降时，替换人物候选模型能否明显减少重试和角色化兜底，并在人物自然度、延迟和成本上形成可接受的交换。

它不改变 v0.8 发布门，也不把原始模型健康重新变成阻塞阈值。

## 2. 冻结条件

两组运行必须满足：

- 同一 Git SHA，且 `eval`、`packages/engine`、评测文档和协议源干净；
- 同一九类人物场景、关系探针、房间 case、动作计划和硬验证器；
- 每个候选模型连续运行三批；
- 候选模型之外的 Judge 与房间仲裁器固定为 DeepSeek V4 Pro；
- 候选模型和控制模型都关闭思考模式；
- 候选生成统一采用 `provider_default`：两边都不传 `temperature`、`top_p` 或 `top_k`。

最后一条是当前跨模型可执行的共同采样策略。Claude Sonnet 5 会拒绝非默认采样参数，因此不能把 DeepSeek 的 `1.25 / 0.7 / 0.2` 数值原样传给它。artifact 必须把三个温度字段记为 `null`，并记录 `candidateSamplingPolicy=provider_default`，不得把它描述成“数值温度完全相同”。

## 3. 固定角色

| 角色 | DeepSeek 批次 | Anthropic 批次 |
| --- | --- | --- |
| 人物候选生成、房间私有意向、房间公开回复 | `deepseek/deepseek-v4-pro` | `anthropic/claude-sonnet-5` |
| LLM Judge | `deepseek/deepseek-v4-pro` | `deepseek/deepseek-v4-pro` |
| 房间仲裁器 | `deepseek/deepseek-v4-pro` | `deepseek/deepseek-v4-pro` |

Judge 和仲裁器不是候选模型的一部分。固定它们是为了避免“换了选手，也换了裁判”。

## 4. 自动比较

每批 artifact 必须保留：

- 最终 `evaluationPassed`；
- 56 条人物/关系交付的首次通过、重试恢复、兜底和未恢复数量；
- 按动作分类的兜底率；
- 首答硬错误和质量观察代码分布；
- 候选、Judge、仲裁器各自的调用数、token、逻辑调用平均/P50/P95 延迟；
- 按 2026-07-27 官方单价估算的候选调用成本。

成本只用于同批工作量比较，不代替服务商账单。DeepSeek 使用官方 USD cache-hit/cache-miss/output 单价；Claude Sonnet 5 使用 2026-08-31 前的官方 introductory pricing。

## 5. 隐藏来源人工盲审

自动脚本生成：

- 不含来源信息的 HTML：只展示人物、用户输入、回复和自然度/人物感 1–5 分；
- 单独保存的来源 key：评审结束前不打开；
- 所有发生兜底的“原始失败/最终兜底”成对样本，以及每个候选模型确定性抽取的原始通过样本。

人工评审只判断人物感和自然度，不重新裁决硬错误。硬错误仍由冻结真相集和验证器负责。

## 6. 路由或默认模型候选门

替代模型只有同时满足以下条件，才进入关键动作路由或默认模型讨论：

1. 三批最终发布门均不低于 DeepSeek；
2. 汇总兜底次数至少减少 3 次，并且兜底率相对降低至少 30%或绝对降低至少 5 个百分点；
3. 隐藏来源盲审的自然度与人物感均未出现超过 0.25/5 的平均退化；
4. 延迟和成本变化被明确披露并可接受。

不满足这些条件不等于模型不可用，只表示本轮证据不足以支持切换生产默认值。
