import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom } from '@persona16/engine';
import { InMemoryPersonaStore, StoreError } from '../src/index';

async function completedTurn(store: InMemoryPersonaStore, userId: string, turnId: string): Promise<string> {
  const room = await store.createRoom({ userId, state: createRoom(['INTJ']) });
  await store.reserveTurn({
    userId, roomId: room.id, turnId, roomVersion: 1, requestHash: `hash:${turnId}`,
    promptVersion: 'test-v1', model: 'fake:test',
  });
  await store.completeTurn({
    userId, roomId: room.id, turnId, state: room.state, stopReason: 'complete',
    events: [{ v: 1, turnId, type: 'turn_end', stopReason: 'complete', roomVersion: 2 }],
  });
  return room.id;
}

test('rooms are private to their anonymous owner', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });

  await assert.rejects(() => store.getRoom(room.id, 'user-b'), (error: unknown) => {
    assert.equal((error as StoreError).code, 'ROOM_NOT_FOUND');
    return true;
  });
});

test('room version and active turn allow only one concurrent generation', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ', 'ENFP']) });

  const [first, second] = await Promise.all([
    store.reserveTurn({ userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'hash-a', promptVersion: 'test-v1', model: 'fake:test' }),
    store.reserveTurn({ userId: 'user-a', roomId: room.id, turnId: 'turn-b', roomVersion: 1, requestHash: 'hash-b', promptVersion: 'test-v1', model: 'fake:test' }),
  ]);

  assert.equal(first.kind, 'accepted');
  assert.equal(second.kind, 'conflict');
  if (second.kind === 'conflict') assert.equal(second.code, 'TURN_IN_PROGRESS');
});

test('completed turn is replayed for the same idempotency key and payload', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });
  const reservation = await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'same', promptVersion: 'test-v1', model: 'fake:test',
  });
  assert.equal(reservation.kind, 'accepted');
  await store.completeTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', state: createRoom(['INTJ']),
    stopReason: 'complete', events: [{ v: 1, turnId: 'turn-a', type: 'turn_end', stopReason: 'complete', roomVersion: 2 }],
  });

  const lookup = await store.lookupTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', requestHash: 'same',
  });
  assert.equal(lookup.kind, 'replay');
  if (lookup.kind === 'replay') assert.equal(lookup.roomVersion, 2);

  const replay = await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'same', promptVersion: 'test-v1', model: 'fake:test',
  });
  assert.equal(replay.kind, 'replay');
  if (replay.kind === 'replay') assert.equal(replay.roomVersion, 2);
});

test('turn lookup is read-only and detects missing and mismatched requests', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });
  assert.deepEqual(await store.lookupTurn({
    userId: 'user-a', roomId: room.id, turnId: 'missing', requestHash: 'same',
  }), { kind: 'missing' });

  await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'same',
    promptVersion: 'test-v1', model: 'fake:test',
  });
  assert.deepEqual(await store.lookupTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', requestHash: 'different',
  }), { kind: 'conflict', code: 'IDEMPOTENCY_MISMATCH' });
});

test('reusing a turn id with a different payload is rejected', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });
  await store.reserveTurn({ userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'one', promptVersion: 'test-v1', model: 'fake:test' });
  const duplicate = await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'two', promptVersion: 'test-v1', model: 'fake:test',
  });
  assert.deepEqual(duplicate, { kind: 'conflict', code: 'IDEMPOTENCY_MISMATCH' });
});

test('memory confirmation lifecycle excludes rejected and deleted records', async () => {
  const store = new InMemoryPersonaStore();
  await completedTurn(store, 'user-a', 'turn-a');
  const [candidate] = await store.createMemoryCandidates({
    userId: 'user-a', sourceTurnId: 'turn-a',
    candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
  });
  assert.ok(candidate);
  assert.deepEqual(await store.listConfirmedMemories('user-a', ['INTJ']), []);

  await store.updateMemoryStatus('user-a', candidate.id, 'confirmed');
  assert.equal((await store.listConfirmedMemories('user-a', ['INTJ'])).length, 1);
  await store.updateMemoryStatus('user-a', candidate.id, 'deleted');
  assert.deepEqual(await store.listConfirmedMemories('user-a', ['INTJ']), []);
});

test('memory candidates cannot borrow another user\'s source turn', async () => {
  const store = new InMemoryPersonaStore();
  await completedTurn(store, 'user-b', 'turn-b');

  await assert.rejects(
    () => store.createMemoryCandidates({
      userId: 'user-a',
      sourceTurnId: 'turn-b',
      candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
    }),
    (error: unknown) => (error as StoreError).code === 'MEMORY_STATUS_CONFLICT',
  );
});

