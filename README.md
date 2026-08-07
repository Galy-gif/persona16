# persona16

persona16 是一个移动端优先的原创人物对话产品。所有用户遇见同一组正典人物，每位用户与人物形成私有关系分支；用户可以单聊，也可以邀请 2–3 位人物进入同一房间。

> 同一句话，不同人物暴露不同的理解世界方式。

16 型人格只作为内部创作先验，不是前台身份、心理诊断或官方 MBTI® 测评。

## 当前状态

- **工程内测候选已打通**：单聊、有限多人房、流式输出、成员控制、服务端状态、确认式记忆、安全旁路、反馈、移动端完整流程和 Sites 部署均有实现。
- **四位正典人物已进入生产链路**：林衡、夏栩、周禾和许野已接入正式 Prompt 与人物前台；16 型只保留为内部创作先验。
- **关系分支已参与生成与交付门**：已确认记忆会投影为可重建的关系事件和 Branch；active 边界、未解决张力及单个相关正向关系动作会进入本轮语义裁决。
- **协议 0.8 已实现但尚未完成发布验证**：发布门以用户最终收到的回复为准；仍需在当前干净 SHA 上完成三批付费模型复测和隐藏来源的人工盲审。

当前产品结论以[产品需求文档](docs/PRD.md)为准，文档入口见[文档导航](docs/README.md)。

## 架构

| 目录 | 职责 |
| --- | --- |
| `packages/engine` | 人物、Prompt、导演评分、有限房间循环、记忆策略、安全和评测规则 |
| `packages/runtime-pi` | Pi Agent Runtime 适配与模型执行事件流 |
| `packages/store` | PostgreSQL 状态、幂等 Turn、消息、记忆、反馈和共享限流 |
| `packages/turn-protocol` | Web、Store、评测与原生客户端共享的 Turn v1 wire contract |
| `packages/turn-application` | 从幂等预留到可信终态、原子提交与恢复的 Turn 执行闭环 |
| `apps/web` | Next.js 移动端界面与 HTTP/NDJSON Adapter |
| `eval` | 人物盲测、动态性、房间化学反应、安全和运行时回归 |

一次请求的主链路：

```text
用户命令
  → Web HTTP Adapter 解析身份、Cookie 与请求
  → Turn Application 执行版本、幂等、限流和安全检查
  → Director 提议发言计划
  → 确定性规则校验
  → 有限 Room Loop
  → Pi Runtime 生成人物发言
  → 原子持久化状态、事件和观测数据
  → Web Adapter 编码 NDJSON；Web/iOS 按可信终态恢复
```

## 核心约束

- 人物由稳定核心、运行时状态、关系分支和语气共同决定，不依赖固定口癖。
- 多人房每次发言后重新判断继续、追问、总结或停止，不让所有人物轮流作文。
- 人数、暂停、权限、预算和停止条件由代码控制，模型只能提出建议。
- 只有用户确认且来源 Turn 已完成的记忆才能进入后续 Prompt。
- `crisis` 和 `blocked` 内容绕过人格房间，使用独立安全响应。
- 评测先于继续扩展体验；现有移动端原型可用于内测，但人物、关系和房间质量通过阶段门前不宣称正式发布。

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm typecheck
pnpm test
pnpm --filter @persona16/web dev
```

Web 默认运行在 `http://localhost:3016`。开发环境未配置 `DATABASE_URL` 时使用内存 Store；生产环境必须使用 PostgreSQL。
GitHub CI 会启动 PostgreSQL，强制执行数据库集成测试、类型检查、Web 构建和生产依赖审计；本地未配置 `PERSONA16_TEST_DATABASE_URL` 时，对应数据库用例会明确跳过。

配置数据库后执行迁移：

```bash
pnpm --filter @persona16/store db:migrate
```

人物发言由 Pi Runtime 执行，可只改配置切换 AIHubMix、DeepSeek 或 Anthropic。当前经过信任/延迟/成本小样本验证的 AIHubMix 配置为：

```dotenv
PERSONA16_PROVIDER=aihubmix
AIHUBMIX_API_KEY=...
PERSONA16_AGENT_MODEL=gpt-5.6-luna
PERSONA16_ANALYSIS_MODEL=gpt-5.6-luna
PERSONA16_DIRECTOR_MODEL=deepseek-v4-flash
```

AIHubMix、DeepSeek 与 Anthropic 的人物生成都走同一个 Pi Runtime 边界；Director 和 Judge 的结构化调用继续复用引擎模型适配层。普通单聊按本轮任务决定是否使用思考与模型 Director，多 Agent 房仍保留模型调度。模型覆盖、legacy 回滚等完整变量见 `.env.example`。

## 常用评测

```bash
pnpm eval:blindtest
pnpm eval:dynamics
pnpm eval:pilot-characters
pnpm eval:trust-balance
pnpm eval:trust-suite
pnpm eval:rooms
pnpm eval:safety
pnpm eval:report
```

评测结果必须同时记录 Prompt、模型、rubric 和样本版本。自动 Judge 只用于批量初评，不能替代人工校准。

## 产品边界

- 产品不做心理诊断，也不替代医疗、法律或危机支持。
- 人物不能制造依赖、贬低现实关系或用内疚维持互动。
- MVP 不开放浏览器、Shell、文件写入等通用工具。
- 当前证据支持工程可行性和形成性人物校准，不支持留存、商业化或长期陪伴效果声明。
