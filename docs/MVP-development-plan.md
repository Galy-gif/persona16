# persona16 MVP 开发路径与技术方案

> 版本：v1.0
> 日期：2026-07-11
> 文档状态：历史实施计划，仅用于追溯早期阶段门和技术选择；当前产品状态与下一步见 [PRD](PRD.md) 和 [文档导航](README.md)。
> 适用范围：从当前人格引擎 + Next.js 原型，推进到可邀请小规模真实用户验证的 MVP
> 基座决策：Pi Agent Runtime + persona16 人格与房间引擎

## 0. 结论先行

MVP 要验证的不是“能不能同时调用多个 LLM”，而是下面这条用户价值链是否成立：

> 用户遇到一个没有标准答案的问题，选择或想起 1–3 个 Agent；Agent 基于稳定人格和当前关系选择性发言、补充或反驳，在有限轮次内给出有差异但可收束的回应；用户因此愿意换一组人格重问，或下次继续找其中某个 Agent。

技术上采用两层循环：

1. **Pi 单 Agent Loop**：负责模型、上下文、流式事件、工具、取消、typed stop reason 和底层可恢复提示；恢复路由由 persona16 Harness 负责。
2. **persona16 房间循环**：负责谁说话、为什么说、是否沉默、是否回应分歧、何时总结和何时结束。

MVP 预计按单人开发节奏分 6 个阶段、约 5–6 周完成。每个阶段有独立验收门；上一阶段未达标，不堆后续功能。

---

## 1. 产品阶段门判断

### Gate 1：场景与真实需求

**判断：有条件通过。**

- 明确场景：职业选择、关系困扰、创作卡点等没有唯一正确答案的问题。
- 明确不满：通用 AI 往往全面、正确、同质，缺少“我知道这个人会怎么接”的关系感。
- 明确首批用户：18–30 岁、熟悉人格文化、使用过通用 AI，但对模板化回答不满意的人。
- 当前缺口：尚无真实用户留存证据，因此不能把“长期陪伴”当作已验证事实。

MVP 必须同时采集“首次差异感”和“是否愿意再次找同一个 Agent”两类证据。

### Gate 2：AI 介入必要性

**判断：通过。**

必须使用 AI 的节点：

- 从开放文本判断用户场景、情绪和需求。
- 根据人格、关系和房间上下文生成非模板化表达。
- 判断当前发言是否带来新信息、是否需要回应分歧或收束。
- 从对话中提出候选记忆，但不能自动写入长期记忆。

不应交给 AI 的节点：

- 点名、暂停、新入场、拥挤、最多发言人数等硬规则。
- 房间和消息权限、记忆确认、删除、限流、预算和停止条件。
- 指标计算与评测样本版本管理。

### Gate 3：产品链可实现性

**判断：通过。**

当前仓库已经具备 16 Persona、导演评分、语气引擎、反模板守卫、流式 Web 原型和三套离线评测。缺口集中在 Pi 接入、房间逐步重评估、服务端状态、记忆确认、安全分流和真实用户数据。

### Gate 4：评测设计

**判断：部分通过。**

已有离线评测：人格盲测、动态性、房间化学反应。MVP 还需补：

- 真实人工盲测，而不是仅依赖同一个 LLM judge。
- Pi 迁移前后回归测试。
- 延迟、成本、中断率和空回复等运行时指标。
- 真实用户的换 Agent、同题复玩、7 日回访和反感反馈。

### Gate 5：Badcase 闭环

**判断：部分通过。**

代码已有 tracing 和反模板重生成，但缺少统一的 badcase 数据结构、归因标签、修复版本和回归集。MVP 必须让每个线上差评都能回到一个具体链路节点。

### Gate 6：证据边界

当前可声称：实现了人格引擎、房间原型和离线评测，现有产物达到设定阈值。

当前不可声称：真实用户留存、商业化、增长、长期关系价值、线上安全效果或 Pi 迁移已经成功。

---

## 2. MVP 范围

### 2.1 必须完成

