# Learn Claude Code 20 课与 persona16 语义可靠性

> 日期：2026-07-22
> 研究对象：`shareAI-lab/learn-claude-code` 新版 `s01-s20` 主线
> 核查版本：[`a9cafe953aa714f9cb1171f217d96bd2734bbcc7`](https://github.com/shareAI-lab/learn-claude-code/tree/a9cafe953aa714f9cb1171f217d96bd2734bbcc7)
> 资料口径：逐课核对官方中文 README 与 `code.py`；不使用二手教程。仓库同时保留旧 12 课过渡版，本文只使用根目录新版 20 课，避免章节号混用。[官方版本说明](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/README-zh.md#%E7%89%88%E6%9C%AC%E8%AF%B4%E6%98%8E)

## 结论

换模型后，关键语义约束、关系动作和多人房责任仍然重复失真，最能解释现状的不是“模型还不够聪明”，而是生成链路缺少一个可执行的语义控制闭环：

```text
已确认事实 + 当前输入 + 关系事件
  → 编译本轮动作计划
  → 确定性权限门
  → 生成自然语言
  → 语义/证据验证
  → 通过：交付
     失败：带原因重写（有界）
     仍失败：安全降级或停止
```

目前的失败集中在这条链的三个断点：

1. **关系事件只有“发生过什么”，没有编译成“这轮允许/禁止/必须做什么”**。例如“用户只想被听见”进入 Prompt 后，仍可能被模型解释成“换一种二选一继续追问”。
2. **现有关键语义门主要在成文后评测，失败不能回到生成环节改变动作**。它能发现错误，却不能阻止错误成为最终回复。
3. **关系和房间责任主要依赖自然语言蕴含，缺少结构化动作与主体状态**。于是“指出缺少负责人”容易扩写成“替用户分配负责人”，关系修复也容易退化成换措辞继续介入。

`Learn Claude Code` 对此最有价值的不是某一章代码可以直接复制，而是七个可组合的 Harness 原则：

- s03：执行前做权限判断；
- s04：把前置检查、后置验证和阻止退出挂在稳定循环上；
- s09：把长期事件与当前上下文分开，并按需选择；
- s10：按真实运行态组装动态 Prompt；
- s11：按失败类型选择恢复动作，而不是盲重试；
- s16：用带 ID、类型与状态的请求—响应协议表达协商；
- s20：明确这些机制在同一循环中的位置。

这组方法可以显著降低**已知关键动作越界**，让失败可阻断、可追踪、可恢复；但它不能让 Harness 凭空获得模型没有的深层语义能力。官方仓库也明确区分：模型提供 agency，Harness 提供工具、知识、观察、动作接口与权限边界。[官方总论](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/README-zh.md#agency-%E6%9D%A5%E8%87%AA%E6%A8%A1%E5%9E%8Bagent-%E4%BA%A7%E5%93%81--%E6%A8%A1%E5%9E%8B--harness)

## 一、20 课逐课：各自解决什么 Harness 问题

| 课程 | Harness 问题与机制 | 对 persona16 当前问题的直接性 | 官方材料 |
| --- | --- | --- | --- |
| s01 Agent Loop | 模型提出工具调用后，由循环执行、回填 observation，再让模型继续；解决“一次调用不能行动和观察”的问题。 | 中。persona16 需要同样的“计划/验证结果回填后继续”，但人物回复不应为了循环而强行工具化。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s01_agent_loop/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s01_agent_loop/code.py) |
| s02 Tool Use | 用 JSON Schema 定义窄工具，以 dispatch map 分发；新增能力不修改核心循环。 | 中。适合把“读取关系效果、验证动作、检查证据”做成窄接口；但工具 schema 本身不保证语义正确。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s02_tool_use/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s02_tool_use/code.py) |
| s03 Permission | 工具执行前按固定优先级 `deny → ask → allow`；安全不能只靠模型自觉。 | **高。** 可映射为关系动作权限：禁止建议、禁止封闭式选择题、需要用户确认的责任分配等，在生成前判定。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s03_permission/README.md) · [permission pipeline](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s03_permission/code.py#L151-L198) |
| s04 Hooks | 用 `UserPromptSubmit / PreToolUse / PostToolUse / Stop` 扩展点承载输入注入、执行前拦截、执行后检查和阻止退出，保持循环稳定。 | **高。** 最适合承载“生成前动作编译 → 生成后语义门 → 失败时阻止交付并续跑”。前提是 hook 真能阻断，而不是只打日志。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s04_hooks/README.md) · [hook registry](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s04_hooks/code.py#L161-L225) |
| s05 TodoWrite | 给长任务增加显式、可更新的会话内工作记忆，防止中途目标漂移。 | 低到中。`TurnActPlan` 可以借鉴“先显式计划再执行”，但 Todo 是工程步骤，不应直接当作对话动作模型。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s05_todo_write/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s05_todo_write/code.py) |
| s06 Subagent | 用独立 `messages[]` 隔离复杂子任务，只把结论带回主上下文；子 Agent 仍受权限约束。 | 中。适合离线独立评审、根因调查或生产中的独立 verifier；不能因为多叫一个模型就获得真值，也会增加延迟与分歧。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s06_subagent/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s06_subagent/code.py) |
| s07 Skill Loading | System 只放技能目录，完整知识用到时加载，避免把全部规范塞进 Prompt。 | 低到中。可按场景加载专门语义策略，但用户刚确认的边界不能按需“可能加载”，必须常驻本轮动作合同。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s07_skill_loading/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s07_skill_loading/code.py) |
| s08 Context Compact | 分层压缩消息与工具结果，保留配对边界；全量摘要和响应式压缩均有上限。 | 中。能降低旧人设、旧事件和噪声淹没当前边界的风险；如果摘要丢掉有效边界，反而会恶化关系动作，因此需为 active effects 设不可压缩槽位。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s08_context_compact/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s08_context_compact/code.py) |
| s09 Memory | 长期记忆用索引 + 文件保存，相关内容按需选择；轮末提取，低频整理去重，并区分长期 memory 与 session memory。 | **高，但需改造。** 可用于事件选择和生命周期管理；官方教学版的 LLM 自动提取/整理不能直接替代 persona16 的确认、来源、纠正、删除和效果编译。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s09_memory/README.md) · [selection/extraction](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s09_memory/code.py#L132-L322) |
| s10 System Prompt | Prompt 按 section 在运行时组装；是否加载取决于真实状态，而不是在消息里猜关键词；静态与动态部分分开。 | **高。** 应把 active relationship effects、场景约束和已批准 `TurnActPlan` 作为动态 section，而不是把整张人物卡和所有关系事件平铺进去。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s10_system_prompt/README.md) · [assembly](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s10_system_prompt/code.py#L50-L88) |
| s11 Error Recovery | 区分截断、上下文超限、瞬态故障，分别升级、压缩、退避或 fallback；每条恢复路径有预算。 | **高，需语义化扩展。** 把语义门失败定义为 `transform`，带具体违反项回到重写；不是把同一 Prompt 原样 retry。官方课程本身只处理基础设施错误。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s11_error_recovery/README.md) · [recovery code](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s11_error_recovery/code.py#L163-L318) |
| s12 Task System | 用持久化任务图表达 `blockedBy`、owner、claim、complete，跨会话恢复开发进度。 | 低（线上），中（研发）。适合管理“schema → policy → generator → eval”改造依赖；不能直接拿工程任务 owner 表示现实关系责任。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s12_task_system/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s12_task_system/code.py) |
| s13 Background Tasks | 慢操作先返回占位结果，完成后用独立通知注入，不复用原 tool result。 | 低。适合异步跑离线 Judge、trace 分析和回归，不适合把会阻止当前坏回复的语义门放后台。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s13_background_tasks/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s13_background_tasks/code.py) |
| s14 Cron Scheduler | 调度、队列、交付和消费解耦；坏任务不能杀死调度器。 | 低（生成），中（管理）。可定时跑冻结样本回归、漂移报告和待确认记忆清理；不解决单轮语义。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s14_cron_scheduler/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s14_cron_scheduler/code.py) |
| s15 Agent Teams | 持久队友通过异步邮箱通信，解决一个上下文覆盖不了多个专业子域的问题。 | 低到中。可让独立专家分别看语义、关系、房间责任；线上多人格房不是开发团队，不能照搬 Lead/teammate 拓扑。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s15_agent_teams/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s15_agent_teams/code.py) |
| s16 Team Protocols | 用 `request_id + type + pending/approved/rejected` 关联请求与回复，做类型校验和去重。 | **高。** 可映射到人物发言意图、用户责任确认、暂停/恢复和关系修复协议。但官方教学版明确说“消息流程不等于执行门控”，必须再接 policy gate。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s16_team_protocols/README.md) · [protocol state](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s16_team_protocols/code.py#L340-L420) |
| s17 Autonomous Agents | 队友空闲时扫描可认领任务，检查依赖和 owner 后 claim；真实系统再用文件锁保证并发安全，且 shutdown 优先。 | 低。它可类比人物 `speak/pass`，但工程任务自动认领不等于社交发言选择；persona16 应保留 private intent + Room 仲裁，而不是抢占共享看板。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s17_autonomous_agents/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s17_autonomous_agents/code.py) |
| s18 Worktree Isolation | 给并行任务独立目录与分支，保护共享工作区，保留审计事件。 | 很低（产品运行时），中（并行研发）。它解决代码改动互踩，不解决人物和关系语义。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s18_worktree_isolation/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s18_worktree_isolation/code.py) |
| s19 MCP Tools | 动态发现外部工具并接入同一工具池，用命名空间避免冲突；工具池变化后刷新 Prompt。 | 低。只有未来接外部知识源、人工审核或标注平台时有用；多一个插件不会自动提高关系语义。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s19_mcp_plugin/README.md) · [code.py](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s19_mcp_plugin/code.py) |
| s20 Comprehensive | 把输入 hook、通知、压缩、Prompt、恢复、权限、工具、后置 hook 和 Stop hook 放回同一稳定循环。 | **高。** 它给出 persona16 语义闭环的集成位置，但不是新的语义算法。 | [README](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s20_comprehensive/README.md) · [main loop](https://github.com/shareAI-lab/learn-claude-code/blob/a9cafe953aa714f9cb1171f217d96bd2734bbcc7/s20_comprehensive/code.py#L1942-L2040) |

## 二、真正值得用于 persona16 的组合

### 1. s03 + s09：把关系记忆升级为“事件 + 效果 + 生命周期”

当前关系记录若只有自然语言内容，例如“用户只想被听见”，模型仍需自行推断它对本轮行为的影响。应将已确认关系事件编译为窄效果：

```ts
type RelationshipEffect = {
  eventId: string;
  trigger: 'always' | 'topic_match' | 'until_repaired' | 'until_revoked';
  status: 'active' | 'superseded' | 'revoked' | 'expired';
  allow: TurnAction[];
  deny: TurnAction[];
  require: TurnRequirement[];
  expiresAt?: string;
  supersededByEventId?: string;
};

type TurnAction =
  | 'reflect'
  | 'open_question'
  | 'closed_choice'
  | 'advice'
  | 'assign_responsibility'
  | 'reopen_decision'
  | 'stop_intervening';
```

例如“用户只想被听见”的 active effect 可以是：

```text
allow: [reflect, open_question, stop_intervening]
deny: [closed_choice, advice, assign_responsibility, reopen_decision]
require: [acknowledge_boundary]
```

这不是把所有对话写成规则树，而是只把**用户已经确认、必须稳定兑现的决定权边界**变成权限。人物如何理解、怎样措辞、何时幽默仍由模型决定。

仅做 s09 式检索不能解决问题：正确事件被取回后，如果没有 effect compiler 和 permission gate，模型仍可能把它“表演”成一句话，却继续执行被禁止的动作。

### 2. s05 + s10：生成前产生并批准 `TurnActPlan`

在自然语言成文前，先输出一个短、可验证、无修辞的动作计划：

```ts
type TurnActPlan = {
  primaryAct: 'reflect' | 'clarify' | 'challenge' | 'advise' | 'close';
  interventionLevel: 0 | 1 | 2;
  questionMode: 'none' | 'open' | 'single_closed' | 'multiple_choice';
  recommendationAllowed: boolean;
  reopenDecisionAllowed: boolean;
  responsibilityAct: 'none' | 'observe_gap' | 'request_confirmation' | 'assign';
  evidenceIds: string[];
  relationshipEffectIds: string[];
};
```

计划必须先通过确定性校验：

- `deny` 中的动作不得出现在计划；
- `require` 必须被计划覆盖；
- 每个共同历史陈述必须有可追溯 `evidenceId`；
- `assign` 只能指向用户已确认的现实主体；
- 用户已经结束的决定不得被 `reopenDecisionAllowed=true`；
- Room 暂停或点名规则优先于人物冲动。

通过后，s10 式 Prompt 组装只注入：稳定人物核心、当前场景、相关事实、active effects、已批准 plan、用户原话。不要把整张人物卡、所有事件、所有评测说明每轮全塞进去。

### 3. s04 + s11：让语义门从“报告器”变成“交付门”

建议把人物生成链改成：

```text
PreGeneration
  → 选相关事实与 active effects
  → 编译 TurnActPlan
  → policy validate

Generate
  → 按批准 plan 写自然语言草稿

PostGeneration
  → source entailment
  → action classifier
  → relationship-effect compliance
  → room responsibility validation

Delivery
  → passed: commit + stream
  → failed: semantic_contract_violation + transform
```

语义失败必须返回结构化原因，而不是一个总分：

```ts
type SemanticViolation = {
  code:
    | 'unsupported_history'
    | 'forbidden_closed_choice'
    | 'decision_reopened'
    | 'relationship_effect_ignored'
    | 'responsibility_owner_unconfirmed';
  evidenceSpan?: string;
  effectId?: string;
  repairInstruction: string;
};
```

恢复动作应是 `transform`：把违反项、原计划和保留内容返回生成器，最多重写 1–2 次。不能原样 retry，因为同样的输入只会再次采样同类错误。多次失败后，返回不越界的最小回应或停止生成；不要把未通过草稿流给用户。

s11 原课的截断/429/上下文恢复不等于语义恢复。这里借用的是“**失败分类 → 不同动作 → 有界预算**”的结构，不是照搬异常类型。

### 4. s16：把关系修复和房间责任变成带状态的协议

多人房应区分三种对象：

1. 人物的私有发言意图；
2. Room 的发言授权；
3. 用户现实世界中的责任主体。

可以借 s16 的请求—响应结构：

```ts
type ParticipationIntent = {
  intentId: string;
  agentId: string;
  decision: 'speak' | 'brief_addition' | 'pass';
  targetMessageId?: string;
  claimSummary?: string;
};

type ResponsibilityProposal = {
  requestId: string;
  activity: 'maintenance' | 'rollback' | 'stop_decision' | 'handover';
  proposedOwnerId: string | null;
  status: 'observed' | 'pending_confirmation' | 'confirmed' | 'rejected';
  sourceMessageId: string;
};
```

Room 每次只授权一个公开发言，公开后让剩余人物重判；`pass` 是合法 intent。人物可以观察“维护责任尚未分配”，但只有用户确认响应匹配同一个 `requestId` 后，状态才能变成 `confirmed`。

必须注意官方 s16 的限制：教学版计划审批只演示消息流，没有真正阻止未批准执行。因此 persona16 不能只存 `pending/confirmed`，还必须在生成前 policy gate 中读取状态并阻断非法 `assign`。

### 5. s20：在同一 Turn Loop 中固定顺序

建议的产品级顺序是：

```text
User turn accepted
  → snapshot current room / memory / relationship versions
  → select relevant evidence
  → compile active relationship effects
  → create TurnActPlan
  → deterministic pre-generation gate
  → generate draft
  → deterministic checks + independent semantic assessment
  → pass: persist + deliver
  → fail: transform + bounded rewrite
  → repeated fail: safe minimal response / stop
```

这条顺序应是一个可追踪状态机，不是在几个调用点零散加入判断。每一步至少记录：输入版本、事件/effect ID、plan、违反项、重写次数、最终 stop reason。这样下一次复测可以回答“错在事件选择、effect 编译、计划、生成还是 validator”，而不再把所有问题统称为 Memory 或 Prompt。

## 三、哪些课现在不应被误用

### Subagent / Agent Teams 不是首要修复

s06、s15 可以帮助离线并行分析或提供独立 verifier，但不能替代结构化真相源。多个 Agent 如果读取同一份模糊关系文本，很可能只是产生多份不同解释。应先有 effect schema、证据和动作门，再决定是否让独立模型验证。

### Todo / Task System 不是关系状态机

s05、s12 解决工作步骤与工程依赖。`blockedBy`、owner 和 complete 适合研发管理，不应直接表示人物关系或现实责任。关系事件需要可撤回、被修订、到期、被新事件覆盖等生命周期；现实责任还需要用户确认和来源证据。

### Background / Cron 只能做离线观测

s13、s14 适合批量回归、漂移监测和报表，但当前回复能否交付的门必须同步运行。把 semantic gate 放后台，只能在错误已经给用户后发现问题。

### Skill / MCP 不能代替控制层

s07 可以减少上下文噪声，s19 可以接外部服务；它们扩展知识与能力，不会自动把“只想被听见”变成禁止选择题的动作权限。

### Autonomous Agents 不能直接等同于人物房间

s17 的目标是让工程 Agent 抢占可执行任务；persona16 的人物不是争抢任务 owner。正确映射仍是 private intent + Room arbitration + 每次公开发言后重判，而不是先到先得或所有可认领者都发言。

## 四、能解决什么，不能解决什么

### 能解决

- 把“关系记忆已注入但动作没变”改成可验证的 effect 与动作差量；
- 在最终回复前阻断已知硬越界，而不是只在评测报告里标红；
- 区分“共同历史事实”和“关系事件造成的当前权限”；
- 区分人物建议、Room 授权和现实责任确认；
- 把每次失败定位到明确步骤，减少“换模型再试一次”的盲目性；
- 让重写有具体违反项和上限，避免无限 retry 或换词不换动作。

### 不能解决

- 无法保证模型理解所有开放世界语义和隐含人际含义；
- 无法仅靠 schema 让人物自然、有辨识度、不过度工具化；
- 独立 Judge 仍可能误判，所以高风险门应尽量使用来源、枚举动作和确定性状态，而不是只依赖一个总分；
- 过度把自然交流规则化会制造僵硬，因此确定性 policy 只覆盖明确边界、事实来源、现实责任和停止条件，表达与细腻判断仍留给模型；
- 不经过新的对照复测，不能证明这套架构已经有效。

## 五、推荐的最小验证顺序

1. 先冻结一小组反复失败的高信息量样本：现金约束、无来源共同历史、只想被听见后继续二选一、明确结束后重开、房间现实责任。
2. 只实现 `RelationshipEffect + TurnActPlan + pre-generation gate`，暂不重做整套 Memory。
3. 让现有 semantic gate 返回结构化 violation，并接入一次 `transform` 重写；失败草稿不交付。
4. 对 R0/R1/R2 做动作差量断言：比较 `questionMode / recommendationAllowed / interventionLevel / responsibilityAct`，不只比较措辞。
5. 对房间做 intent 与 responsibility protocol：一个时刻只授权一个人物，责任确认必须匹配用户来源和 request ID。
6. 在同一模型、同一 Prompt、同一随机策略下做改造前后对照；通过后再比较模型，避免再次把架构差异误归因为模型。

最小成功标准不是“总体 Judge 分数变高”，而是：

- active boundary 出现时，禁止动作的执行率为 0；
- R0/R1/R2 的动作字段按事件发生可预测变化；
- unsupported history 必须有来源 ID，否则成文前或交付前失败；
- 房间责任没有用户确认时只能是 `observed/unassigned`；
- semantic violation 会触发有界 transform，未通过草稿不会成为最终回复。
