# Store Agent 约定

本文件适用于 `packages/store/**`，并继承仓库根 `AGENTS.md`。

## 边界

- Store 负责服务端拥有的状态、幂等 Turn、消息、关系事件/投影、确认式记忆、反馈、限流和 Trace 持久化。
- Engine 类型是领域契约；Store 可以持久化和重建它们，但不能私自改变语义或另建第二套关系事实。
- 内存 Store 是本地开发/测试替身。生产环境数据库不可用时必须失败关闭，不能静默降级到内存 Store。
- 任何状态写入都要考虑重复请求、并发、事务边界、部分失败和重放。

## 数据库与迁移

- Schema 变化同步修改 `src/schema.ts`、Store 实现、迁移、导出类型和测试。
- 已共享或已部署的迁移文件视为不可变；新增顺序迁移，不要重写历史 SQL 来伪装最新状态。
- 不执行未经用户明确授权的数据删除、回填或生产迁移。先说明目标、范围、回滚和验证方式。
- 测试和日志不得输出数据库连接串、Session Secret 或用户私密原文。

## 验证

- 类型检查：`pnpm --filter @persona16/store typecheck`。
- 内存 Store 测试：`pnpm --filter @persona16/store test`。
- PostgreSQL 集成测试：设置专用测试库的 `PERSONA16_TEST_DATABASE_URL` 后运行 `pnpm --filter @persona16/store test:postgres`；禁止指向生产数据库。
- 变更公共 Store 契约时还需运行根目录 `pnpm test`。