1. 16 个官方 Agent 浏览与人格钩子。
2. 选择 1 个 Agent 单聊，或选择 2–3 个 Agent 开房。
3. 对话中点名、暂停/恢复、邀请、移除 Agent。
4. 单 Agent 由 Pi Runtime 执行；多 Agent 由 persona16 有限房间循环编排。
5. 发言支持长发言、短句、追问、反驳和沉默。
6. 争论达到阈值后自动收束，也支持用户主动总结。
7. 房间、消息和 Agent 状态由服务端保存；客户端仅做缓存。
8. 只保存用户明确确认的偏好、重复模式和边界。
9. 独立安全分流、输入校验、限流、超时和硬预算。
10. 结构化 tracing、反馈入口、离线评测和真实用户指标。

### 2.2 MVP 明确不做

- 原生 iOS/Android App 和桌面 Widget。
- 语音、数字人、头像生成和复杂动效。
- 房间模板推荐、“最佳人格组合”和人格匹配测试。
- 用户创建任意角色、UGC 人格市场和公开社区。
- 付费、订阅和增长裂变。
- 向量数据库、自动长期记忆和未经确认的用户画像。
- 主动推送、自动唤醒和跨应用执行任务。
- 浏览器、Shell、文件写入等通用工具。
- 16 个 Agent 同时群聊或无限 Agent-to-Agent 循环。

### 2.3 MVP 成功定义

MVP 不是“功能全部上线”，而是同时满足：

- 离线人格与房间评测不低于当前基线。
- P95 首字延迟、完整回合耗时和失败率达到内测可接受范围。
- 至少获得一批真实用户的可解释行为数据。
- 用户能说出“我想听某个 Agent 怎么看”，并出现换 Agent 或同题复玩。
- 没有不可控循环、未确认记忆、客户端篡改状态或明显高风险人格化输出。

---

## 3. 主链路闭环（L1–L8）

### 主链路一句话

这条链路把“用户带着真实问题进入一个人格关系场”经过“安全预处理、房间调度和人格化生成”转成“有差异且可收束的对话”，并通过显式反馈和用户确认的状态影响下一次服务。

| ID | 环节 | 解决的问题 | 关键动作 | 进入下一环节的结果 |
| --- | --- | --- | --- | --- |
| L1 | 触发 | 为什么此刻开始对话 | 新建单聊/房间、继续最近、从某 Agent 入口进入 | roomId + agent roster |
| L2 | 输入 | 系统实际收到什么 | 用户消息、点名/暂停等控制、房间版本 | 可信的 TurnCommand |
| L3 | 预处理 | 是否安全、完整、可执行 | Schema 校验、权限、限流、安全分级、上下文裁剪 | TurnContext |
| L4 | 核心处理 | 谁说、怎么说、何时停 | 房间控制器 + 确定性策略 + Pi Agent Runtime | 有序 utterances + stop reason |
| L5 | 输出 | 用户如何实时看到结果 | 版本化 NDJSON 事件、流式文本、总结/错误状态 | 可消费的完整回合 |
| L6 | 反馈 | 如何知道好坏 | 点赞/踩、原因标签、换人、重问、记忆确认 | FeedbackEvent |
| L7 | 状态沉淀 | 什么影响未来 | 房间消息、Agent 状态、已确认记忆、trace、eval case | 可版本化状态 |
| L8 | 下一次 | 如何形成回访 | 继续最近、找同一 Agent、换组合重问 | 新一轮 L1 |

### L1 触发

**输入可能来自：** 首页选角、继续最近房间、Agent 卡片、对话中邀请新 Agent。

**第一版实现：** 保留现有首页和最近房间入口；房间创建改为服务端生成 ID。暂不做主动推送。

**输出、状态和边界：** 输出房间 ID、成员列表和房间版本。最多 3 个未暂停 Agent；重复邀请幂等。MVP 证据是用户能在 30 秒内进入第一轮对话。

### L2 输入

**输入包括：** `roomId`、用户文本、可选 `calledAgent`、控制事件、客户端已知 `roomVersion`。

**第一版实现：** 使用 Zod/TypeBox 做服务端 Schema；客户端不再上传完整可信 `RoomState`，只提交命令。

**输出、状态和边界：** 产出 `TurnCommand`。拒绝空文本、超长文本、未知 Agent、过期房间版本和无权限房间。消息先写入待处理状态，防止重试造成重复回合。

### L3 预处理

**处理动作：**

1. 认证匿名会话或用户身份，读取服务端房间状态。
2. 限流、幂等检查和字符/token 上限检查。
3. 安全路由：`normal | sensitive | crisis | blocked`。
4. 选择最近对话、关系记忆和房间状态，形成最小上下文。

