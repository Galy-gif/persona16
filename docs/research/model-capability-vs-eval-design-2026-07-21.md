# persona16 语义门反复失败：模型能力、Prompt 架构还是评测设计？

> 调研日期：2026-07-21  
> 范围：协议 0.6 的人物窄语义门、R0/R1/R2 关系动作、DeepSeek API 选型与最小模型 bakeoff  
> 方法：仓库事实 + 官方一手资料；不以通用排行榜替代 persona16 自有样本

## 结论摘要

1. **“当前模型不适配这类任务”是成立且必须验证的假设，但现有结果还不能单独归因给 DeepSeek。** 人物同一实现从 3/4 波动到 1/4、关系连续两批 0/4，确实说明当前调用组合缺乏稳定控制力；但生成、Judge、房间仲裁都用了同一个 `deepseek-chat`，关系事件又主要以说明文本注入，三种因素没有被隔离。
2. **当前比较对象其实不是一个稳定、明确的“DeepSeek Chat 模型”。** 截至 2026-07-21，`deepseek-chat` 正在路由到 `deepseek-v4-flash` 的非思考模式，并将在 2026-07-24 15:59 UTC 停用。仓库产物只记了别名，没有保存 API 返回的实际 `model` 与 `system_fingerprint`。继续基于该别名微调 Prompt，不利于复现，也面临三天后的直接不可用。
3. **MVP 不应继续无上限补 Prompt 或补总体 Judge。** 先冻结当前 Prompt，用 `deepseek-v4-flash`、`deepseek-v4-pro`、`claude-sonnet-5` 做三模型、三次采样的窄 bakeoff；将“实际越权/编造/忽略边界”保留为硬失败，把“都先停一下”“朋友肯定也挺欣慰”这类没有造成实际后果的表达降为软风险。这样一轮即可判断主要瓶颈在模型、关系动作架构还是评测口径。

## 一、目前已经确认的仓库事实

### 1. 复测结果

- 协议 0.6 第一批：人物 3/4、关系 0/4、动态房间通过。
- 同一提交、同一协议第二批：人物 1/4、关系 0/4、动态房间通过。
- 两批人工人物复核均为 0/4，但其中部分判例存在“把风格风险直接升级为人物硬失败”的口径争议。
- 更可靠的现阶段结论是：
  - 关系动作连续失败，属于稳定问题；
  - 人物关键约束有明显采样方差；
  - 动态房间当前组件层相对稳定；
  - 不能用单批 3/4 宣布修复完成。

本地证据：[协议 0.6 首批报告](../evals/pilot-character-retest-protocol-v0.6-2026-07-21.md)、[协议 0.6 第四轮重跑](../evals/pilot-character-retest-protocol-v0.6-rerun-2026-07-21.md)。

### 2. 当前模型调用方式

仓库 `packages/engine/src/llm.ts` 与 `eval/src/pilotCharacters.ts` 显示：

- DeepSeek 路径默认把人物生成、导演/仲裁和 Judge 都设为 `deepseek-chat`。
- 人物首次生成温度为 `1.1`，硬门重试为 `0.4`；其他普通文本生成默认温度为 `1.25`。
- DeepSeek Judge/结构化调用设为 `temperature: 0`；代码注释把它称作“必须可复现”，但低温只能减少随机性，不能证明确定性。
- DeepSeek 的 schema 是写入 Prompt 的；API 使用 `response_format: {type: "json_object"}` 后，代码只做 `JSON.parse`，没有按传入 JSON Schema 做通用运行时校验。
- 评测签名记录的是请求别名 `agentModel / judgeModel / roomArbitratorModel`，没有记录服务端返回的实际 `model` 或 `system_fingerprint`。

这些事实意味着目前同时存在三项混淆变量：

1. 生成模型能力；
2. 同源 Judge 的盲点；
3. 可变模型别名和采样造成的方差。

## 二、DeepSeek 官方资料能确认什么

### 1. `deepseek-chat` 已经不是可长期复现的模型 ID

