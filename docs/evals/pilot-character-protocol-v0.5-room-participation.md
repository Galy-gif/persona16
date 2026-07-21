# 首批正典人物评测协议 0.5：动态房间参与

> 日期：2026-07-21
> 范围：只替换四人 pilot 的房间参与与责任校验；九个人物场景及生产 Room Loop 暂不迁移。
> 实现：`eval/src/pilotRoomParticipation.ts`、`eval/src/pilotCharacters.ts`
> 评测层级：**组件校准**；不是生产路径回归或端到端验证。
> ADR 范围：本协议替代 ADR-0009 中协议 0.4 的房间预检部分；人物场景、关系与 Prompt 装配仍沿用 ADR-0009。它不修改 ADR-0002 的生产有限 Room Loop。

## 为什么从 0.4 升到 0.5

协议 0.4 的房间预检固定按 `ENFP → ESTP → INTJ → ISFJ` 生成，并要求 INTJ、ISFJ 必须发言。它只能验证强提示下能否串联，无法验证谁先说、发言后是否会改变其余人物的判断，也会把人数上限误用成沉默规则。

0.5 将问题拆成三层：

1. 正典人物私下提交房间参与意向 `speak | brief_addition | pass`，同时声明新增主张和所回应的已有消息。
2. 房间仲裁器只在合格意向之间比较边际价值，一次授权一条公开发言；每次发言后，剩余正典人物全部重判。
3. Room Policy 负责消息依赖、身份边界、结构化责任证据与预算停止，不替正典人物决定观点。

## 单轮执行合同

```text
剩余正典人物并行提交房间参与意向
→ 硬过滤无主张 / 非法 targetMessageId / 身份不匹配
→ 无合格意向：no_eligible_intent
→ 房间仲裁器选择一位合格正典人物
→ 正典人物生成一条结构化公开消息
→ 硬检查叙事、目标消息、现实责任证据
→ 写入 transcript
→ 剩余正典人物重新判断
```

本轮不设沉默人数或固定必说人物。四人都仍有独特价值时允许四人发言；全部 pass 时允许零条公开消息。`maxVisibleActs=4` 只是一轮最多每人一次的预算保险丝，另有 assessment round、时长和字符预算。触发保险丝记录 `budget_exhausted`，不得记成自然沉默。

## 发言顺序的确定性边界

- `targetMessageId` 只能引用已经进入 transcript 的消息；未来消息在仲裁前直接失格。
- 一次只能选一个当前合格意向；Room 返回不合格 Agent 时记 `invalid_arbitration`。
- 公开消息的 `respondsToMessageId` 必须与被选 intent 的目标完全一致。
- 每位正典人物在当前用户轮最多公开发言一次；发生公开发言后，剩余正典人物必须看到新 transcript 再判断。
- 不规定唯一正确的完整顺序；以消息依赖形成的偏序、首位有效性和后续边际价值评测顺序质量。

## 沉默的处理

`pass` 是正典人物的私有动作，不生成 `【沉默】` 等用户可见文本。单个样本只记录判断与最终发言事实；沉默比例只能在多样本按场景聚合，用于识别人人必答、长期霸麦或长期失语，不能作为单轮配额。

## 现实责任的身份边界

维护、回滚、停止决策与交接使用结构化 `ResponsibilityClaim`：

- `activity`：现实活动类型；
- `ownerKind`：`user | named_person | organization_role | unassigned | persona_agent`；
- `ownerSubjectId`：来自责任主体注册表的稳定 ID；任意自由文本或未注册的“Room Controller”别名都不能成为 owner；
- `status`：`observed | proposed | confirmed`；
- `statementQuote`：当前回复中这条责任陈述的逐字片段；
- `evidenceQuote + sourceMessageId`：可回查的事实来源。

确定性硬门包括：

- 正典人物或房间仲裁器作为现实 owner 直接失败，即便它被错误包装成 `named_person` 或 `organization_role`；
- owner 不在主体注册表、quote 为空或 source 无法回查时失败；
- 本场景明示无人认领，因此任何 `confirmed` owner 失败；
- 回复中检测到的每种责任归属 activity（如“谁负责”“谁有权”“指定谁”“责任仍空缺”）都必须逐项覆盖；普通流程讨论如“先定义停止条件”本身不算责任归属。一条维护声明不能掩盖同条回复中未建账的回滚、停止决策或交接；每个 `statementQuote` 也必须存在于当前回复；
- 只有当 `evidenceQuote` 在当前可见来源中唯一匹配时，系统才可确定性纠正错写的 `sourceMessageId`；零匹配或多匹配仍失败；
- Judge 不再自由计算 `responsibilityTransferCount`。

房间仲裁器是后台秩序组件，不是正典人物，也不是现实项目负责人。正典人物可以指出“还缺现实维护负责人”，或建议用户团队指定一个真实的人/组织角色，但不能替现实团队确认人选。

## 判定与报告

代码直接报告：

- `stopReason`：自然停止、预算停止或结构失败；
- `speakingCount`：实际公开发言数；
- `explicitDependencyCount`：具有合法 `respondsToMessageId` 的显式消息依赖数；它不单独证明语义上真的回应了前文；
- `ResponsibilityClaim[]`，以及按 `messageId → claimIndex → fieldErrors` 保存的逐声明、逐字段验证结果；
- 每轮 private intents、失格原因与 Room 选择理由。

语义 Judge 只负责无法靠字符串规则确定的部分：首位是否有用、哪些真实消息没有新增价值、是否漏掉必要视角、是否形成并列作文、共享正典是否可见。Judge 引用的消息 ID 也必须存在，否则结果不通过。全体合法 `pass` 时首位与共享正典可见性均为不适用；只要没有漏掉必要视角或其他关键失败，零公开消息可以通过。

## 0.5 的边界

- 这是隔离 pilot，不证明生产 Room Loop 已具备相同能力。
- 单一上线场景不足以估计 pass precision/recall 或沉默分布；下一步需要点名、观点覆盖、角色暂停、1 人必要与 4 人都必要等反事实场景集。
- 当前一轮每位正典人物最多发言一次；多轮追问与同一人物二次发言留待后续协议。

## 2026-07-21 room-only 冒烟结果

使用当前默认模型执行 `pnpm eval:pilot-characters -- --room-only`：

- 动态顺序：林衡 → 许野 → 周禾；夏栩在每次 transcript 更新后都重新判断并最终 pass。
- 公开发言 3 条，合法逐事件回应 2 条；停止原因是 `no_eligible_intent`，不是预算耗尽。
- 所有 private intent、Room 选择理由、`respondsToMessageId` 与责任证据均进入本地 `pilot-characters-v0.5.json` 产物。
- 结构硬门无错误；语义 Judge 未发现无效发言、漏掉的必要人物、并列作文或关键失败，当前单场景预检通过。

第一次冒烟曾因责任声明引用用户原话、但账本只有人物消息 ID 而被拒绝。协议随后加入只读 `user-1` 证据源；这保留了逐字引用门，而没有放宽验证。另一次冒烟暴露“默认我会接手维护”会把正典人物假设成现实团队成员，现已加入 `persona_real_world_role_assumption` 硬门。

该结果只证明 0.5 的执行链路和当前单场景能够运行，不替代多场景顺序与 pass precision/recall 评测。