**第一版实现：** 规则筛查 + 便宜模型结构化分类；高风险走独立响应流程，不进入多人争论。上下文先用最近 N 条 + 结构化摘要，不引入向量检索。

**输出、状态和边界：** 产出 `TurnContext`。安全模型失败时采取保守分流；上下文超限时先裁剪旁支，不裁掉安全层、人格核心和用户最近一轮。

### L4 核心处理

**处理动作：**

1. 单聊：构建人格系统上下文，调用一个 Pi Agent Runtime。
2. 多人房间：房间控制器决定下一动作。
3. 确定性策略校验模型动作是否合法。
4. 对选中的人格调用 Pi Runtime 生成发言。
5. 每次发言后重新评估继续、总结、追问用户或停止。

**房间动作集合：**

```ts
type RoomAction =
  | { type: 'speak'; agent: AgentType; speechType: SpeechType; angle: string }
  | { type: 'summarize'; agent: AgentType; reason: string }
  | { type: 'ask_user'; agent: AgentType; question: string }
  | { type: 'stop'; reason: StopReason };
```

**硬停止条件：**

- 普通发言最多 3 次。
- 同一 Agent 默认每轮最多发言一次。
- 最多 1 次总结。
- 总模型调用、token、时间均有预算。
- 连续观点重复、没有新增价值或安全升级时停止。
- 需要用户补信息时以一个追问结束，不继续自说自话。

**输出、状态和边界：** 输出有序发言、评分解释、预算使用和停止原因。控制模型缺失某 Agent 评估时按 0 分。Pi 执行失败不统一自动重试：Runtime 保留错误码、停止原因和可恢复提示，Harness 再根据用户取消、结果确定性、幂等状态和预算选择 `retry`、`transform`、`refresh` 或 `stop`。当前实现不自动切备用模型。

### L5 输出

沿用 NDJSON，升级为版本化事件：

```ts
type TurnEvent =
  | { v: 1; type: 'turn_start'; turnId: string }
  | { v: 1; type: 'room_action'; action: RoomAction }
  | { v: 1; type: 'speaker_start'; agent: AgentType; speechType: SpeechType }
  | { v: 1; type: 'delta'; agent: AgentType; delta: string }
  | { v: 1; type: 'speaker_end'; agent: AgentType; text: string }
  | { v: 1; type: 'memory_candidate'; candidate: MemoryCandidate }
  | { v: 1; type: 'turn_end'; stopReason: StopReason; roomVersion: number }
  | { v: 1; type: 'error'; code: string; recoverable: boolean; recoveryAction: RecoveryAction; outcome: 'known_failed' | 'unknown' };
```

恢复动作当前状态：JSON 解析和反模板失败已有改变条件后的有限重生成；部分文本不会作为成功结果；完成 Turn 支持同 `turnId` 幂等重放；投递终态未知时客户端先使用原 `turnId` 查询或重放。429/瞬态 5xx 自动退避和 `max_tokens` 自动缩短目标仍未实现，不得写成现有能力。

服务端监听 `request.signal`，客户端断开时中止 Pi Runtime。第一版不追求断线续传，但必须避免断线后后台继续无限消耗。用户取消优先于底层 `recoverable`；结果未知不等于执行失败，确认失败前不得新建第二个 Turn。

### L6 反馈

**显式反馈：** 单条发言点赞/踩；踩后选择“太像 AI、刻板、冒犯、重复、没帮助、太长/太短”；接受或拒绝候选记忆。

**隐式反馈：** 点名、暂停、换人、同题换组合、点击总结、继续最近房间。

**边界：** 不把“继续聊天”直接解释为满意，也不把短会话直接解释为失败。所有指标保留分母、样本量、版本和实验条件。

### L7 状态沉淀

只沉淀四类状态：

1. 房间与消息事实。
2. Agent 运行状态：最近发言、开场、熟悉度等。
3. 用户明确确认的记忆。
4. 运行 trace、评测结果和反馈，不作为人格记忆直接注入。

状态必须带来源、创建时间、版本和可删除标记。候选记忆未确认前不得进入 Prompt。

### L8 下一次

MVP 只做被动回访入口：继续最近、从某 Agent 继续、同题换组合。主动通知属于后续阶段；没有用户控制和触发准确率前，不声称“主动陪伴”。

