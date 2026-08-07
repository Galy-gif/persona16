# Engine Agent 约定

本文件适用于 `packages/engine/**`，并继承仓库根 `AGENTS.md`。

## 边界

- Engine 是产品规则和公开领域契约的真相源：人物生成上下文、语义框架、关系动作效果、对话动作计划、房间循环、安全、恢复和交付门都在这里定义。
- 保持 Engine 与 HTTP、React、PostgreSQL 和具体 Pi SDK 解耦。外部能力通过类型、接口或注入的 Runtime/Store 边界进入。
- 确定性硬门优先于模型评分。权限、边界修复、叙事诚信、房间预算、停止条件和交付硬错误不得退化成 Prompt 文本。
- 人物是稳定核心、运行时动态状态和语气采样的组合；潜在人物倾向默认休眠，不能改回每轮固定扫描或口癖模板。

## 修改要求

- 新增公开能力时从 `src/index.ts` 或明确的 package export 导出，并同步下游调用方。
- 修改 `TurnFrame`、关系投影、`SemanticTurnActPlan`、Runtime 事件或恢复动作时，检查 Web、Runtime、Store 和 Eval 的所有消费者。
- 纯规则优先写成无副作用、可重复的函数；模型输出先解析和验证，再进入领域状态。
- 测试应覆盖正常路径、拒绝/停止路径、边界值和模型返回无效结构的路径。

## 验证

- 类型检查：`pnpm --filter @persona16/engine typecheck`。
- Engine 测试由根目录 `pnpm test` 执行，测试文件位于 `packages/engine/test/`。
- 触及跨模块类型、Prompt、房间或交付门时运行完整 `pnpm test`，必要时再运行对应评测协议。
