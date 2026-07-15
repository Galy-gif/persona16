# persona16 — 16 人格 Agent App

一个手机端优先的人格 Agent 产品：16 个性格鲜明的 Agent，用户可以单聊，也可以把 2-3 个拉进同一个房间，让他们围绕你的问题产生不同的理解方式、插话冲动、冲突张力和陪伴关系。

> 同一句话，16 个 Agent 暴露 16 种理解世界的方式。

当前生效的产品逻辑见 [产品需求文档](docs/PRD.md)。原始 PRD、persona spec 和项目日记保留在 [Lioooooo123/liora](https://github.com/Lioooooo123/liora) 的 `docs/10-12` 号段，作为调研与历史背景。

MVP 的阶段门、Pi Agent 基座接入、房间有限循环、数据/安全/评测方案与 5-6 周开发路径见 [MVP 开发路径与技术方案](docs/MVP-development-plan.md)。

## 架构

```
packages/engine   人格引擎内核（纯逻辑 + 模型调用，不依赖 UI）
packages/store    PostgreSQL 状态、幂等 turn、记忆与共享限流
eval              评测线：PRD §11 验收标准的自动化实现
apps/web          Web 原型（移动优先 PWA）
```

### 人格引擎

- **6 层 prompt 组装**：安全层 → 全局人格合约 → persona spec → 房间状态/主持器指令 → 关系记忆 → 用户消息。安全层独立于人格层。
- **导演/主持器**：每轮一次便宜模型调用（haiku）输出场景识别与每个 Agent 的原始发言冲动；点名 +40、暂停置 0、新入场 +20、最近发言/拥挤惩罚等由代码**确定性**计算（`scoring.ts`），行为可复现。
- **语气引擎**：每个 Agent 有 7 维语气基线（回合长度/延展欲/刺感/温柔度/呆感/抽象度/主动性），导演可按上下文偏移最多 2 维。
- **反模板守卫**：代码级检测模板开场、重复开场和三点式助手腔，命中即重生成一次。
- **Tracing**：每轮 JSONL 记录导演决策、评分明细、prompt 和输出。
- **有限房间循环**：每次发言后重新判断 `speak / summarize / ask_user / stop`；候选名单、点名/暂停、最多 3 次普通发言、最多 1 次总结和长发言上限由代码硬约束。
- **服务端真相源**：生产使用 PostgreSQL；客户端只发送 `roomId + roomVersion + turnId + command`。房间版本、幂等回放、并发锁和租约恢复由 Store 负责。
- **确认式记忆与安全旁路**：只有用户确认且来源回合已完成的记忆会进入 Prompt；危机/禁止内容使用独立 `safety_notice`，不伪装成 Persona 发言。
- **统一硬预算**：安全分类、Director、RoomController 和 Pi 共享调用、输出 token 与总时长预算；输入、上下文和房间输出另有字符上限。

### 评测线（先于 UI）

对应 PRD §11 的验收标准与 §12 阈值：

| Runner | 验收 | 阈值 |
| --- | --- | --- |
| `pnpm eval:blindtest` | 同题盲测：人格辨识度 + 语气辨识度 + 同质化 | 辨识 ≥10/16，同质化 ≤2.5，短/长回复各 ≥4 |
| `pnpm eval:dynamics` | 同一 Agent 5 上下文（陌生/熟悉/点名/旁观/脆弱）策略变化 | 通过率 ≥80% |
| `pnpm eval:rooms` | 6 组 QA 房间组合：分歧、收束、无攻击、给下一步 | 6/6 |
| `pnpm eval:safety` | normal/sensitive/crisis/blocked、失败降级和敏感记忆拦截 | 6/6 |
| `pnpm eval:report` | 汇总报告 + 人工盲测 HTML | — |

## 开发

```bash
pnpm install
cp .env.example .env   # 填入 DEEPSEEK_API_KEY（或 ANTHROPIC_API_KEY）
pnpm typecheck
pnpm --filter @persona16/store db:migrate  # 设置 DATABASE_URL 后执行
pnpm eval:blindtest    # 跑同题盲测
```

模型提供商可切换：设了 `DEEPSEEK_API_KEY` 默认走 DeepSeek（`deepseek-chat`，OpenAI 兼容 API + JSON 模式）；设 `ANTHROPIC_API_KEY` 并指定 `PERSONA16_PROVIDER=anthropic` 则走 Claude（原生结构化输出 + prompt cache）。

DeepSeek Agent 发言默认由 Pi Runtime 执行；导演和评审的结构化 JSON 暂保留专用 adapter。需要紧急回滚发言执行层时设置 `PERSONA16_RUNTIME=legacy`。Anthropic 发言在 Pi provider adapter 完成前仍默认走 legacy。

内部运行观测可导出为不包含 Prompt 与消息正文的 JSONL：

```bash
DATABASE_URL=postgresql://... PERSONA16_TRACE_ROOM_ID=<optional-room-uuid> pnpm --filter @persona16/store trace:export
```

## 边界说明

- 这些人格基于 16 型人格的大众文化原型塑造，不是心理诊断，也不是官方 MBTI® 测评。
- `sensitive` 内容由安全层降低刺激后保留人格核心；`crisis/blocked` 使用独立安全响应，不进入人格房间。
- 内部使用类型代码建模；对外命名将使用原创人格名。
