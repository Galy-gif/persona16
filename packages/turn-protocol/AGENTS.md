# Turn Protocol Agent 约定

本文件适用于 `packages/turn-protocol/**`，并继承仓库根 `AGENTS.md`。

## 边界

- 本包是 Web、Store、评测与原生客户端之间 Turn v1 wire contract 的真相源。
- 只定义请求、事件、可信终态和恢复元数据；不执行人物规则、模型调用、HTTP 编码或持久化。
- 协议变更必须保持版本可辨认，并同步 `contracts/turn-v1/` fixture 与 Swift 解码测试。
- `done` 与 `error(outcome=known_failed)` 是可信终态；`outcome=unknown` 必须保留原 Turn 查询或重放。

## 验证

- 类型检查：`pnpm --filter @persona16/turn-protocol typecheck`。
- 跨语言 fixture：运行全仓测试和 iOS `ProtocolFixtureModelTests`、`NDJSONStreamDecoderTests`。
