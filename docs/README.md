# 文档导航

本目录区分当前产品依据、工程决策和历史证据。开始工作前先读当前文档；只有追溯决策或复现实验时，才进入历史目录。

## 当前产品依据

| 文档 | 用途 |
| --- | --- |
| [PRD](PRD.md) | 当前产品逻辑、L1–L8 主链路、功能边界和阶段门 |
| [领域语言](../CONTEXT.md) | 正典人物、关系分支、人物底色等统一术语 |
| [人物与关系模型](character-relationship-model.md) | 正典人物核心、私有关系分支和关系事件模型 |
| [首批四位人物 v0.3](characters/pilot-cast-v0.3.md) | 当前对话投影版本；人物核心继承 v0.2 |
| [自然口语与人物感 Rubric](evals/naturalness-personhood-rubric-v0.1.md) | 当前人工评测尺度和硬门 |

出现产品冲突时，以 PRD 中标记为“已确认”的结论为准；领域术语以根目录 `CONTEXT.md` 为准。

## 工程决策

`adr/` 保存已经采用的架构决策：

- [Pi Agent Runtime](adr/0001-pi-agent-runtime.md)
- [有限多人房循环](adr/0002-finite-room-loop.md)
- [服务端状态、记忆与安全](adr/0003-server-owned-state-memory-safety.md)
- [房间命令权限](adr/0004-room-command-permission.md)
- [循环 Hook 与待办恢复](adr/0005-loop-hooks-and-pending-work-recovery.md)
- [共享正典人物与私有关系](adr/0006-canonical-characters-private-relationships.md)
- [上下文投影与评测层级](adr/0007-context-projection-and-evaluation-levels.md)
- [关系事件持久化与影子 Branch](adr/0008-persist-relationship-events-and-shadow-branches.md)

ADR 记录决策当时的背景。新结论若改变既有决策，应新增 ADR，而不是改写旧文档。

## 评测与校准

`evals/` 保存可复测的样本、rubric 和形成性结论：

- [人物验证方案](evals/pilot-character-validation-v0.1.md)
- [自动预检](evals/pilot-character-preflight-2026-07-20.md)
- [首位用户人物校准](evals/pilot-human-calibration-2026-07-20.md)
- [v0.3 九场景复测报告](evals/pilot-character-retest-2026-07-21.md)
- [人物上下文与关系 Memory 修复周期](evals/active-context-memory-cycle-2026-07-21.md)
- [Bad case 修复实验卡](evals/intervention-card-template.md)

自动分数只用于发现问题。真人样本量、测试条件和证据边界必须与结论一起保留。

## 历史证据

以下资料用于复现和追溯，不代表当前路线：

- [MVP 开发路径与技术方案](MVP-development-plan.md)：2026-07-11 的实施计划。
- `baselines/`：引擎、Pi Runtime、Room Loop 和服务端状态的阶段基线。
- `audits/`：Phase 5 功能与界面验收记录。
- [首批人物 v0.1](characters/pilot-cast-v0.1.md)：旧人物版本，仅用于历史对照。
- [首批人物 v0.2](characters/pilot-cast-v0.2.md)：v0.3 的人物核心来源。
- [夏栩重设计候选](characters/xia-xu-redesign-candidates-v0.2.md)：人物选择过程，不是当前人物定义。

## 维护文档

`agents/` 只服务仓库协作工具，包括领域文档约定、Issue Tracker 和标签规则，不属于产品说明。
