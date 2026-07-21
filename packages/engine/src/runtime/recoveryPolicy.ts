import type { RuntimeStopReason } from './agentRuntime';

export type RecoveryAction = 'retry' | 'transform' | 'refresh' | 'stop';
export type FailureOutcome = 'known_failed' | 'unknown';

export interface RuntimeFailureDetails {
  code: string;
  message: string;
  recoverable: boolean;
  stopReason?: RuntimeStopReason;
  hadPartialText?: boolean;
}

export class RuntimeExecutionError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly stopReason?: RuntimeStopReason;
  readonly hadPartialText: boolean;

  constructor(details: RuntimeFailureDetails) {
    super(details.message);
    this.name = 'RuntimeExecutionError';
    this.code = details.code;
    this.recoverable = details.recoverable;
    this.stopReason = details.stopReason;
    this.hadPartialText = details.hadPartialText ?? false;
  }
}

export interface RecoveryDecisionInput {
  code: string;
  recoverable: boolean;
  outcome: FailureOutcome;
  stopReason?: RuntimeStopReason;
  userCancelled?: boolean;
}

/**
 * 将底层失败提示转换成 Harness 恢复动作。这里只决定下一步，不执行自动重试。
 */
export function decideRecoveryAction(input: RecoveryDecisionInput): RecoveryAction {
  const code = input.code.toUpperCase();
  if (input.userCancelled || input.stopReason === 'aborted' || code === 'CANCELLED') return 'stop';
  if (input.outcome === 'unknown') return 'refresh';
  if (code === 'ROOM_VERSION_CONFLICT' || code === 'TURN_IN_PROGRESS') return 'refresh';
  if (input.stopReason === 'max_tokens'
    || code === 'RUNTIME_MAX_TOKENS'
    || code === 'PROMPT_TOO_LONG'
    || code === 'CONTEXT_LENGTH_EXCEEDED') {
    return 'transform';
  }
  if (code === 'INVALID_REQUEST'
    || code === 'INVALID_JSON'
    || code === 'IDEMPOTENCY_MISMATCH'
    || code === 'MODEL_NOT_FOUND'
    || code === 'INVALID_MESSAGES'
    || code === 'MODEL_BUDGET_EXHAUSTED'
    || code === 'UNAUTHORIZED'
    || code === 'FORBIDDEN') {
    return 'stop';
  }
  return input.recoverable ? 'retry' : 'stop';
}
