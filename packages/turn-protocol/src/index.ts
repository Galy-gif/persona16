import type {
  ModelBudgetSnapshot,
  RoomState,
  TurnStreamEvent,
} from '@persona16/engine';
import { AGENT_TYPES, decideRecoveryAction } from '@persona16/engine';
import { z } from 'zod';

export { TURN_EVENT_VERSION } from '@persona16/engine';
export type {
  FailureOutcome,
  RecoveryAction,
  TurnStopReason,
  TurnStreamEvent,
} from '@persona16/engine';

export const turnRequestSchema = z.object({
  roomId: z.string().uuid(),
  turnId: z.string().uuid(),
  roomVersion: z.number().int().positive(),
  command: z.object({
    type: z.literal('message'),
    text: z.string().trim().min(1).max(2_000),
    calledAgent: z.enum(AGENT_TYPES).optional(),
    mutterEnabled: z.boolean().optional(),
  }),
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;

export interface TurnDoneEvent {
  v: 1;
  turnId: string;
  type: 'done';
  room: RoomState;
  roomVersion: number;
  plan?: { scene: string; userEmotion: string };
  loop?: unknown;
  safetyLevel: string;
  modelBudget?: ModelBudgetSnapshot;
}

/** 完整的 Turn v1 wire event；Store 只负责原样持久化，不再扩展协议。 */
export type TurnEvent = TurnStreamEvent | TurnDoneEvent;

export interface TurnRecoveryDetails extends Record<string, unknown> {
  recoverable: boolean;
  recoveryAction: import('@persona16/engine').RecoveryAction;
  outcome: import('@persona16/engine').FailureOutcome;
  retryAfterMs?: number;
}

export function turnRecoveryDetails(
  code: string,
  status: number,
  options: {
    outcome?: import('@persona16/engine').FailureOutcome;
    retryAfterMs?: number;
  } = {},
): TurnRecoveryDetails {
  const outcome = options.outcome ?? (code === 'TURN_IN_PROGRESS' ? 'unknown' : 'known_failed');
  const recoverable = outcome === 'unknown'
    || code === 'ROOM_VERSION_CONFLICT'
    || code === 'TURN_IN_PROGRESS'
    || code === 'TURN_FAILED'
    || code === 'RATE_LIMITED'
    || status === 408
    || status === 429
    || status >= 500;
  return {
    recoverable,
    recoveryAction: decideRecoveryAction({ code, recoverable, outcome }),
    outcome,
    ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
  };
}

export function trustedTurnOutcome(events: readonly TurnEvent[]): 'done' | 'known_failed' | 'unknown' {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const terminal = events[index];
    if (terminal?.type === 'done') return 'done';
    if (terminal?.type === 'error') {
      return terminal.outcome === 'known_failed' ? 'known_failed' : 'unknown';
    }
  }
  return 'unknown';
}
