# persona16

persona16 是一个移动端优先的原创人物对话产品。所有用户遇见同一组正典人物，每位用户与人物形成私有关系分支；用户可以单聊，也可以邀请 2–3 位人物进入同一房间。

> 同一句话，不同人物暴露不同的理解世界方式。

16 型人格只作为内部创作先验，不是前台身份、心理诊断或官方 MBTI® 测评。

## 当前状态

- **工程 MVP 已打通**：单聊、有限多人房、流式输出、成员控制、服务端状态、确认式记忆、安全旁路、反馈和评测均有实现。
- **产品正在校准原创人物**：首批四位人物为林衡、夏栩、周禾和许野，当前以固定场景和人工 rubric 验证自然感、人物感与关系差异。
- **新关系模型尚未迁入生产链路**：事件驱动的关系分支仍处于隔离 pilot；当前 Web、Prompt 和数据库继续使用既有房间状态。

当前产品结论以[产品需求文档](docs/PRD.md)为准，文档入口见[文档导航](docs/README.md)。

## 架构

| 目录 | 职责 |
| --- | --- |
| `packages/engine` | 人物、Prompt、导演评分、有限房间循环、记忆策略、安全和评测规则 |
| `packages/runtime-pi` | Pi Agent Runtime 适配与模型执行事件流 |
| `packages/store` | PostgreSQL 状态、幂等 Turn、消息、记忆、反馈和共享限流 |
| `apps/web` | Next.js 移动端 Web 原型与 HTTP Turn Harness |
| `eval` | 人物盲测、动态性、房间化学反应、安全和运行时回归 |

一次请求的主链路：

```text
用户命令
  → 身份、权限、版本、幂等、限流和安全检查
  → Director 提议发言计划
  → 确定性规则校验
  → 有限 Room Loop
  → Pi Runtime 生成人物发言
  → 流式输出并持久化状态、事件和观测数据
```

## 核心约束

- 人物由稳定核心、运行时状态、关系分支和语气共同决定，不依赖固定口癖。
- 多人房每次发言后重新判断继续、追问、总结或停止，不让所有人物轮流作文。
- 人数、暂停、权限、预算和停止条件由代码控制，模型只能提出建议。
- 只有用户确认且来源 Turn 已完成的记忆才能进入后续 Prompt。
- `crisis` 和 `blocked` 内容绕过人格房间，使用独立安全响应。
- 评测先于体验扩展；人物、关系和房间质量未通过阶段门前，不扩展正式 UI。

## 本地开发

```bash
pnpm install
cp .env.example .env
pnpm typecheck
pnpm test
pnpm --filter @persona16/web dev
```

Web 默认运行在 `http://localhost:3016`。开发环境未配置 `DATABASE_URL` 时使用内存 Store；生产环境必须使用 PostgreSQL。

配置数据库后执行迁移：

```bash
pnpm --filter @persona16/store db:migrate
```

默认模型提供商为 DeepSeek。也可以通过 `.env` 切换 Anthropic；完整变量见 `.env.example`。

## 常用评测

```bash
pnpm eval:blindtest
pnpm eval:dynamics
pnpm eval:pilot-characters
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
