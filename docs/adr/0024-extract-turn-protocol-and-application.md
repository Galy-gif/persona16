# 提取 Turn Protocol 与 Turn Application 深 Module

- Status: Accepted and implemented
- Date: 2026-08-07

## 背景

Turn v1 已同时被 Web、原生 iOS、Store 和评测消费，但完整 wire contract 分散在 Engine 的 `TurnStreamEvent`、Store 追加的 `done` 类型、Web 的 Zod 请求 schema 与 HTTP 恢复映射中。Web Harness 的 `prepareTurn()` 和 `executeTurn()` 还共同承担幂等、限流、关系投影、安全、Engine 调用、流式事件、观测、记忆候选和原子提交。新增事件或恢复语义时，调用方必须理解这些文件之间的顺序约束。

## 决策

1. 新增 `@persona16/turn-protocol`，作为 Turn 请求、完整事件联合、可信终态与恢复元数据的真相源。Engine 可继续声明运行时事件子集，但 Store 不再扩展 wire contract。
2. 新增 `@persona16/turn-application`，以 `createTurnApplication(...).execute(...)` 作为外部 Interface，隐藏从幂等查询到可信终态的完整应用执行流程。
3. Turn Application 构造时注入 Store、Runtime 与配置；单次调用只接收用户 ID、客户端 IP、Turn 请求和取消信号。
4. Turn Application 只依赖 Store 的窄能力 Interface。PostgreSQL 与 InMemory Adapter 继续实现现有 `PersonaStore`，本次不拆数据库实现或迁移 schema。
5. Web Route 只保留 JSON/Cookie/IP Adapter 与 NDJSON 编码。HTTP `Response`、Header 和字节流不进入 Turn Application。
6. 成功 `done` 必须在 `completeTurn()` 原子提交成功后投递。提交确认或事件消费者状态不确定时仍返回 `outcome=unknown`，客户端必须保留原 Turn 刷新或重放。
7. 关系投影和持久化 delta 合并属于 Turn Application 的内部 seam；测试可以在包内验证，但不会扩大其外部 Interface。

## 后果

- Web、Store 和跨语言 fixture 对完整 Turn contract 使用同一类型来源。
- 删除 Turn Application 后，幂等、限流、安全、关系、执行、持久化与恢复复杂度会重新散落到 Adapter，因此该 Module 提供真实 Depth 与 Locality。
- Web Route 不再决定恢复动作或原子提交顺序，新增其他传输 Adapter 时无需复制应用规则。
- `@persona16/turn-protocol` 当前仍复用 Engine 的领域类型；若未来出现独立部署或协议生成需求，再评估下沉零依赖 DTO，避免本次扩大迁移。
- 这次提取不改变 PostgreSQL schema、Turn v1 事件形状、iOS pending/replay 语义或人物生成规则。

## 替代方案

- 只拆分 Web 文件：改动较小，但跨客户端协议真相源仍然分散。
- 全面事件溯源：能统一更多状态，但当前没有足够的查询、回放或分布式执行需求来承担迁移成本。
