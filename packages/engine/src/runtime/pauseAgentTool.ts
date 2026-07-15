import { z } from 'zod';
import { AGENT_TYPES, type AgentType } from '../types';
import type { RuntimeTool, RuntimeToolResult } from './agentRuntime';
import { defineRuntimeTool } from './defineRuntimeTool';

export const PAUSE_AGENT_INPUT_SCHEMA = z.object({
  agent: z.enum(AGENT_TYPES),
}).strict();

export type PauseAgentInput = z.infer<typeof PAUSE_AGENT_INPUT_SCHEMA>;

type DetailsRecord = Record<string, unknown>;

export type PauseAgentDetails = DetailsRecord & (
  | { status: 'paused'; agent: AgentType; changed: true; roomVersion: number }
  | { status: 'already_paused'; agent: AgentType; changed: false; roomVersion: number }
  | { status: 'rejected'; code: 'AGENT_NOT_IN_ROOM' | 'LAST_ACTIVE_AGENT' }
  | { status: 'conflict'; code: 'ROOM_VERSION_CONFLICT' | 'ROOM_BUSY' }
);

export type PauseAgentExecutor = (
  input: PauseAgentInput,
  signal: AbortSignal,
) => Promise<RuntimeToolResult<PauseAgentDetails>>;

/**
 * 只定义模型可见的持久暂停意图。roomId、userId 和版本由未来的
 * Room Command Harness 从可信上下文闭包注入，不能由模型选择。
 */
export function createPauseAgentTool(execute: PauseAgentExecutor): RuntimeTool<PauseAgentDetails> {
  return defineRuntimeTool({
    name: 'pause_agent',
    description: [
      '当用户明确要求某位当前房间成员暂停参与后续对话时使用。',
      '暂停会持续到用户恢复该成员。',
      '不要用于控制当前一次发言顺序，不要因用户表达不满自行暂停，也不要用于执行安全策略。',
    ].join(''),
    schema: PAUSE_AGENT_INPUT_SCHEMA,
    execute,
  });
}
