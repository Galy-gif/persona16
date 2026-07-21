# 多 Agent 房间的发言选择与秩序：persona16 协议 0.4 后续研究

> 日期：2026-07-21
> 范围：四人房的发言意向、发言顺序、沉默、终止与现实责任主体。
> 资料口径：外部结论只使用论文、标准或框架官方文档/源码；`Learn Claude Code` 仅用于映射 Harness / Loop 分层，不作为多人房调度的事实依据。

## 结论

协议 0.4 的第四类问题不应全部归为“房间管理错误”，它至少包含三个相互连接但职责不同的层：

1. **人物参与策略**：每个正典人物私下判断自己是否有必要说、准备新增什么、回应哪条已发生的发言；这是人物参与能力。
2. **房间仲裁与秩序**：房间仲裁器汇总人物意向，执行点名、暂停、安全、预算、去重和顺序约束，最终只授权一位人物发言或终止；这是房间能力。
3. **现实责任建模**：维护、收尾、停止决策等任务属于用户现实世界中的人或组织角色，不能自动落到正典人物或房间仲裁器；这是领域状态和证据问题，不是选谁发言的问题。

最适合 persona16 的不是“房间替所有人物判断”或“人物自由抢话”二选一，而是：

> **Agent 提交 private intent（包括 pass），Room 做最终 arbitration；每次公开发言后重新检查剩余意向，直到没有新增价值。**

