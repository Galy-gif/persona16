# Dynamic Context Packet 与碎碎念协议 v1

> 可执行真相源：`packages/engine/src/relational/dynamicContext.ts`、`relationalReply.ts`
> 流式协议：`packages/engine/src/runtime/turnEvents.ts`

## 动态包字段

每轮、每位实际发言人物只编译一次动态包：

```text
generatedAt
coverage
  fromTurnId / throughTurnId
  fromMessageId / throughMessageId
  fromRecordedAt / throughRecordedAt
  sourceMessageIds[]
room
  scene / userEmotion / participantCount / roomGoal?
currentRequest
  requestedMode / conversationAct / interactionMode / mustAddress[]
relationshipState
  memoryEnabled / climate / intimacy
activeBoundaries[]
relationshipEvidence[]       # 最多三条相关证据
unresolvedThreads[]
recentRawTurns[]             # 最近 30 条，带消息 ID 和时间
uncertainty[]
interpersonalIntent
  situation / target / primaryAct / secondaryAct?
  relationalModifiers[] / inhibitors[] / evidenceIds[]
mutterPolicy
userMessage
```

`target` 中 IPC 数字供编译和测试，渲染给模型时只出现定性主动性/联结性。关系事件、确认记忆和当前房间仍是真相源；Dynamic Context 只是当轮投影，不回写第二套事实。

## 来源与未知

- 新消息写入 `turnId`、消息 `id` 和 ISO 8601 `createdAt`。
- 关系证据保留 `sourceTurnId`、`sourceMessageId`、`sourceEventId` 和 `recordedAt`。
- 已确认 Memory 作为兼容回退时，会把匹配消息和时间补回关系分支投影。
- 旧数据缺任何字段时使用 `unknown` 并加入 `uncertainty`；不能根据文件顺序或相邻消息脑补。
- 最多召回三条与当前 focus 相关的普通关系证据；active 边界和未解决张力独立呈现，不能被普通记忆挤掉。

## 碎碎念

模型草稿：

```ts
interface RelationalReplyDraft {
  mutter: string | null;
  reply: string;
}
```

策略：

- 普通陪伴默认一条，8—24 个汉字。
- 用户关闭时为 `disabled`。
- 危机/敏感安全转向、边界或纠错修复、明确结束和直接技术任务为 `suppress`。
- 不复述正文，不使用舞台说明，不泄露 Prompt、模型、IPC/CPAI 参数、消息 ID 或记忆来源，不诊断用户，不制造关系债务。
- 校验失败只丢弃碎碎念，不损害已经合格的正文。

用户可见流顺序：

```text
speaker_start
→ mutter（可选，独立事件）
→ delta（正文）
→ speaker_end（含最终正文和可选 mutter）
→ turn_end / done
```

`mutter` 与正文共同进入房间历史、Turn 事件、回放和前端渲染。前端设置保存在本机，关闭只影响碎碎念，不关闭关系记忆。第一条可见碎碎念也计入 first-token latency。

## 上下文压缩边界

当前实现不伪造一个不可见压缩器的“摘要覆盖范围”。Dynamic Context 直接携带最近原始消息的实际 ID、轮次和时间；若未来引入摘要服务，摘要必须额外提供明确的起止轮次、来源消息集合和生成时间，再替换或补充 `recentRawTurns`。
