import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, streamTurn } from '../lib/client';

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
    (error: unknown) => error instanceof ApiError && error.code === 'DELIVERY_FAILED',
  );
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