这类似 FIPA Contract Net 中参与者可以 `propose/refuse`、管理者再选择一个、多个或不选择任何提案的分工，而不是参与者自己决定谁获得执行权。[FIPA Contract Net Interaction Protocol](https://www.fipa.org/specs/fipa00029/SC00029H.html)

## 一手来源带来的关键发现

### 中央选择、轮询、交接是不同协议

- AutoGen `SelectorGroupChat` 由共享上下文、人物名称和描述选择下一位发言者；每次发言后检查终止条件，再重复选择。它还支持自定义候选函数和选择函数。这是**中央动态选择**。[AutoGen SelectorGroupChat](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/selector-group-chat.html)
- Microsoft Agent Framework 的 Group Chat 用中央 `GroupChatManager` 控制下一位参与者和终止；官方同时提供 round-robin、prompt-based 和自定义选择。其调用顺序先检查用户输入与终止，再选下一位，说明“谁说”和“何时停”同属编排层但应是两个判断。[Microsoft Agent Framework Group Chat](https://learn.microsoft.com/en-us/agent-framework/workflows/orchestrations/group-chat)
- AutoGen `Swarm` 不用中央 selector，而由当前 Agent 产生 handoff，下一位根据最近的 `HandoffMessage` 接手。这是**局部自主交接**，适合客服专家路由；但它让当前说话者拥有很强的后继选择权，不适合直接作为 persona16 社交房间的唯一秩序机制。[AutoGen Swarm](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/swarm.html)
- OpenAI Agents SDK 也把 handoff 表示为工具调用，可携带结构化 reason / priority 等元数据；工具调用只表达“建议把控制交给某 Agent”，实际执行仍由 runtime 完成。[OpenAI Agents SDK Handoffs](https://openai.github.io/openai-agents-python/handoffs/)
- Round-robin 只保证可预测和公平轮换，不判断发言是否有新增价值。它适合作为测试基线或固定工作流，不适合作为 persona16 的目标体验。[AutoGen Teams API](https://microsoft.github.io/autogen/stable/reference/python/autogen_agentchat.teams.html)

### 投票、打分和竞价不等于同一件事

- Anthropic 将 voting 放在并行化工作流中：多次运行同一任务，再聚合结果。它更适合答案选择或风险筛查，不天然给出多人对话的下一位说话者。[Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- `score/selector` 通常由一个全局观察者比较所有候选，优点是同一标尺、成本较低；缺点是中央模型可能替人物想象“它想不想说”。persona16 当前就是这种模式。
- `bid/refuse` 让每个参与者先表达自己愿不愿参与以及准备提供什么，再由管理者比较。FIPA 标准明确允许参与者提交 proposal 或 refuse，管理者可接受一个、多个或零个。这与 persona16 所需的“人物有自由度、房间有秩序”最接近。[FIPA Contract Net Interaction Protocol](https://www.fipa.org/specs/fipa00029/SC00029H.html)
- 多 Agent debate 并不天然优于更简单的采样/集成方法，而且对协议参数敏感，因此不能把“让更多 Agent 都说话”当成质量保证。[Should we be going MAD?](https://proceedings.mlr.press/v235/smit24a.html)

### 终止条件是保险丝，不是发言配额

AutoGen 在每位 Agent 响应后调用终止条件，并允许把内容完成、最大消息数、token、超时、外部停止等条件组合。Google ADK 的 Loop Agent 同样把 `max_iterations` 明确作为防无限循环的 safety rail，同时允许子 Agent 主动 `exit_loop`。[AutoGen Termination](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html)、[Google ADK multi-agent codelab](https://codelabs.developers.google.com/codelabs/production-ready-ai-with-gc/3-developing-agents/build-a-multi-agent-system-with-adk)

因此，发言人数上限可以保留为最坏情况下的成本、延迟和无限循环保护，但不应解释成“每轮必须让一个人沉默”。

### 结构与即兴需要同时存在

Google Research 的 DialogLab 将人物、群组结构、turn-taking rules、脚本与可控即兴分别建模，说明多方人物对话不是只靠一个大 Prompt 自发涌现，也不是只能用固定剧本。[DialogLab](https://research.google/pubs/dialoglab-authoring-simulating-and-testing-dynamic-group-conversations-in-hybrid-human-ai-conversations/)

Anthropic 同样区分预定义代码路径的 workflow 与模型自行决定过程的 agent，并建议按任务组合两者。这支持 persona16 采用“确定性房间边界 + 模型参与意向”的混合设计。[Anthropic, Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

## 沉默 decision 与沉默 ratio 不是同一层

二者描述的是同一个现象，但用途不同：

| 概念 | 所在层 | 含义 | 应否作为硬规则 |
| --- | --- | --- | --- |
| `pass / silent` decision | 单个 Agent、单个时刻 | 我现在没有独特且合适的贡献，主动不竞标 | 是，作为合法 private intent |
| realized silence | 单轮结果 | 某个 Agent 最终没有获得发言权，可能因主动 pass，也可能因 Room 选了别人 | 记录事实，不规定人数 |
| silence ratio | 多场景评测 | 跨样本观察人人必答、长期霸麦或长期失语等退化 | 只作诊断/回归指标，不作单轮配额 |

如果四人房设置 `maxSpeakers=3`，无论内容如何都有一位必须沉默；它测不到 Agent 是否真的会判断“我没有新增价值”。相反，如果每轮规定至少一人沉默，同样会压掉四个都确有不同贡献的少数场景。

建议：

- 不设低于在场人数的语义发言上限；四人房允许 1–4 人发言。
- 保留 `maxVisibleActs`、总 token、总字符、总时长和 controller 调用次数，名称和 stop reason 明确表示 **budget guard**。
- 正常终止优先依赖 `no_eligible_intent`、`no_new_value`、`goal_satisfied`、`needs_user_input`；正常样本不应频繁撞到 budget guard。
- 沉默率只在多个场景上分场景报告，不能设成“每轮 25%”。

## Agent private intent 与 Room arbitration

### 正典人物负责什么

正典人物应看到当前用户消息、已发生的房间发言、正典人物核心与房间情境镜头，然后私下输出房间参与意向；未来若引入私有关系上下文，也只能投影与当前事件有关的窄上下文包：

```ts
type ParticipationIntent = {
  agent: AgentId;
  decision: 'speak' | 'brief_addition' | 'pass';
  contributionKind?: 'new_frame' | 'challenge' | 'clarify' | 'support' | 'synthesize';
  targetMessageId?: MessageId;
  claimSummary?: string;
  passReason?: 'covered' | 'irrelevant' | 'unsafe' | 'insufficient_evidence' | 'not_my_place';
};
```

它负责：

- 判断话题是否撞上自己的注意力、价值冲突和关系位置；
- 判断自己能新增什么，而不只是“我有多想说”；
- 指向已经存在的 `targetMessageId`，表达补充、反驳或追问依赖；
- 在没有新增价值、证据不足或此刻不该介入时 `pass`。

不要让每个 Agent 单独输出一个可直接横向比较的 0–100 自评分。不同人格的主动性和模型校准会让数字失真；Agent 应提交可核对的提案，Room 用共同标尺评分。

### 房间仲裁器负责什么

Room 对所有 intent 做全局仲裁：

- 硬过滤：不在场、暂停、安全旁路、重复发言、非法目标消息；
- 确定性优先：用户点名、直接提问、必要安全响应；
- 全局比较：相关性、边际新增价值、对已说内容的回应关系、紧迫度、重复风险；
- 一次只授权一个 visible act，写入 transcript 后再判断下一步；
- 没有合格提案时停止，不为了凑人数继续；
- 保留预算保险丝，但不利用人数上限制造沉默。

人物可以提出 `yieldToAgentId` 或在公开话语中自然邀请别人，但这只是建议，不能强制另一人物发言。最终 speaker selection 必须由 Room 批准，这避免当前说话者无限串联朋友或绕过暂停/安全边界。

### 顺序如何获得逻辑性

顺序不需要唯一固定答案，但需要可验证的偏序关系：

- `targetMessageId` 必须已经出现；不能回应未来人物尚未说出的立场。
- `challenge / brief_addition / synthesize` 必须排在所依赖发言之后。
- 独立回应用户的 intent 可竞争第一位；直接点名通常优先。
- 某人的 `claimSummary` 已被前一位充分覆盖后，应降级为简短补充或 pass。
- 每次公开发言后重新计算，不能在开场一次性锁死完整顺序。

`Learn Claude Code` 课程中的 Loop / Harness 分层和 `blockedBy` 图可以作为理解类比：发言的“补充谁、反驳谁”也是依赖边；但工程 Task 的 `owner` 和本轮 Room 状态不是同一个系统，不能直接搬用。

## 现实责任主体：不要把“负责人”写成一个未分型字段

W3C PROV 把 Person、Organization 和 SoftwareAgent 分为不同类型，并把“某 Agent 对某 Activity 承担责任”建模为显式关联。这为 persona16 提供的关键启发是：**身份、活动和责任关联必须分开记录**。[W3C PROV-DM](https://www.w3.org/TR/prov-dm/)

persona16 至少要区分：

| 对象 | 是什么 | 有什么权限 |
| --- | --- | --- |
| 正典人物 | 用户可见的原创人物，由软件运行 | 提供观点、提问、指出责任缺口；当前无现实执行权 |
| 房间仲裁器 | 不可见的产品运行时组件 | 选序、终止、预算、安全、trace；不是房间成员，也不是项目负责人 |
| 现实责任主体 | 用户现实世界中的本人、已命名成员、组织角色或 `unassigned` | 只有经用户明确陈述/确认后，才可成为现实任务 owner |

推荐结构：

```ts
type ResponsibilityClaim = {
  activity: 'maintenance' | 'rollback' | 'stop_decision' | 'handover';
  ownerKind: 'user' | 'named_person' | 'organization_role' | 'unassigned';
  ownerSubjectId: RegisteredResponsibilitySubjectId | null;
  status: 'observed' | 'proposed' | 'confirmed';
  statementQuote: string;
  evidenceQuote: string;
  sourceMessageId: MessageId;
};
```

因此，“AI 可以指出需要维护负责人”的准确含义是：

- 人物可以说：“上线前还缺一个现实团队里明确同意维护的人。”
- 系统记录 `activity=maintenance, ownerKind=unassigned, ownerSubjectId=null`。
- 人物可以请用户确认谁承担，或帮助起草认领/停止规则。
- 人物不能把维护责任分配给另一个正典人物，也不能自称未来值班。
- Orchestrator 只校验责任状态，不替现实团队拍板。

这和“一个 Agent 要不要叫另一个 Agent 发言”是两件事：前者是现实 activity ownership，后者只是 conversational floor control。

## persona16 当前实现的具体缺口

1. [`director.ts`](../../packages/engine/src/director.ts) 用一次中央模型调用替所有人物生成 `baseImpulse`、角度和 speech type；人物本人没有提交 intent。
2. [`scoring.ts`](../../packages/engine/src/scoring.ts) 用 `<45` 沉默并在候选生成阶段裁到最多三人。四人房因此可能被人数上限强制沉默，而不是自然 pass。
3. [`roomController.ts`](../../packages/engine/src/room/roomController.ts) 虽会在每次发言后重选，但只能从 Director 首轮预先裁过的候选中选，无法恢复一个因新发言而变得重要的 Agent。
4. [`prompt.ts`](../../packages/engine/src/prompt.ts) 在 Agent 被选中后要求“现在发言”，生成层没有结构化 `pass`；人物卡中的 `silentWhen` 实际主要由 Director 代为解释。
5. [`roomPolicy.ts`](../../packages/engine/src/room/roomPolicy.ts) 的 `maxNormalSpeakers=3` 是有效的资源保护，但当前同时承担了“必有沉默者”的语义效果。
6. 当前 pilot [`pilotCharacters.ts`](../../eval/src/pilotCharacters.ts) 固定 `ENFP → ESTP → INTJ → ISFJ`，并强制 INTJ、ISFJ 发言，只能测串联能力，不能测真实第一发言者、动态顺序或自主沉默。

所以用户的判断成立：第四项既有 Room 问题，也有 Agent 能力问题。现状是“Room 替人物判断是否想说，人物被选后只能说”。

## 推荐的三层实现

### 第一层：Participation Policy（人物私有）

新增 `assessParticipation(agent, context) -> ParticipationIntent`。当前协议使用正典人物核心与房间情境镜头，输出结构化 intent，不生成公开长文；不得重新加载完整正典档案。未来若接入关系状态，只注入与当前事件有关的窄上下文包。四人 pilot 阶段可以并行调用四个小 JSON 请求，优先验证机制，再优化成本。

### 第二层：Room Arbitration（全局）

把当前 `baseImpulse` 拆成可审计特征；Agent 提交 `decision/claim/target`，Room 统一计算：

```text
eligibility
→ direct-address / safety priority
→ marginal contribution
→ target dependency
→ redundancy / recency / interaction cost
→ select one or stop
```

每次发言后让剩余 Agent 重新提交 intent，是最干净的评测版本；若成本过高，生产版可先保留初始 intent，由 Room 做 claim 覆盖失效，并只让下一候选执行 `confirm_or_pass`。

### 第三层：Room Policy + Responsibility Ledger（确定性）

- Room Policy 只负责资格、权限、安全、预算、幂等和停止，不替人物判断观点。
- `maxVisibleActs` 不低于在场人数，另设 token / 时间 / controller 预算；触发上限应记录 `budget_exhausted`，不能记成自然沉默。
- Responsibility Ledger 记录 `activity + typed subject + confirmation status + source`；现实 owner 只能来自用户已说/已确认的证据。

## 下一轮最小可验证方案

先做隔离评测，不立即迁移生产 Prompt：

1. 为四位人物增加 private `ParticipationIntent` 输出；允许 `pass`，不把“【沉默】”显示给用户。
2. 四人 intent 并行产生，Room 选择第一位；每次发言后让剩余人物重判，直到全部 pass 或无新增价值。
3. 移除 pilot 的固定顺序和 required speakers；允许 1–4 人自然发言。
4. 保留时间/token/最大步骤 guard；把发言人数硬上限暂设为在场人数，而非 3。
5. 每条补充/反驳必须给 `targetMessageId`；每条 intent 给 `claimSummary`，以便检测覆盖与未来立场幻觉。
6. 把责任落点改为 `ResponsibilityClaim[]`，由结构化字段和原文 span/source 共同验证，不再让 Judge 自由计数。

评测至少报告：

- `firstSpeakerFit`：第一位是否适合当前输入；
- `orderDependencyViolationRate`：是否回应未出现内容或违反依赖顺序；
- `unnecessarySpeechRate`：公开发言后没有新增价值的比例；
- `missedNecessarySpeakerRate`：有关键独特 intent 却被提前停止的比例；
- `naturalStopRate` 与 `budgetStopRate`：正常收束与撞保险丝必须分开；
- `passPrecision / passRecall`：该沉默时是否 pass、该说时是否误 pass；
- `silenceRatioByScenario`：只观察分布，不设单轮目标；
- `responsibilityClaimValidity`：activity、主体类型、确认状态和来源是否都可核对；
- `personaAsRealOwnerViolation`：正典人物被写成现实维护/值班者时直接失败。

需要设计的测试不是一个唯一正确顺序，而是一组偏序和反事实：点名/取消点名、观点已覆盖/未覆盖、某人物暂停/恢复、四人都有不同价值/只有一人有价值、现实 owner 已明确/未明确。这样才能分别验证人物自主判断、房间秩序与责任边界。
