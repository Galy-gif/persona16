import { createHash } from 'node:crypto';
import {
  AGENT_TYPES,
  decideRecoveryAction,
  type FailureOutcome,
  type RecoveryAction,
} from '@persona16/engine';
import type { PersistedTurnEvent } from '@persona16/store';
import { z } from 'zod';
import { jsonError, withSessionCookie } from './http';

export const TURN_PROMPT_VERSION = 'web-mvp-v6';
export const TURN_BUILD_VERSION = (
  process.env.PERSONA16_BUILD_VERSION
  ?? process.env.VERCEL_GIT_COMMIT_SHA
  ?? 'development'
).slice(0, 80);

export const turnRequestSchema = z.object({
  roomId: z.string().uuid(),
  turnId: z.string().uuid(),
  roomVersion: z.number().int().positive(),
  command: z.object({
    type: z.literal('message'),
    text: z.string().trim().min(1).max(2_000),
    calledAgent: z.enum(AGENT_TYPES).optional(),
  }),
});

export type TurnRequest = z.infer<typeof turnRequestSchema>;

export interface TurnRecoveryDetails extends Record<string, unknown> {
  recoverable: boolean;
  recoveryAction: RecoveryAction;
  outcome: FailureOutcome;
  retryAfterMs?: number;
}

export function turnRecoveryDetails(
  code: string,
  status: number,
  options: { outcome?: FailureOutcome; retryAfterMs?: number } = {},
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

export function unknownTurnStoreRecovery(code: string, status: number): TurnRecoveryDetails {
  if (code === 'INTERNAL_ERROR') {
    return turnRecoveryDetails(code, status, { outcome: 'unknown' });
  }
  return turnRecoveryDetails(code, status);
}

export function turnRequestHash(value: TurnRequest): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function ndjsonHeaders(setCookie?: string): Headers {
  return withSessionCookie(new Headers({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Content-Type-Options': 'nosniff',
  }), setCookie);
}

export function replayTurnResponse(events: PersistedTurnEvent[], setCookie?: string): Response {
  const body = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  const headers = ndjsonHeaders(setCookie);
  headers.set('X-Persona16-Replay', '1');
  return new Response(body, { headers });
}

export function turnConflictResponse(code: string, setCookie?: string): Response {
  const messages: Record<string, string> = {
    TURN_IN_PROGRESS: '这个房间正在生成另一轮回复',
    ROOM_VERSION_CONFLICT: '房间已在其他页面更新，请刷新后重试',
    IDEMPOTENCY_MISMATCH: '同一个 turnId 不能用于不同请求',
    TURN_FAILED: '这个 turnId 已失败，请使用新的 turnId 重试',
  };
  const response = jsonError(
    code,
    messages[code] ?? '请求冲突',
    409,
    undefined,
    turnRecoveryDetails(code, 409),
  );
  if (setCookie) response.headers.set('Set-Cookie', setCookie);
  return response;
}
