import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, canSubmitTurn, streamTurn } from '../lib/client';

const request = {
  roomId: '00000000-0000-4000-8000-000000000001',
  turnId: '00000000-0000-4000-8000-000000000002',
  roomVersion: 1,
  text: '测试',
};

test('turn stream maps premature EOF without a terminal event to DELIVERY_FAILED', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(
    `${JSON.stringify({ v: 1, turnId: request.turnId, type: 'turn_start' })}\n`,
    { status: 200 },
  ));

  await assert.rejects(
    () => streamTurn(request, () => undefined),
    (error: unknown) => error instanceof ApiError
      && error.code === 'DELIVERY_FAILED'
      && error.recoveryAction === 'refresh'
      && error.outcome === 'unknown',
  );
});

test('HTTP failures expose truthful recovery actions and Retry-After', async (context) => {
  const cases: Array<{
    status: number;
    code: string;
    action: 'retry' | 'refresh' | 'stop';
    recoverable: boolean;
    outcome?: 'known_failed' | 'unknown';
    retryAfter?: string;
  }> = [
    { status: 400, code: 'INVALID_REQUEST', action: 'stop', recoverable: false },
    { status: 409, code: 'ROOM_VERSION_CONFLICT', action: 'refresh', recoverable: true },
    { status: 409, code: 'TURN_IN_PROGRESS', action: 'refresh', recoverable: true, outcome: 'unknown' },
    { status: 429, code: 'RATE_LIMITED', action: 'retry', recoverable: true, retryAfter: '3' },
  ];

  for (const item of cases) {
    context.mock.method(globalThis, 'fetch', async () => Response.json(
      { error: { code: item.code, message: 'test failure' } },
      { status: item.status, headers: item.retryAfter ? { 'Retry-After': item.retryAfter } : undefined },
    ));
    const events: Array<{ type: string; recoveryAction?: string; recoverable?: boolean; retryAfterMs?: number }> = [];
    await streamTurn(request, (event) => events.push(event));
    assert.deepEqual(events[0], {
      v: 1,
      turnId: request.turnId,
      type: 'error',
      code: item.code,
      message: 'test failure',
      recoverable: item.recoverable,
      recoveryAction: item.action,
      outcome: item.outcome ?? 'known_failed',
      ...(item.retryAfter ? { retryAfterMs: 3_000 } : {}),
    });
    context.mock.restoreAll();
  }
});

test('turn stream does not misclassify a delivery consumer exception as invalid JSON', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(
    `${JSON.stringify({ v: 1, turnId: request.turnId, type: 'turn_start' })}\n`,
    { status: 200 },
  ));

  await assert.rejects(
    () => streamTurn(request, () => { throw new Error('render failed'); }),
    (error: unknown) => error instanceof ApiError && error.code === 'DELIVERY_FAILED',
  );
});

test('successful HTTP response without a stream is an unknown delivery outcome', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 200 }));

  await assert.rejects(
    () => streamTurn(request, () => undefined),
    (error: unknown) => error instanceof ApiError
      && error.code === 'DELIVERY_FAILED'
      && error.recoveryAction === 'refresh'
      && error.outcome === 'unknown',
  );
});

test('an unknown turn outcome blocks every new turn until the original id is checked', () => {
  const pending = { turnId: request.turnId, outcome: 'unknown' as const };

  assert.equal(canSubmitTurn(pending), false);
  assert.equal(canSubmitTurn(pending, { turnId: 'another-turn' }), false);
  assert.equal(canSubmitTurn(pending, { turnId: request.turnId }), true);
  assert.equal(canSubmitTurn({ ...pending, outcome: 'known_failed' }), true);
});

test('client honors the Harness recovery decision instead of inferring from HTTP status', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    error: {
      code: 'CUSTOM_TERMINAL_FAILURE',
      message: 'do not retry',
      recoverable: false,
      recoveryAction: 'stop',
      outcome: 'known_failed',
    },
  }, { status: 503 }));
  const events: Array<{ type: string; recoveryAction?: string; recoverable?: boolean }> = [];

  await streamTurn(request, (event) => events.push(event));

  assert.equal(events[0]?.recoveryAction, 'stop');
  assert.equal(events[0]?.recoverable, false);
});
