---
status: accepted
---

# 生产对话默认启用 DeepSeek 思考模式

## Context

生产对话当前使用 `deepseek-v4-pro`。人物文本经 Pi Agent Runtime 生成，Director、安全分类和部分结构化控制经模型调用层生成。此前两条路径都显式关闭思考：

- Pi Runtime 把 `thinkingLevel` 固定为 `off`；
- DeepSeek 文本与 JSON 请求固定发送 `thinking.type = disabled`。

这使生产对话无法使用 DeepSeek V4 Pro 的默认推理能力，也让人物回复和 Director 共享同一个非思考限制。

## Decision

- Pi Agent Runtime 的生产默认思考等级改为 `high`。
- DeepSeek 文本与 JSON 调用在未指定 `thinkingMode` 时显式发送 `thinking.type = enabled`。
- 思考模式下不发送 `temperature`；DeepSeek 官方协议不支持思考与温度采样同时生效。
- 显式传入 `thinkingMode: disabled` 时继续关闭思考并保留原有温度行为，供固定条件的评测和控制模型使用。
- 思考内容只在模型内部参与生成，不作为人物可见回复交付给用户。

## Consequences

- 生产人物回复、Director 和安全分类可以使用 DeepSeek V4 Pro 的思考能力。
- 单轮延迟与输出 token 成本可能上升，必须通过生产 trace 和同条件评测观察，不能仅凭单次主观体验判断收益。
- 既有标记为“非思考模式”的评测产物仍是有效历史证据，但不能直接代表当前生产配置。
- 当前试点评测继续显式使用非思考模式；若要评价本次生产变更，需要另建同 SHA、同场景的思考模式对照批次。
