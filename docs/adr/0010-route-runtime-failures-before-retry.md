---
status: accepted
---

# Runtime 错误先分类，再决定是否恢复

## Context

`AgentRuntime` 已经返回 `run_error { code, message, recoverable }` 和 typed stop reason，Store 也已有 `turnId + requestHash` 幂等重放、房间版本与失败 Turn 的候选记忆清理。但是 `runRuntimeText()` 会把结构化失败压成普通 `Error`，Web 又把大多数异常统一暴露为 `TURN_FAILED + recoverable=true`。客户端在投递中断后同时提供刷新和新建 Turn 的“重新生成”，因此服务端已经提交、只是 `completeTurn()` 提交确认或终态事件丢失时，用户可能创建重复回复和候选记忆。

旧实施计划中的“Pi 执行失败最多重试一次”也把目标写成了现有能力，并且没有区分取消、无效输入、版本冲突、截断、瞬态故障和未知提交状态。

## Decision

### 保留结构化失败

`runRuntimeText()` 以 `RuntimeExecutionError` 保留底层错误码、`recoverable`、stop reason 和是否出现过部分文本。Runtime 流没有 `run_end` 时视为失败；即使已有 delta，也不能冒充完整业务结果。

### Harness 拥有恢复动作

统一恢复动作只有四种：

- `retry`：已确认失败且底层错误可恢复；当前只向用户提供重新发起，不自动循环。
- `transform`：原条件不变必然再失败，例如 `max_tokens` 或上下文过长；当前要求用户修改后再发，自动缩短后重试仍后置。
- `refresh`：房间版本已变化，或客户端无法确认原 Turn 是否提交。
- `stop`：用户取消、无效输入、权限/配置错误、幂等冲突或预算耗尽。

`recoverable` 只是 Runtime 提示。用户取消、未知副作用、结果确定性和预算可以覆盖该提示；本决策不引入统一“重试一次”，也不启用静默备用模型。

### 结果未知时复用原 Turn

客户端保存原始 `turnId` 与 `roomVersion`。网络中断、提前 EOF、缺少响应流或 `completeTurn()` 提交结果不确定时，恢复按钮使用完全相同的 Turn 请求查询或重放；结果仍未知期间，普通发送入口必须保持关闭：

- 已完成：Store 返回持久化事件，恢复原结果；
- 仍在运行：返回 `TURN_IN_PROGRESS`，继续刷新而不新建 Turn；
- 已失败：返回 `TURN_FAILED`，此时才允许新建 Turn；
- 房间版本冲突：刷新权威房间状态，把原文本还给用户重新确认。

### 文档状态必须显式

JSON 解析重生成、反模板重生成、失败原子性和 Turn 重放属于已实现能力。429/瞬态 5xx 自动退避、`max_tokens` 自动压缩/续写以及模型 fallback 仍是未实现能力，文档不得把它们描述成当前行为。

## Consequences

- Web 可以给不同失败展示不同恢复入口，取消不再显示为可自动恢复。
- 投递终态丢失不会直接制造第二个回复或第二个 Memory 候选。
- Runtime、Harness、Store 和客户端各自职责更窄：Runtime 描述失败，Harness 选动作，Store 提供权威状态和幂等，客户端执行指定恢复入口。
- 当前仍没有自动 transport retry；以后新增时必须同时定义错误白名单、副作用条件、最大次数、总耗时、token、成本和质量预算。

## Validation

- Engine 测试覆盖结构化错误保留、无终态流失败、四类恢复动作、取消优先和未知结果优先刷新。
- Web Client 测试覆盖 400/409/429 映射、`Retry-After`、提前 EOF、投递消费者异常和空响应流。
- Store 既有测试继续覆盖同 Turn 重放、幂等冲突、失败候选记忆清理和陈旧 Turn lease 恢复。