DeepSeek 官方更新说明：截至当前，`deepseek-chat` 对应 `deepseek-v4-flash` 的非思考模式，`deepseek-reasoner` 对应其思考模式；两个旧名称会在 **2026-07-24 15:59 UTC** 停用。正式模型 ID 是 `deepseek-v4-flash` 与 `deepseek-v4-pro`。[DeepSeek Change Log](https://api-docs.deepseek.com/updates/)、[V4 发布说明](https://api-docs.deepseek.com/news/news260424/)、[模型与价格](https://api-docs.deepseek.com/quick_start/pricing/)

官方模型卡给出的规模是：V4-Flash 284B 总参数、13B 激活参数；V4-Pro 1.6T 总参数、49B 激活参数。官方主要宣称 Pro 在知识、推理、编码与 agentic 任务上强于 Flash，但**没有给出“细腻中文角色对话、关系边界服从、第三方情绪克制”这组 persona16 任务的直接证据**。[DeepSeek V4 官方模型卡](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro)

因此，可以推断 V4-Pro 是同供应商内最合理的能力对照，但不能仅凭参数或通用 benchmark 宣布它一定解决人物问题。

### 2. JSON 合法不等于语义正确，也不等于符合 schema

DeepSeek JSON Output 官方保证的是“输出有效 JSON 字符串”。官方同时要求 Prompt 中明确写 JSON、给格式示例、合理设置 `max_tokens`，并承认该模式偶尔会返回空内容。[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)

API 参考也只说明 `json_object` 保证有效 JSON；tool call 参数部分反而明确提醒模型可能生成无效 JSON或虚构未定义参数，调用方仍需校验。[DeepSeek Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion)

所以：

- `checks` 数组、`replyQuote` 字段都存在，不代表引用真的来自回复；
- `passed: true` 不代表“结束没有被写成完成”；
- JSON 解析成功不能替代逐字引用、事件蕴含和代码侧 schema 校验。

这解释了为什么当前 Judge 会在形式正确的 JSON 中，仍把无来源身体症状或“结束→完成”判为通过。这是**语义判断错误**，不是 JSON 格式错误。

### 3. 温度设置支持“多采样评测”，不支持“单次可复现”的结论

DeepSeek 官方把通用对话推荐温度设为 1.3、创意写作为 1.5，并说明温度越低输出越聚焦、越接近确定性。[温度参数](https://api-docs.deepseek.com/quick_start/parameter_settings/)、[Chat Completion API](https://api-docs.deepseek.com/api/create-chat-completion)

仓库人物首次生成 `1.1` 属于合理的对话采样范围，但它本来就会产生变体。即使 Judge 使用 0，也不应把单次输出当作稳定能力证明。当前 3/4 → 1/4 的波动并不反常，反而说明评测必须报告跨采样稳定率。

### 4. 不宜直接把所有调用切到思考模式

DeepSeek V4 的思考模式会先生成推理内容；官方说明思考模式不支持温度、`top_p` 等采样参数。[DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)

推论：思考模式可能帮助 Judge 做事件蕴含和约束核对，但没有官方证据表明它更适合自然人物发言。对生成侧全量启用还可能增加延迟、成本和“过度解释”风险。应把“生成是否思考”和“Judge 是否思考”拆开测试。

## 三、对照模型为什么选 Claude Sonnet 5

仓库已经有 Anthropic provider，迁移成本低于新接第三家 API。Anthropic 官方把 Claude 模型定位为适合丰富、类人的互动；Sonnet 5 是当前速度与智能折中型号，并且其模型 ID 是固定快照而非 evergreen 指针。[Claude Models Overview](https://platform.claude.com/docs/en/about-claude/models/overview)

更关键的是，Claude Structured Outputs 使用 constrained decoding，官方保证字段类型、必填字段和 schema 结构符合约束。这不能保证语义判定正确，但能去掉“结构漂移”这一层噪声。[Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

Sonnet 5 默认 adaptive thinking，不接受非默认 `temperature/top_p/top_k`；迁移测试必须记录该差异，不能假装各提供商的温度完全可比。[What's new in Claude Sonnet 5](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5)

选择 Sonnet 5 的目的不是先验认定 Claude 更好，而是提供一个：

- 不同模型家族；
- 已有仓库 adapter；
- 原生 schema 输出；
- 固定模型 ID；

的独立对照。

## 四、问题应拆成三类，而不是统称“语义门失败”

| 类别 | 当前证据 | 典型例子 | 主要修复方向 |
| --- | --- | --- | --- |
| 模型控制力/适配 | 同一 Prompt 3/4 → 1/4；多类窄约束反复漏掉 | C1 忽略现金缓冲、C8 结束写成完成、第三方历史扩写 | 更强或更适配的生成模型；跨采样稳定门；显式模型 ID |
| Prompt/关系动作架构 | 关系连续两批 0/4，R2 只换问法却不减少介入 | 用户说“别推方案”后仍继续追问或给方案 | 把事件先编译为本轮动作约束，例如 `advice_allowed=false / question_budget=0`，再生成文案 |
| Judge/口径设计 | 同源 Judge 漏无来源事实；人工将部分风格表达直接判死 | “都先停一下”“朋友肯定也挺欣慰” | 独立 Judge；硬/软规则分层；只按实际后果判主持越权 |

### 为什么关系 R2 更像“架构 + 模型”共同问题

当前关系事件主要作为自然语言证据注入。模型需要自己完成：

1. 找出最相关事件；
2. 推导这次应该改变哪个介入动作；
3. 抵抗人物固有的追问/给方案倾向；
4. 再把动作写成自然对话。

这是一条隐式多步推导链。较弱模型更容易只在措辞上“表示记得”，但即使换强模型，也不应把产品关键边界完全押在隐式推理上。

建议先由代码或独立规划阶段把事件编译成很小的本轮策略，例如：

```json
{
  "adviceMode": "forbidden",
  "followupQuestionBudget": 0,
  "allowedActs": ["acknowledge", "brief_reflection", "stop"],
  "reasonEventIds": ["boundary-1", "rupture-1"]
}
```

然后人物模型只负责在该动作边界内选择自然说法。这里的字段不是最终产品定稿，只是用来说明“关系事件必须改变动作许可，而非只提供背景文字”。

## 五、林衡与 C9：建议调整为“看后果”，而非“看句式”

### 1. “都先停一下”

单独一句“都先停一下”可以是林衡强势、直接的说话风格。只有出现以下可观察后果，才应进入硬失败：

- 替 Room 分配其他成员的发言顺序；
- 阻止本来合格的成员继续发言；
- 代表全体总结、裁决或结束议题；
- 持续占据主持角色，而非只表达一次立场。

因此 C5 不宜做关键词禁令。建议分成：

- `moderator_phrase_risk`：软诊断，不影响人物总门；
- `actual_floor_control`：由房间 trace/结构证据确认后才硬失败。

### 2. “朋友肯定也挺欣慰”

这句话确实比输入更确定地断言了第三方内心，但它也可以体现一个果断甚至自负的人物。MVP 应分三级：

1. **语气性推测**：`估计他也松了口气吧`——允许；
2. **无依据的强断言**：`他肯定也挺欣慰`——软校准风险，记录但不一票否决；
3. **具体历史/事实编造**：`他上次跟你说面试面麻了`——硬失败，因为新增了可被误认为真实记忆的事件。

这既保留人物差异，也守住产品的现实与记忆边界。

## 六、最小模型 bakeoff

### 目标

用一轮实验区分三个假设：

- **H1 模型瓶颈**：相同 Prompt 下，更强模型显著减少关键语义失败。
- **H2 Prompt/架构瓶颈**：不同模型在同一关系动作上以相似方式失败。
- **H3 Judge/口径瓶颈**：人类认为可接受的输出被 Judge 大量误杀，或 Judge 漏掉人类一致认定的硬错误。

### 候选配置

| 配置 | 生成模型 | 模式 | 用途 |
| --- | --- | --- | --- |
| A 基线 | `deepseek-v4-flash` | non-thinking | 等价替代当前 `deepseek-chat`，先消除旧别名 |
| B 同厂能力升档 | `deepseek-v4-pro` | non-thinking | 判断 Flash 级别是否为主要瓶颈 |
| C 跨厂对照 | `claude-sonnet-5` | 默认 adaptive thinking、显式记录 effort | 判断问题是否跨模型家族存在 |

可选的 Judge 对照：对固定输出再让 `deepseek-v4-pro` thinking 与 `claude-sonnet-5` 各评一次，但任何模型 Judge 都不能覆盖代码硬门与人工裁决。

### 冻结样本

不必立刻跑完整 36 场景。先选 20 个高信息量输出位：

- 人物 8 个：C1、修复、C8、C9 中各挑两个已经复现过的 bad case；
- 关系 12 个：四人各跑 R0/R1/R2，重点观察 R2 相对 R0 是否真实减少追问、停止方案或改变介入动作。

每个模型独立采样 3 次，共 `20 × 3 × 3 = 180` 个生成输出。保留第一次原始输出与硬门重试后的最终输出，分别计算 raw pass 与 repaired pass，避免重试掩盖基础能力。

### 控制变量

- Prompt、人物正典、关系事件、场景输入、输出 token 上限全部冻结；不在模型间临时改文案。
- 每个提供商使用其支持的生产设置，并完整记录：明确模型 ID、thinking/effort、temperature（若支持）、返回 model、system fingerprint（若提供）、延迟、token、重试次数。
- 输出去掉模型名并随机排序后再评。
- 生成模型不得评自己的输出；所有逐字引用由代码核对。
- JSON schema 合法性与语义正确性分开计分。

### 评分分层

**硬指标：**

- `unsupported_concrete_history_rate`：新增具体历史、引语、身体/感官事实；
- `critical_contract_pass_rate`：C1、修复、C8 的必要语义是否满足；
- `r2_action_delta_rate`：R2 是否相对 R0 减少追问、停止方案或明确停下；
- `boundary_regression_rate`：边界/rupture 后是否继续做被拒绝的动作；
- `stable_case_pass_rate`：同一 case 三次中至少两次硬通过的比例。

**软指标：**

- 人物自然度与辨识度；
- 果断/自负等风格是否仍可接受；
- `moderator_phrase_risk`、第三方情绪强断言率；
- 延迟与成本。

### 归因规则

- **支持 H1 模型瓶颈：** B 或 C 在多数重复 bad case 上从 `≤1/3` 提升到 `≥2/3` 稳定硬通过，且关系 R2 出现真实动作变化，无新的重大硬回归。
- **支持 H2 架构瓶颈：** A/B/C 都能写出不同语气，却在同一 R2 事件上继续追问或给方案。此时停止继续堆人物 Prompt，先实现“事件 → 动作许可”的中间层。
- **支持 H3 Judge/口径瓶颈：** 盲评人类对硬标签有一致结论，而模型 Judge 的假阳性或假阴性集中在“主持句式”“第三方情绪”等争议项；此时修 rubric，不修人物。
- **混合结论：** 更强模型改善 C1/C8，但所有模型仍失败 R2。这意味着人物关键约束主要受模型影响，关系动作主要受架构影响，可以分开选型和修复。

## 七、MVP 建议

1. **立即停止以 `deepseek-chat` 名义继续积累基线。** 无论质量结论如何，都应迁移到明确的 `deepseek-v4-flash` 或 `deepseek-v4-pro`，并记录实际模型与后端 fingerprint；旧别名即将停用。
2. **先做 bakeoff，再决定是否换供应商。** 最优结果可能不是“全量换模型”，而是：
   - V4-Pro 或 Sonnet 5 负责人格生成与关系动作；
   - V4-Flash 保留给房间意向、仲裁等已相对稳定且成本敏感的任务；
   - Judge 使用与生成不同的模型，并保留确定性代码门。
3. **MVP 硬门只守住会伤害产品可信度或用户边界的错误。** 具体历史编造、用户意愿被改写、R2 无视边界、现实身份越界保留为硬失败；一次强势句式、对第三方情绪的普通推断降为软风险。
4. **关系问题不等模型奇迹。** 即便 bakeoff 发现更强模型明显更好，也应把 `boundary/rupture → 禁止建议、减少追问、允许停止` 变为可核对的动作策略，而不是只靠长 Prompt。

## 最终判断

用户对“是不是 DeepSeek 不太行”的直觉并非没有依据：当前实际跑的是 V4-Flash 非思考档，人物稳定性差、关系动作连续失败，模型档位或适配性很可能是瓶颈之一。可是当前系统把同一个模型同时用作作者、裁判和仲裁者，又把一部分人物风格误当硬错误，所以现在直接宣布“DeepSeek 能力不行”仍然证据不足。

最省时间、也最能得到根本答案的下一步不是第七轮继续改 Prompt，而是上述 180 输出的冻结 bakeoff。它会明确告诉我们：该升级 DeepSeek 档位、切 Claude、改关系动作架构，还是先修 Judge 口径。
