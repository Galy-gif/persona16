# Web Agent 约定

本文件适用于 `apps/web/**`，并继承仓库根 `AGENTS.md`。

## 边界

- 这里负责 Next.js App Router 页面、移动端交互、API Route、会话编排和 Store/Engine/Runtime 的组合。
- 领域规则应进入 `@persona16/engine`，持久化实现应进入 `@persona16/store`，模型供应商执行应进入 `@persona16/runtime-pi`；不要在 Route 或 React 组件中复制这些规则。
- 服务端鉴权、权限、版本、幂等、限流、安全旁路与持久化成功条件不能下放到客户端。

## UI 与实现

- 产品是移动端优先的应用画布。房间主壳在宽屏宿主中仍保持最多 430px；UI 改动至少检查 320px、375px 和宽屏宿主，不得产生横向溢出。
- 保持 Server Component 为默认选择；只有需要浏览器状态、事件或 effect 时才添加 `"use client"`。
- 客户端不得接触供应商 API key、数据库连接串或服务端 Session Secret。
- 流式 Turn 必须保留取消、重复提交、结果未知和恢复路径；网络失败不等于服务端未执行。
- 使用 `apps/web/lib/client.ts` 维护客户端协议，变更响应结构时同步 Route、类型和测试。

## 验证

- 类型检查：`pnpm --filter @persona16/web typecheck`。
- 单元/API 测试由根目录 `pnpm test` 统一执行；改动相关测试位于 `apps/web/test/`。
- 构建检查：`pnpm --filter @persona16/web build`。
- 视觉或交互改动还需实际启动 `pnpm --filter @persona16/web dev`，检查真实页面、关键交互和浏览器控制台。
- 启动开发服务器可能机械更新 `next-env.d.ts`；只提交确有必要的变化。
