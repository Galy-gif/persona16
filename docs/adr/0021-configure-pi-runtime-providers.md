---
status: accepted
---

# 通过配置切换 Pi Runtime 供应商

## Context

人物发言已经通过 `@persona16/runtime-pi` 执行，但默认模型注册表此前只注册 DeepSeek。引擎虽然允许 `PERSONA16_PROVIDER=anthropic`，未显式回退到 legacy 时，Pi Runtime 无法解析 Anthropic 模型；供应商配置因此没有形成端到端能力。

如果在人物、房间或 Web 路由里分别判断供应商，新增供应商会把鉴权、模型目录和调用差异泄漏到产品流程中，也会让配置错误产生不一致行为。

## Decision

- `PERSONA16_PROVIDER` 是应用级供应商选择入口，当前接受 `deepseek` 和 `anthropic`。
- 两家供应商的人物生成默认都使用 Pi Runtime；`PERSONA16_RUNTIME=legacy` 保留为显式回滚开关。
- Pi Runtime 内部注册 DeepSeek 与 Anthropic 的 Pi provider，由 `{ provider, id }` 解析具体模型；调用方只依赖统一的 `AgentRuntime` 合同。
- 未设置供应商时继续按现有规则推断：存在 `DEEPSEEK_API_KEY` 时使用 DeepSeek，否则使用 Anthropic。
- 显式写入不支持的供应商时立即报错，不再静默回退到其他供应商。
- Director 和 Judge 的结构化调用暂时保留在引擎模型适配层，并跟随同一个应用级供应商选择。

## Consequences

- 在 DeepSeek 与 Anthropic 之间切换不再需要改代码，也不会绕过 Pi Runtime 的事件、超时、取消和预算合同。
- 供应商能力被收敛在 Runtime/模型适配模块内，人物与房间流程不感知 SDK 差异。
- 当前不支持同一请求链路内混用多家供应商，也没有承诺 Pi 依赖中所有 provider 都可用于产品；新增供应商仍需明确注册、默认模型、鉴权、结构化控制和回归测试。
- 切换供应商会改变模型行为、成本与延迟，发布证据必须记录供应商、模型和 Prompt 版本，不能把一家的评测结论直接外推到另一家。