---

## 4. 技术架构

### 4.1 分层

```text
apps/web
  UI、Route Handler、身份/限流、流式协议
        │
        ▼
@persona16/engine
  Persona、Prompt、Tone、Director、RoomLoop、Safety、Memory Policy、Eval Hooks
        │ AgentRuntime port
        ▼
@persona16/runtime-pi
  Pi 模型注册、Agent 生命周期、事件映射、取消、typed failure、成本统计
        │
        ▼
@earendil-works/pi-agent-core + @earendil-works/pi-ai
        │
        ▼
DeepSeek（默认）/ Anthropic（回归与备选）

PostgreSQL
  rooms/messages/agent_states/memories/turn_runs/feedback/events
```

### 4.2 为什么不直接 fork Pi Coding Agent

- coding-agent 默认围绕文件、Shell、编辑器和开发会话，不是消费级人格产品。
- persona16 只需要运行时、模型抽象、事件和循环能力。
- 直接依赖上游包并通过 adapter 隔离，升级和退出成本更低。
- 只有出现扩展点无法解决、且长期稳定的核心分歧时才维护 fork。

### 4.3 AgentRuntime 端口

```ts
export interface AgentRuntime {
  run(request: RuntimeRequest): AsyncIterable<RuntimeEvent>;
  abort(runId: string): Promise<void>;
}

export interface RuntimeRequest {
  runId: string;
  model: ModelRef;
  system: SystemBlock[];
  messages: RuntimeMessage[];
  tools: ProductTool[];
  limits: {
    maxTurns: number;
    maxTokens: number;
    timeoutMs: number;
  };
  metadata: {
    roomId: string;
    turnId: string;
    agent: AgentType;
    promptVersion: string;
  };
}
```

`@persona16/engine` 只能依赖此接口，不能直接引用 Pi 的消息类型。`runtime-pi` 负责 Pi 事件到产品事件的转换。

### 4.4 Pi 使用边界

- 使用 `pi-agent-core`：Agent 状态、事件、工具循环、停止、steering/follow-up。
- 使用 `pi-ai`：DeepSeek/Anthropic 模型、流式、token 和成本统计。
- MVP 默认 `tools=[]`；如需结构化动作，工具严格限定为产品内部动作，不开放通用 I/O。
- Pi 单 Agent `maxTurns` 默认 1；只有真实产品工具加入后才增加。
- persona16 房间循环拥有独立的 `maxRoomSteps`，不能交给 Pi 自行决定。

工具合同工程约束：

- 使用 `defineRuntimeTool` 以 Zod Schema 同时生成模型 JSON Schema、执行前运行时校验和 handler 强类型；不得手写互相独立的 Schema 与解析器。
- RoomController 的四种动作使用 action-specific 联合类型，不要求模型为未选择的动作填写占位字段。
- 已定义的 `pause_agent` 仅包含 `{ agent }`；roomId、用户身份与 expected room version 属于 Harness 可信上下文，不进入模型参数。
- `pause_agent` 当前只完成合同和测试，没有执行器、没有接入 `runTurn`，也不改变 `tools=[] / maxTurns=1` 的现状。
- 已建立服务端 RoomCommand 模块，统一处理 `ui_action / explicit_user_text / model_inference / safety_system` 授权来源、房间规则、乐观版本和房间忙碌状态；现有 UI 路由已接入。
- 模型推断和 Safety 系统无权修改房间；暂停、恢复、邀请需要明确用户动作，移除成员还需要二次确认。

后续 Room Command 接入清单：专用 Harness/入口 → 生成可信的自然语言授权依据 → `pause_agent` 执行器复用 RoomCommand 模块 → 聊天确认流 → 命令审计/幂等 → 正负调用评测 → 通过门槛后才启用工具循环。禁止直接给所有 Persona 提供 `manage_room(action, data)`。

### 4.5 房间循环伪代码

```ts
async function runRoomTurn(ctx: TurnContext) {
  const state = createRoomRunState(ctx, {
    maxSpeakers: 3,
    maxSummaries: 1,
    timeoutMs: 45_000,
  });

  while (!state.done) {
    const proposed = await controller.nextAction(state);
    const action = policy.validateAndNormalize(proposed, state);

    if (action.type === 'stop') break;
    if (action.type === 'ask_user') {
      await emitQuestion(action);
      break;
    }

    const utterance = await personaRuntime.speak(action, state);
    state.accept(utterance);
    policy.checkBudgets(state);
  }

  return finalizeTurn(state);
}
```

