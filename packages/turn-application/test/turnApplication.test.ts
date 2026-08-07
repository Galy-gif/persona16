import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom, defaultConfig } from '@persona16/engine';
import { InMemoryPersonaStore } from '@persona16/store';
import type { TurnEvent } from '@persona16/turn-protocol';
import { createTurnApplication } from '../src/index';

async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const result: TurnEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

test('Turn Application owns success persistence and exact idempotent replay through one interface', async () => {
  const store = new InMemoryPersonaStore();
  const userId = 'user-turn-application';
  const room = await store.createRoom({ userId, state: createRoom(['INTJ']) });
  const request = {
    roomId: room.id,
    roomVersion: room.version,
    turnId: crypto.randomUUID(),
    command: { type: 'message' as const, text: '我准备好药了，今晚不想活了' },
  };
  const application = createTurnApplication({
    store,
    config: defaultConfig(),
    promptVersion: 'turn-application-test-v1',
    buildVersion: 'test-build',
    getRuntime: async () => undefined,
  });

  const first = await application.execute({
    request,
    userId,
    signal: new AbortController().signal,
  });
  assert.equal(first.kind, 'stream');
  if (first.kind !== 'stream') return;
  assert.equal(first.replay, false);
  const firstEvents = await collect(first.events);
  assert.deepEqual(firstEvents.map((event) => event.type), [
    'turn_start', 'safety_notice', 'turn_end', 'done',
  ]);

  const replay = await application.execute({
    request,
    userId,
    signal: new AbortController().signal,
  });
  assert.equal(replay.kind, 'stream');
  if (replay.kind !== 'stream') return;
  assert.equal(replay.replay, true);
  assert.deepEqual(await collect(replay.events), firstEvents);
});
