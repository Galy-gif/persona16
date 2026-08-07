# persona16 的第二大脑协作约定

本文件对整个仓库生效。进入含有更深层 `AGENTS.md` 的目录时，同时遵守根规则与离目标文件最近的规则；发生冲突时以更具体的规则为准。

## 仓库地图

| 路径 | 职责 | 局部说明 |
| --- | --- | --- |
| `apps/web` | Next.js 移动端界面、API Route 与 Turn Harness | `apps/web/AGENTS.md` |
| `packages/engine` | 人物、Prompt、语义裁决、房间循环、安全与恢复策略 | `packages/engine/AGENTS.md` |
| `packages/runtime-pi` | Pi Agent Runtime 与模型供应商适配 | `packages/runtime-pi/AGENTS.md` |
| `packages/store` | 内存/PostgreSQL Store、迁移、关系投影与 Trace | `packages/store/AGENTS.md` |
| `packages/turn-protocol` | Turn v1 请求、事件、可信终态与恢复元数据 | `packages/turn-protocol/AGENTS.md` |
| `packages/turn-application` | 幂等预处理、执行、流式事件与原子提交编排 | `packages/turn-application/AGENTS.md` |
| `eval` | 自动评测、语料、协议门与报告 | `eval/AGENTS.md` |
| `docs` | PRD、领域语言、ADR、评测协议与研究记录 | `docs/AGENTS.md` |
| `scripts` | 构建和发布准备脚本 | `scripts/AGENTS.md` |

## 开发基线

- 使用仓库声明的 `pnpm@11.11.0`，不要混用 npm 或 yarn 写入 lockfile。
- 安装依赖用 `pnpm install`；新增依赖时放到真正使用它的 workspace，并说明运行时或开发时用途。
- 全仓类型检查：`pnpm typecheck`。
- 全仓单元测试：`pnpm test`。未设置 `PERSONA16_TEST_DATABASE_URL` 时 PostgreSQL 集成测试允许明确跳过。
- Web 生产构建：`pnpm --filter @persona16/web build`；Cloudflare/Sites 完整构建：`pnpm build`。
- 本地运行：`pnpm --filter @persona16/web dev`，默认地址为 `http://localhost:3016`。
- 提交前至少运行与改动直接相关的测试、`pnpm typecheck` 和 `git diff --check`；涉及跨 workspace 契约时运行 `pnpm test`。

## 实施规则

- 修改前先读根 `CONTEXT.md`、相关 ADR 和目标目录的 `AGENTS.md`，沿用项目已有领域术语。
- 保持 workspace 边界：Web 负责传输和呈现，Engine 负责确定性产品规则，Runtime 负责模型执行，Store 负责持久化，Eval 负责验证。
- 硬门、权限、预算、幂等、停止条件和安全边界必须由代码确定，不能只依赖 Prompt 或模型自觉。
- 新增或改变跨模块契约时，更新公开类型/导出、调用方、测试和相应文档；重大架构决策新增 ADR。
- 不手改 `.next/`、`.next-dev/`、`.open-next/`、`.wrangler/`、`dist/`、`.sites-worker/`、`node_modules/`、`*.tsbuildinfo` 或评测生成 artifact。
- 不读取、输出或提交 `.env` 中的密钥。示例配置只写占位值，并同步到 `.env.example`。
- 保留用户已有未提交改动；不要为了整理工作树覆盖或回退无关文件。

本项目连接到个人 Obsidian 第二大脑：`/Users/gouzi/Documents/Obsidian Vault`。

若该绝对路径在当前机器或容器中不存在，先确认是否有已挂载的真实 Vault 路径；不要自行创建替代 Vault，也不要让缺失的外部路径阻塞纯仓库工作。需要同步但 Vault 不可用时，在交付说明中明确记录未同步原因。

## 每次会话开始

在执行会影响产品方向、架构、评测、实现计划或重要代码之前，先按需阅读：

1. `/Users/gouzi/Documents/Obsidian Vault/wiki/hot.md`（必读，短期上下文）
2. `/Users/gouzi/Documents/Obsidian Vault/wiki/entities/persona16.md`（项目现状）
3. 与本次任务直接相关的会话、来源或概念页

不要为普通机械改动加载整个 vault；热缓存不足时再逐层深入 `wiki/index.md` 与相关页面。

## 每个重要任务完成时

当本次会话产生可复用的决策、评测结果、产品/架构变更、重要实现进展或明确的下一步时，必须同步整理到 vault：

这条同步是默认收尾动作，即使用户没有再次提到 Obsidian，也不要等用户提醒；只有纯机械问答、无状态变化的查询或完全重复内容才跳过。

- 新建或更新 `wiki/sessions/` 下的会话记录（事实、决策、结果、待办；使用中文与 Obsidian 双链）。
- 如项目状态改变，更新 `wiki/entities/persona16.md`。
- 在 `wiki/log.md` 顶部追加一条记录。
- 覆盖更新 `wiki/hot.md` 的 `Last Updated` 与最近事实/活跃线程，使下一次会话可直接恢复上下文。
- 需要时更新 `wiki/index.md` 的会话索引。

无持久价值的机械问答、临时排障或重复内容不建新页面。不要记录密钥、token、私密个人信息或完整原始对话。

## 当前产品原则

- 评测优先于体验扩展：先用 PRD 的盲测、动态性、房间化学反应指标验证人格引擎，再把结果转为 UI 迭代。
- 人格是稳定核心 + 运行时动态状态 + 语气采样，不能退化成 MBTI 标签或固定口头禅。
- 多 Agent 房间通过发言选择、沉默、短补充和冲突管理产生价值，不是所有角色轮流回答。
- 16 型人格仅是大众文化原型；不是心理诊断、官方 MBTI® 测评或专业支持的替代品。

## 安全与工作树

- 保留并尊重已有未提交改动；开始前查看 `git status`。
- `.env` 内的 API key 永不读取、展示或写入 Obsidian。

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `Galy-gif/persona16`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout: root `CONTEXT.md` and system-wide ADRs under `docs/adr/`. See `docs/agents/domain.md`.