### 4.6 模型策略

| 角色 | MVP 默认 | 温度/约束 | 说明 |
| --- | --- | --- | --- |
| 安全分类 | 便宜模型 | temperature 0 + Schema | 失败时保守分流 |
| 房间控制器 | DeepSeek Chat | temperature 0 + Schema | 只提出动作和语气偏移 |
| 人格发言 | DeepSeek Chat | 较高温度 | Pi Runtime 流式生成 |
| 离线 Judge | 与生成模型分离优先 | temperature 0 | 定期加入人工复核 |

模型 ID、参数和 Prompt 必须版本化，不在业务代码里散落。

---

## 5. 数据与状态方案

### 5.1 MVP 数据表

| 表 | 核心字段 | 用途 |
| --- | --- | --- |
| `users` | id, anonymous_id, created_at | 内测可先匿名，后续绑定账号 |
| `rooms` | id, user_id, goal, version, status | 服务端房间真相源 |
| `room_agents` | room_id, agent_type, paused, joined_at, state_json | 成员和运行状态 |
| `messages` | id, room_id, turn_id, speaker, text, speech_type, seq | 可重放对话 |
| `memories` | id, user_id, agent_type, kind, content, status, source_message_id | 候选/确认/拒绝/删除记忆 |
| `turn_runs` | id, room_id, prompt_version, model, status, stop_reason, usage_json, latency_json | 每轮运行事实 |
| `turn_events` | turn_id, seq, event_type, payload_json | 调试和必要的事件重放 |
| `feedback` | user_id, message_id/turn_id, rating, tags, note | Badcase 入口 |
| `eval_cases` | id, suite, input_json, expected_json, version | 回归数据集 |
| `eval_runs` | case_id, build_sha, metrics_json, output_json | 版本对比 |

### 5.2 数据库选择

MVP 使用 PostgreSQL；本地可用 Docker/Postgres，部署可选托管 Postgres。ORM 推荐 Drizzle，原因是 Schema 明确、迁移轻量且适合当前 TypeScript monorepo。供应商不是产品架构的一部分，应通过标准连接串替换。

### 5.3 状态一致性

- `rooms.version` 使用乐观锁，防止多个标签页同时发起回合。
- `turnId` 作为幂等键，重复请求返回现有状态或明确冲突。
- 一个房间同一时间最多一个 active turn。
- 客户端 localStorage 仅缓存最近房间 ID 和草稿，不再保存可信完整状态。

### 5.4 记忆策略

```text
对话事实
→ 候选记忆提取
→ 展示给用户
→ 用户确认
→ 结构化保存
→ 下次按 Agent + 类型 + 最近性注入
```

MVP 记忆类型仅有：`preference | repeated_pattern | boundary`。每个 Agent 注入数量设硬上限；不使用 embedding，不推断敏感属性，不把模型总结当成事实。

---

## 6. 安全、隐私与可靠性

### 6.1 安全分流

```text
输入
→ 规则快速筛查
→ 结构化风险分类
→ normal: 人格/房间流程
→ sensitive: 降低刺激，保留人格核心
→ crisis: 跳出多人争论，使用安全响应流程
→ blocked: 拒绝并提供安全替代
```

安全层优先级永远高于人格层。危机流程不让多个 Agent 围绕风险内容继续争论，也不制造“只有我理解你”的关系依赖。

### 6.2 服务端防线

- 所有 API 输入做 Schema 校验和大小限制。
- Agent、房间、记忆和消息都做所属权检查。
- 服务端重新读取状态，不信任客户端上传的 history/relationship。
- 每用户/IP 限流；每轮模型调用和 token 有硬预算。
- API key 仅存在服务端环境变量，不进入客户端、日志或 trace。
- 错误响应不返回 Prompt、模型原始异常或内部栈。
- Prompt/Persona 版本可追踪，但 trace 中避免保存不必要的敏感原文。

### 6.3 可靠性目标

MVP 建议初始 SLO：

- Turn API 成功率 ≥ 97%。
- P95 首字延迟 ≤ 5 秒。
- 单聊 P95 完整耗时 ≤ 20 秒。
- 多人房间 P95 完整耗时 ≤ 45 秒。
- 断连后 2 秒内触发运行时取消。
- 不出现超过硬上限的房间循环。

