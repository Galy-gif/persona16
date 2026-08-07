import {
  LEGACY_PROMPT_VERSION,
  RELATIONAL_PROMPT_VERSION,
} from '@persona16/engine';
import type { TurnExecution } from '@persona16/turn-application';
import {
  turnRecoveryDetails,
  turnRequestSchema,
  type TurnEvent,
} from '@persona16/turn-protocol';
import { jsonError, withSessionCookie } from './http';

export { turnRecoveryDetails, turnRequestSchema } from '@persona16/turn-protocol';

/** 只有三批评测通过后才显式切 relational；未配置和未知值都安全回退旧版。 */
export function turnPromptVersionForVariant(value: string | undefined): string {
  return value === 'relational' ? RELATIONAL_PROMPT_VERSION : LEGACY_PROMPT_VERSION;
}

export const TURN_PROMPT_VERSION = turnPromptVersionForVariant(
  process.env.PERSONA16_PROMPT_VARIANT,
);
export const TURN_BUILD_VERSION = (
  process.env.PERSONA16_BUILD_VERSION
  ?? process.env.VERCEL_GIT_COMMIT_SHA
  ?? 'development'
).slice(0, 80);

function ndjsonHeaders(setCookie?: string): Headers {
  return withSessionCookie(new Headers({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Content-Type-Options': 'nosniff',
  }), setCookie);
}

function eventStream(events: AsyncIterable<TurnEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(`${JSON.stringify(next.value)}\n`));
      } catch (error) {
        await iterator.return?.();
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

export function turnExecutionResponse(
  execution: TurnExecution,
  setCookie?: string,
): Response {
  if (execution.kind === 'rejected') {
    const headers = new Headers();
    if (execution.error.retryAfterSeconds !== undefined) {
      headers.set('Retry-After', String(execution.error.retryAfterSeconds));
    }
    if (setCookie) headers.set('Set-Cookie', setCookie);
    return jsonError(
      execution.error.code,
      execution.error.message,
      execution.error.status,
      headers,
      execution.error.details,
    );
  }
  const headers = ndjsonHeaders(setCookie);
  if (execution.replay) headers.set('X-Persona16-Replay', '1');
  return new Response(eventStream(execution.events), { headers });
}
