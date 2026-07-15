# persona16 的第二大脑协作约定

本项目连接到个人 Obsidian 第二大脑：`/Users/gouzi/Documents/Obsidian Vault`。

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