这些是内测目标，正式阈值需根据真实部署测量后调整。

---

## 7. 评测与 Badcase 闭环

### 7.1 四层评测

| 层级 | 对象 | 目的 | 方法 |
| --- | --- | --- | --- |
| E1 单节点 | 安全分类、Director Schema、反模板 | 验证节点正确性 | 单测 + 固定 case |
| E2 单 Agent | 人格辨识、动态性、语气 | 验证人格表达 | 现有 blindtest/dynamics + 人工盲测 |
| E3 房间链路 | 发言选择、分歧、收束、停止 | 验证多人价值 | rooms eval + trace 规则 |
| E4 线上产品 | 复玩、换人、回访、反感 | 验证真实价值 | 事件分析 + 用户访谈 |

### 7.2 MECE 评分维度

每条 Agent 发言：

- 人格辨识度
- 上下文相关性
- 新增价值
- 语气自然度
- 长度/发言类型服从度
- 安全与尊重

每个房间回合：

- 发言者选择合理性
- 观点非重复性
- 分歧自然度
- 收束有效性
- 用户下一步可用性
- 调用成本和耗时

### 7.3 迁移回归门

Pi Runtime 上线前，同一 eval set 并跑旧执行层与新执行层：

- 人格辨识、动态性、房间通过率不得低于当前基线。
- 同质化和反感维度不得恶化。
- Schema 错误、空回复和中断失败率必须下降或持平。
- 延迟或成本若上升超过 20%，需要明确换来的质量收益，否则不能切流。

### 7.4 两类首要 Badcase

#### Badcase A：多人回复像三个完整助手

- 低分维度：新增价值、长度服从、语气差异。
- 诊断：房间控制器把多个 Agent 都选成主讲；后发 Agent 没有读取本轮已有观点。
- 修改节点：L4 控制器、确定性长发言上限、Prompt 中的本轮上下文。
- 复测目标：重复观点下降；每轮至少出现一种短句/追问/沉默策略；房间化学反应不回退。

#### Badcase B：熟悉用户后仍像第一次见面

- 低分维度：动态性、关系连续性。
- 诊断：候选记忆未确认或已确认记忆未被正确选择和注入。
- 修改节点：L7 记忆状态、L3 上下文选择、关系 Prompt。
- 复测目标：动态性 5 场景至少 4/5 可区分，同时不出现未经确认的事实。

### 7.5 Badcase 数据结构

每条 badcase 必须记录：`evalDimension`、现象、输入、输出、trace、归因节点、修复版本、复测指标和是否关闭。禁止只改 Prompt 而不记录失败类型。

---

## 8. 开发阶段与里程碑

以下按 1 名主开发者 + AI 辅助估算；如多人并行，可压缩日历时间，但阶段门不跳过。

### Phase 0：冻结基线与 ADR（2 天）

**任务：**

- 保存当前 eval artifacts、模型参数和 Prompt 版本。
- 新增 Pi 基座 ADR、`AgentRuntime` 接口和事件协议草案。
- 补核心 scoring/anti-template 单测。
- 建立本地 `.env.test` 约定，测试不得读取真实生产密钥。

**交付：** ADR、基线报告、接口类型、最小单测。

**退出门：** 能用同一命令复现当前 typecheck 和离线评测输入版本。

### Phase 1：Pi Runtime Spike（3–4 天）

**状态（2026-07-11）：已通过。** 详见 `docs/baselines/2026-07-11-pi-runtime-spike.md`。

**任务：**

- 新建 `packages/runtime-pi`。
- 接入锁定版本的 `pi-agent-core` / `pi-ai`。
- 验证 DeepSeek 单聊、流式事件、AbortSignal、超时、usage、错误映射。
- 验证结构化房间控制输出；如果 Pi 路径不适合结构化输出，暂保留专用 JSON 调用 adapter。
- 编写 faux provider/假模型测试，避免单测依赖真实 API。

**退出门：** 一个 INTJ 单聊 case 能通过统一 Runtime 运行；取消、超时和错误均有自动测试；没有引入 coding-agent 默认工具。

### Phase 2：人格引擎运行时解耦（4–5 天）

**任务：**

