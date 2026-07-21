---
status: accepted
---

# 持久化关系事件，并以影子模式维护关系分支

## Context

生产 Memory 已有候选、确认、拒绝和删除状态，但确认后的内容此前只以最近字符串数组进入 Prompt。试点评测中的 `RelationshipBranch` 能表达边界、分歧、修复、转折和当前关系气候，却没有生产持久化，因此聊天次数增加不会自动形成事件驱动的关系状态。

关系事件机制需要在数据量扩大前建立，但尚未通过协议 0.3 和真实 Turn API 回归的新关系状态不能直接改变线上回复。

## Decision

### 三层职责

1. Memory 状态机继续作为长期信息的准入层，负责用户确认、拒绝和删除。
2. `relationship_events` 作为历史依据，保存发生过什么；事件必须绑定用户、人物和已完成的来源回合。
3. `relationship_branches` 保存由事件日志重建的当前状态快照；快照是缓存，不是唯一真相源。

当前 Prompt 继续读取已确认 Memory。关系 Branch 只在 Turn 预处理阶段影子加载，并把不含原文的版本、气候和数量摘要写入 trace，不参与人物生成、Director 或 RoomLoop。

### Memory 到关系事件的确定性投影

- `preference` → `preference_stated`
- `boundary` → `boundary_set`
- `repeated_pattern` → `pattern_confirmed`

`pattern_confirmed` 可以成为有来源的共享上下文，但不会单独提升信任或把陌生关系改成稳定关系。只有真正的 `context_shared`、共同成功、分歧或修复等关系事件才能按状态机改变对应关系维度。

事件 ID 使用 `memory:<memoryId>`，同一 Memory 重复确认不会产生重复事件，也不会无意义增加 Branch 版本。
`memory:` 是投影保留命名空间，一般关系事件不能使用；如果历史冲突记录与待投影 Memory 不完全一致，确认事务必须回滚。

### 一般关系事件

Store 提供服务端内部的追加接口，接受 `meaningful_disagreement`、`repair_attempted`、`repair_accepted`、`boundary_revised` 等完整 `RelationshipEvent`。只有属于同一用户且已经完成的来源回合可以写入。相同 ID 和相同内容幂等返回；相同 ID 的不同内容明确冲突。

状态转换继续由 Engine 的 `applyRelationshipEvent` 校验。无效修复、缺少目标张力或事件 ID 冲突会使整个事务回滚。

### 删除与重建

- 已确认 Memory 被删除时，对应关系事件一并删除，并从剩余事件重建 Branch。
- 遗忘关系依据时，相关冲突/修复依赖链一起删除；如果事件来自 Memory，对应 Memory 同时进入 `deleted`。
- PostgreSQL 对每个“用户 × 人物”使用事务级互斥锁，避免并发确认、追加或删除产生丢失更新。

### 迁移与回滚

- 数据库迁移为已有 confirmed Memory 回填关系事件。
- 迁移在回填事件后同步建立快照；正式 Turn 只读取现成快照，不获取关系写锁，也不承担懒重建。
- 正式 Turn 的影子读取有 100ms 上限；失败或超时只记录 `unavailable`，不得阻断现有生产 Turn。
- 当前不删除旧 Memory 表、不切换 Prompt，并保留完全回滚到旧读取路径的能力。

## Consequences

- “发生过什么”和“关系现在怎么样”有了不同的持久化职责。
- 关系状态可以从事件日志重放、修正和删除，不依赖不可解释的单一亲密度。
- 生产开始积累可比较的影子 Branch，但不会提前改变用户体验。
- 自动识别普通对话中的分歧、修复和共同成功仍未启用；目前只有已确认 Memory 投影和显式服务端事件写入。
- 只有协议 0.3 与真实 Turn API 回归通过后，才能讨论让 Branch 成为 Prompt 的正式关系来源。
