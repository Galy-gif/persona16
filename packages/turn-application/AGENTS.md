# Turn Application Agent 约定

本文件适用于 `packages/turn-application/**`，并继承仓库根 `AGENTS.md`。

## 边界

- 本包拥有一次 Turn 从幂等查询到可信终态的应用执行闭环。
- 对外保持一个深 Interface：构造时注入 Store、Runtime 与配置，调用时只接收用户上下文、Turn 请求和取消信号。
- HTTP、Cookie、NDJSON 字节编码属于 Adapter，不得进入本包。
- Engine 仍拥有人物、Prompt、安全与交付规则；Store 仍拥有事务、并发和持久化实现；本包只负责编排。
- 任何异常都必须保留 `known_failed` 与 `unknown` 的差异，不能在提交结果未知时创建新 Turn。

## 验证

- 类型检查：`pnpm --filter @persona16/turn-application typecheck`。
- Interface 行为由本包测试和 Web Route 测试共同覆盖；涉及跨模块契约时运行 `pnpm test`。