- `runTurn` 注入 `AgentRuntime`，移除对 `llm.ts` 的直接耦合。
- Prompt、tone、anti-template、trace 全部保留。
- 旧 Runtime 和 Pi Runtime 可通过配置切换。
- 并跑 blindtest/dynamics，生成差异报告。

**退出门：** 单 Agent 评测不低于基线；Runtime 切换不改业务层；失败时能快速回滚旧路径。

### Phase 3：有限房间循环（5–7 天）

**状态（2026-07-11）：已通过。** 详见 `docs/baselines/2026-07-11-phase3-room-loop.md` 与 ADR-0002。

**任务：**

- 新增 `roomLoop.ts`、`roomController.ts`、`roomPolicy.ts`。
- 定义 `RoomAction`、`StopReason` 和预算状态。
- 每次发言后重评估；支持 speak/summarize/ask_user/stop。
- 实现硬停止、重复观点检测、点名优先和安全中断。
- 扩展 rooms eval，加入无限循环、全员长答、空发言、点名失败等 adversarial case。

**退出门：** 6 个房间组合全部通过；任何 case 不超过预算；trace 能解释每一步为什么继续或停止。

### Phase 4：服务端状态、记忆和安全（5–7 天）

**状态（2026-07-11）：已通过。** 详见 `docs/baselines/2026-07-11-phase4-state-memory-safety.md` 与 ADR-0003。

**任务：**

- 接入 PostgreSQL 和迁移。
- API 改为 `roomId + command`，不再接受完整可信 RoomState。
- 实现匿名会话、房间版本、幂等 turn 和并发锁。
- 实现候选记忆—用户确认—注入—删除闭环。
- 实现安全分类与危机旁路、限流和预算。

**退出门：** 客户端篡改 history/relationship 无效；并发请求不会生成两个回合；未确认记忆不会进入 Prompt；危机 case 不进入多人争论。

### Phase 5：MVP 产品体验与观测（5–7 天）

**任务：**

- 完善邀请、移除、暂停、点名和总结交互。
- 增加单条反馈和原因标签。
- 增加结构化错误恢复、按动作提示、取消按钮和生成状态；结果未知时先恢复原 Turn。
- 结构化记录 turn latency、usage、stop reason、feedback。
- 增加内部 trace 查看页或导出脚本，不向普通用户暴露 Prompt。

**退出门：** 从创建房间到结束一轮的关键路径无阻断；失败有明确恢复动作；指标能按 build/prompt/model 版本切分。

### Phase 6：评测、内测与发布门（5–7 天）

**任务：**

- 完整跑 E1–E3 自动化评测和人工盲测。
- 招募小规模目标用户完成固定任务 + 自由使用。
- 每日聚类 badcase，修复后回归。
- 做隐私说明、数据删除入口、免责声明和事故处理清单。
- 冻结 MVP build，灰度开放。

**退出门：** 满足第 9 节发布清单；没有 P0 安全/数据问题；已知 P1 有负责人和处理窗口。

---

## 9. 指标与发布验收

### 9.1 离线质量门

- blindtest：top-3 辨识 ≥ 10/16；同质化 ≤ 2.5。
- dynamics：至少 80% Agent 通过，单 Agent 目标 ≥ 4/5 场景有变化。
- rooms：6/6 基础组合通过；新增对抗 case 全部满足硬停止。
- 人工抽检：安全、刻板、冒犯、AI 味均有独立标签和样本量。

### 9.2 运行时门

- Typecheck、单测、集成测试、数据库迁移检查通过。
- 成功率和延迟达到第 6.3 节内测目标。
- 所有运行都有 turnId、promptVersion、model 和 stopReason。
- Pi Runtime 可配置回滚，数据库变更向后兼容。

### 9.3 真实用户验证指标

首轮内测先观察，不把目标伪装成已经达到：

| 指标 | 口径 | 初始观察目标 |
| --- | --- | --- |
| 首轮完成率 | 创建房间后完成至少一轮 | ≥ 70% |
| 多人房创建率 | 完成单聊者 24h 内创建多人房 | ≥ 35% |
| 换 Agent 率 | 房间内发生邀请/移除/替换 | ≥ 25% |
| 同题复玩率 | 同一问题使用第二组组合 | ≥ 20% |
| 记忆接受率 | 候选记忆被确认 | ≥ 50% |
| 7 日回访 | 首日完成房间对话者 7 天内再打开 | ≥ 25% |
| 总反感率 | 刻板/冒犯/油腻/AI 味/依赖诱导 | ≤ 12% |