test('confirmed memories project idempotently into relationship events and rebuild branch state', async () => {
  const store = new InMemoryPersonaStore();
  await completedTurn(store, 'user-a', 'turn-relationship');
  const [preference, boundary, pattern] = await store.createMemoryCandidates({
    userId: 'user-a',
    sourceTurnId: 'turn-relationship',
    candidates: [
      { agent: 'INTJ', kind: 'preference', content: '先给结论' },
      { agent: 'INTJ', kind: 'boundary', content: '不要连续追问' },
      { agent: 'INTJ', kind: 'repeated_pattern', content: '遇到压力时会先消失' },
    ],
  });

  await store.updateMemoryStatus('user-a', preference!.id, 'confirmed');
  const firstBranch = (await store.listRelationshipBranches('user-a', ['INTJ']))[0]!;
  assert.equal(firstBranch.characterId, 'lin-heng');
  assert.equal(firstBranch.branch.interactionStyle[0]?.content, '先给结论');
  assert.equal(firstBranch.branch.interactionStyle[0]?.sourceTurnId, 'turn-relationship');
  assert.equal(firstBranch.branch.eventLog[0]?.id, `memory:${preference!.id}`);

  await store.updateMemoryStatus('user-a', preference!.id, 'confirmed');
  assert.equal((await store.listRelationshipEvents('user-a', 'INTJ')).length, 1);
  assert.equal((await store.listRelationshipBranches('user-a', ['INTJ']))[0]!.version, firstBranch.version);

  await store.updateMemoryStatus('user-a', boundary!.id, 'confirmed');
  await store.updateMemoryStatus('user-a', pattern!.id, 'confirmed');
  const populated = (await store.listRelationshipBranches('user-a', ['INTJ']))[0]!;
  assert.equal(populated.branch.boundaries[0]?.content, '不要连续追问');
  assert.equal(populated.branch.sharedContext[0]?.content, '遇到压力时会先消失');
  assert.equal(populated.branch.recentClimate, 'unfamiliar');
  assert.equal(populated.branch.eventLog.length, 3);

  await store.updateMemoryStatus('user-a', preference!.id, 'deleted');
  const remainingEvents = await store.listRelationshipEvents('user-a', 'INTJ');
  const rebuilt = (await store.listRelationshipBranches('user-a', ['INTJ']))[0]!;
  assert.equal(remainingEvents.some((record) => record.sourceMemoryId === preference!.id), false);
  assert.equal(rebuilt.branch.interactionStyle.length, 0);
  assert.equal(rebuilt.branch.boundaries.length, 1);
  assert.equal(rebuilt.branch.eventLog.length, 2);
});

test('relationship events from completed turns advance the persisted branch idempotently', async () => {
  const store = new InMemoryPersonaStore();
  await completedTurn(store, 'user-a', 'turn-conflict');
  const rupture = {
    id: 'rupture-1',
    type: 'meaningful_disagreement' as const,
    sourceTurnId: 'turn-conflict',
    content: '人物越过边界，继续替用户安排下一步',
  };

  await assert.rejects(
    () => store.appendRelationshipEvent({
      userId: 'user-a',
      agent: 'INTJ',
      event: { ...rupture, id: 'memory:reserved' },
    }),
    (error: unknown) => (error as StoreError).code === 'RELATIONSHIP_EVENT_CONFLICT',
  );

  await store.appendRelationshipEvent({ userId: 'user-a', agent: 'INTJ', event: rupture });
  const tense = (await store.listRelationshipBranches('user-a', ['INTJ']))[0]!;
  assert.equal(tense.branch.recentClimate, 'tense');
  assert.equal(tense.branch.tensions[0]?.id, 'tension:rupture-1');

  await store.appendRelationshipEvent({ userId: 'user-a', agent: 'INTJ', event: rupture });
  assert.equal((await store.listRelationshipEvents('user-a', 'INTJ')).length, 1);
  assert.equal((await store.listRelationshipBranches('user-a', ['INTJ']))[0]?.version, tense.version);

  await store.appendRelationshipEvent({
    userId: 'user-a',
    agent: 'INTJ',
    event: {
      id: 'repair-1',
      type: 'repair_attempted',
      sourceTurnId: 'turn-conflict',
      content: '人物承认越界并停止继续安排',
      tensionId: 'tension:rupture-1',
    },
  });
  assert.equal(
    (await store.listRelationshipBranches('user-a', ['INTJ']))[0]?.branch.recentClimate,
    'repairing',
  );

  await assert.rejects(
    () => store.appendRelationshipEvent({
      userId: 'user-a',
      agent: 'INTJ',
      event: { ...rupture, content: '同一 id 的另一件事' },
    }),
    (error: unknown) => (error as StoreError).code === 'RELATIONSHIP_EVENT_CONFLICT',
  );

  const forgotten = await store.forgetRelationshipEvidence('user-a', 'INTJ', 'tension:rupture-1');
  assert.equal(forgotten.branch.eventLog.length, 0);
  assert.equal(forgotten.branch.recentClimate, 'unfamiliar');
  assert.equal((await store.listRelationshipEvents('user-a', 'INTJ')).length, 0);
});

test('rejected memory cannot later be silently confirmed', async () => {
  const store = new InMemoryPersonaStore();
  await completedTurn(store, 'user-a', 'turn-a');
  const [candidate] = await store.createMemoryCandidates({
    userId: 'user-a', sourceTurnId: 'turn-a',
    candidates: [{ agent: 'INTJ', kind: 'boundary', content: '不要催我' }],
  });
  await store.updateMemoryStatus('user-a', candidate!.id, 'rejected');
  await assert.rejects(
    () => store.updateMemoryStatus('user-a', candidate!.id, 'confirmed'),
    (error: unknown) => (error as StoreError).code === 'MEMORY_STATUS_CONFLICT',
  );
});

