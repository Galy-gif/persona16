import type { AgentType } from '../types';

export interface RuntimeModelRef {
  provider: string;
  id: string;
}

export interface RuntimeSystemBlock {
  text: string;
  cache?: boolean;
}

export interface RuntimeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RuntimeToolResult<
  TDetails extends Record<string, unknown> = Record<string, unknown>,
> {
  content: string;
  details?: TDetails;
  terminate?: boolean;
}

export interface RuntimeTool<
  TDetails extends Record<string, unknown> = Record<string, unknown>,
> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown, signal: AbortSignal): Promise<RuntimeToolResult<TDetails>>;
}

export interface RuntimeLimits {
  maxTurns: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface RuntimeRequest {
  runId: string;
  model: RuntimeModelRef;
  system: RuntimeSystemBlock[];
  messages: RuntimeMessage[];
  tools?: RuntimeTool[];
  temperature?: number;
  limits: RuntimeLimits;
  metadata: {
    roomId: string;
    turnId: string;
    agent: AgentType;
    promptVersion: string;
  };
}

export type RuntimeStopReason =
  | 'complete'
  | 'max_turns'
  | 'max_tokens'
  | 'timeout'
  | 'aborted'
  | 'error';

export type RuntimeEvent =
  | { type: 'run_start'; runId: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_start'; callId: string; name: string; input: unknown }
  | { type: 'tool_end'; callId: string; name: string; result: RuntimeToolResult }
  | { type: 'usage'; inputTokens: number; outputTokens: number; estimatedCostUsd?: number }
  | { type: 'run_end'; text: string; stopReason: RuntimeStopReason }
  | { type: 'run_error'; code: string; message: string; recoverable: boolean };

export interface AgentRuntime {
  run(request: RuntimeRequest, signal?: AbortSignal): AsyncIterable<RuntimeEvent>;
  abort(runId: string): Promise<void>;
}