所有比例必须同时报告分母；样本过小时只作方向判断。

### 9.4 Go / No-Go

**Go：** 离线门和安全门通过，真实用户出现明确复玩/点名行为，且主要 badcase 可通过具体链路节点修复。

**继续迭代：** 用户感到人格不同，但不回访；优先修关系连续性和回访入口，不加语音/Widget。

**No-Go / 重新定位：** 用户只把它当人格梗图生成器，换组合后差异感弱，或多人房持续比单一通用助手更慢但没有更高价值。

---

## 10. 建议目录与代码改造

```text
apps/web/
  app/api/rooms/
  app/api/turn/
  app/api/memories/
  app/api/feedback/
  lib/api-client.ts

packages/engine/src/
  runtime/agentRuntime.ts       # Port，不依赖 Pi
  room/roomLoop.ts
  room/roomController.ts
  room/roomPolicy.ts
  room/roomActions.ts
  safety/safetyRouter.ts
  memory/memoryPolicy.ts
  eval/evalHooks.ts

packages/runtime-pi/src/
  piRuntime.ts
  modelRegistry.ts
  eventMapper.ts
  errors.ts
  testing/fauxRuntime.ts

packages/store/src/
  schema.ts
  repositories/
  migrations/

eval/src/
  runtimeRegression.ts
  roomAdversarial.ts
  safety.ts
```

不建议在 MVP 开始时重命名或拆散现有所有 engine 文件。先通过 Runtime port 建立边界，再逐模块迁移。

---

## 11. 测试策略

### 单元测试

- scoring 的所有加减分和阈值。
- RoomPolicy 的点名、暂停、重复发言、预算和停止。
- anti-template、tone clamp、memory status 和安全状态机。
- NDJSON parser 的半包、断包和非法事件。

### 集成测试

- faux Pi provider → Runtime → engine → API stream。
- 数据库创建房间、幂等 turn、并发版本冲突。
- 客户端断连触发 abort。
- 候选记忆拒绝后永不注入。

### LLM 回归测试

- 固定 eval case、模型和 Prompt 版本。
- 输出是概率性的，不做全文快照；评估结构、规则、rubric 和统计分布。
- LLM judge 结果抽样人工复核，避免生成者和评审者同源偏差。

### 发布前手测

- 手机窄屏、中文输入法 Enter、弱网、刷新、后台切回。
- 连续快速发送、多个标签页、重复点击、生成中暂停/返回。
- 高风险输入、诱导泄漏 Prompt、超长文本和未知 Agent。

---

## 12. 成本、依赖和升级策略

- 每轮记录 director、安全、人格发言各自 token 和成本。
- 多人房默认最多 3 次人格生成；控制器调用次数有独立上限。
- 对 Pi 使用精确版本并提交 lockfile；每次升级先跑 faux tests 和全量 eval。
- `runtime-pi` 是唯一允许引用 Pi 包的 workspace。
- 保留旧 Runtime 一个发布周期作为回滚路径，稳定后再删除。
- MIT 许可证声明随发行物保留。

---

## 13. 最小执行清单

按优先级开始：

1. 写 ADR：确认 Pi 包、版本和 Runtime port。
2. 冻结当前评测基线。
3. 完成一个 Agent 的 Pi Runtime Spike。
4. 接通 Abort、usage、错误和 faux provider 测试。
5. 让现有 `runTurn` 可切换旧/Pi Runtime。
6. 完成单 Agent 回归后再做房间有限循环。
7. 房间循环通过后再迁服务端状态。
8. 最后补记忆、安全、反馈和小规模内测。

任何阶段都不以“代码写完”作为完成；必须以对应阶段门的证据作为完成。

---

## 14. Pi 参考资料

核对日期：2026-07-11。

- Pi 官方仓库：https://github.com/earendil-works/pi
- Pi Agent Core：https://github.com/earendil-works/pi/blob/main/packages/agent/README.md
- Pi AI：https://github.com/earendil-works/pi/blob/main/packages/ai/README.md
- Pi Coding Agent SDK：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md

Pi 当前采用 MIT 许可证；正式集成前仍需在锁定版本上复核包名、API、许可证和 DeepSeek 行为。