test('candidates from an unfinished or failed turn are never visible', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });
  await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-a', roomVersion: 1, requestHash: 'one',
    promptVersion: 'test-v1', model: 'fake:test',
  });
  await store.createMemoryCandidates({
    userId: 'user-a', sourceTurnId: 'turn-a',
    candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
  });
  assert.deepEqual(await store.listMemories('user-a', 'candidate'), []);
  await store.failTurn('user-a', room.id, 'turn-a');
  assert.deepEqual(await store.listMemories('user-a'), []);
});

test('late fail cleanup cannot delete a candidate from an already completed turn', async () => {
  const store = new InMemoryPersonaStore();
  const roomId = await completedTurn(store, 'user-a', 'turn-a');
  const [candidate] = await store.createMemoryCandidates({
    userId: 'user-a', sourceTurnId: 'turn-a',
    candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
  });
  await store.failTurn('user-a', roomId, 'turn-a');
  assert.equal((await store.listMemories('user-a', 'candidate'))[0]?.id, candidate!.id);
});

test('pending memory work can be restored for one room without leaking candidates from another room', async () => {
  const store = new InMemoryPersonaStore();
  const firstRoomId = await completedTurn(store, 'user-a', 'turn-a');
  const secondRoomId = await completedTurn(store, 'user-a', 'turn-b');
  const [firstCandidate] = await store.createMemoryCandidates({
    userId: 'user-a', sourceTurnId: 'turn-a',
    candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
  });
  await store.createMemoryCandidates({
    userId: 'user-a', sourceTurnId: 'turn-b',
    candidates: [{ agent: 'INTJ', kind: 'boundary', content: '不要催我' }],
  });

  const restored = await store.listMemories('user-a', 'candidate', firstRoomId);

  assert.equal(restored.length, 1);
  assert.equal(restored[0]?.id, firstCandidate?.id);
  assert.notEqual(firstRoomId, secondRoomId);
});

test('store-backed rate limit applies a shared fixed-window budget', async () => {
  const store = new InMemoryPersonaStore();
  assert.equal((await store.consumeRateLimit('user:a', 2, 60_000)).allowed, true);
  assert.equal((await store.consumeRateLimit('user:a', 2, 60_000)).allowed, true);
  const rejected = await store.consumeRateLimit('user:a', 2, 60_000);
  assert.equal(rejected.allowed, false);
  assert.ok(rejected.retryAfterSeconds > 0);
});

test('stale active turn lease is reclaimed before accepting a new turn', async () => {
  let now = 0;
  const store = new InMemoryPersonaStore({ now: () => now, turnLeaseMs: 100 });
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });
  await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'stale', roomVersion: 1, requestHash: 'stale',
    promptVersion: 'test-v1', model: 'fake:test',
  });
  now = 101;
  assert.deepEqual(await store.lookupTurn({
    userId: 'user-a', roomId: room.id, turnId: 'stale', requestHash: 'stale',
  }), { kind: 'conflict', code: 'TURN_FAILED' });
  const next = await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'next', roomVersion: 1, requestHash: 'next',
    promptVersion: 'test-v1', model: 'fake:test',
  });
  assert.equal(next.kind, 'accepted');
});

test('feedback belongs to an owned persona message and can be updated', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({ userId: 'user-a', state: createRoom(['INTJ']) });
  await store.reserveTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-feedback', roomVersion: 1, requestHash: 'feedback',
    promptVersion: 'test-v1', model: 'fake:test',
  });
  const state = structuredClone(room.state);
  state.history.push({ id: 'message-user', speaker: 'user', text: '给我一个判断' });
  state.history.push({ id: 'message-agent', speaker: 'INTJ', text: '先看不可逆代价。', speechType: '短句' });
  await store.completeTurn({
    userId: 'user-a', roomId: room.id, turnId: 'turn-feedback', state, stopReason: 'complete',
    events: [{ v: 1, turnId: 'turn-feedback', type: 'speaker_end', messageId: 'message-agent', agent: 'INTJ', speechType: '短句', text: '先看不可逆代价。' }],
  });

  const positive = await store.upsertFeedback({
    userId: 'user-a', roomId: room.id, messageId: 'message-agent', rating: 'positive', tags: [],
  });
  assert.equal(positive.rating, 'positive');
  const negative = await store.upsertFeedback({
    userId: 'user-a', roomId: room.id, messageId: 'message-agent', rating: 'negative', tags: ['too_short'],
  });
  assert.equal(negative.id, positive.id);
  assert.deepEqual((await store.listFeedback('user-a', room.id))[0]?.tags, ['too_short']);
  await assert.rejects(
    () => store.upsertFeedback({ userId: 'user-b', roomId: room.id, messageId: 'message-agent', rating: 'positive', tags: [] }),
    (error: unknown) => (error as StoreError).code === 'ROOM_NOT_FOUND',
  );
});
