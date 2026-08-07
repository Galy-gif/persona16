# Pi Runtime Agent 约定

本文件适用于 `packages/runtime-pi/**`，并继承仓库根 `AGENTS.md`。

## 边界

- 本包只负责把 Engine 的 Runtime 契约适配到 Pi Agent Runtime 和模型供应商，不能重新裁决人物、权限、房间预算、安全或恢复策略。
- 供应商差异收敛在适配层；向 Engine/Web 暴露稳定、供应商无关的事件与错误语义。
- 保留流式事件顺序、取消传播、工具暂停、usage/trace 和终态的可观测性。超时或连接中断不得伪装成确定失败。
- API key 和 base URL 只从运行环境读取；日志、错误和测试 fixture 不得包含真实凭据或完整敏感 Prompt。

## 修改要求

- 升级 Pi 依赖或新增供应商前，确认其事件模型、取消行为、结构化输出和 usage 字段，并补适配测试。
- Engine 契约变化应在此做最薄映射，不复制 Engine 规则。
- 测试使用 fake/stub，默认不得发起真实付费模型请求。

## 验证

- 类型检查：`pnpm --filter @persona16/runtime-pi typecheck`。
- 单元测试由根目录 `pnpm test` 执行，相关测试位于 `packages/runtime-pi/test/`。
- 供应商或事件流变更需要额外运行明确的 smoke/eval 命令，并在结果中记录模型、配置与是否产生费用。
