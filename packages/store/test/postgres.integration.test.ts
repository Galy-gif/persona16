import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom } from '@persona16/engine';
import { PostgresPersonaStore, type PersistedTurnEvent } from '../src/index';
import { migrateDatabase } from '../src/migration';

const connectionString = process.env.PERSONA16_TEST_DATABASE_URL;

test('PostgreSQL migration supports cross-connection turn locking and replay', {
  skip: connectionString ? false : 'PERSONA16_TEST_DATABASE_URL is not set',
}, async () => {
  await migrateDatabase(connectionString!);
  const firstStore = new PostgresPersonaStore(connectionString!);
  const secondStore = new PostgresPersonaStore(connectionString!);
  try {
    const userId = crypto.randomUUID();
    const room = await firstStore.createRoom({ userId, state: createRoom(['INTJ', 'ENFP']) });
    const turnA = crypto.randomUUID();
    const turnB = crypto.randomUUID();
    const [first, second] = await Promise.all([
      firstStore.reserveTurn({ userId, roomId: room.id, turnId: turnA, roomVersion: 1, requestHash: 'hash-a', promptVersion: 'test-v1', buildVersion: 'build-42', provider: 'fake', model: 'fake:test' }),
      secondStore.reserveTurn({ userId, roomId: room.id, turnId: turnB, roomVersion: 1, requestHash: 'hash-b', promptVersion: 'test-v1', buildVersion: 'build-42', provider: 'fake', model: 'fake:test' }),
    ]);
    const accepted = first.kind === 'accepted' ? { result: first, turnId: turnA, hash: 'hash-a' } : { result: second, turnId: turnB, hash: 'hash-b' };
    const rejected = first.kind === 'conflict' ? first : second;
    assert.equal(accepted.result.kind, 'accepted');
    assert.equal(rejected.kind, 'conflict');
    if (rejected.kind === 'conflict') assert.equal(rejected.code, 'TURN_IN_PROGRESS');

    const state = structuredClone(room.state);
    const userMessageId = crypto.randomUUID();
    const agentMessageId = crypto.randomUUID();
    state.history.push({ id: userMessageId, speaker: 'user', text: '数据库并发测试' });
    state.history.push({ id: agentMessageId, speaker: 'INTJ', text: '只生成一次。', speechType: '短句' });
    const event: PersistedTurnEvent = { v: 1, turnId: accepted.turnId, type: 'turn_end', stopReason: 'complete', roomVersion: 2 };
    await firstStore.completeTurn({
      userId, roomId: room.id, turnId: accepted.turnId, state, stopReason: 'complete', events: [event],
      observability: {
        usage: { status: 'actual_provider_usage', calls: 3, inputTokens: 120, outputTokens: 40 },
        latency: { totalMs: 850, firstTokenMs: 220 },
        trace: { v: 1, safety: { level: 'normal' }, roomActions: [{ type: 'speak', agent: 'INTJ' }] },
      },
    });
    const observed = await firstStore.pool.query<{
      build_version: string; provider: string; usage_json: { calls: number }; latency_json: { firstTokenMs: number }; trace_json: { v: number };
    }>(`SELECT build_version, provider, usage_json, latency_json, trace_json FROM turn_runs WHERE id = $1`, [accepted.turnId]);
    assert.equal(observed.rows[0]?.build_version, 'build-42');
    assert.equal(observed.rows[0]?.provider, 'fake');
    assert.equal(observed.rows[0]?.usage_json.calls, 3);
    assert.equal(observed.rows[0]?.latency_json.firstTokenMs, 220);
    assert.equal(observed.rows[0]?.trace_json.v, 1);
    const lookup = await secondStore.lookupTurn({
      userId, roomId: room.id, turnId: accepted.turnId, requestHash: accepted.hash,
    });
    assert.equal(lookup.kind, 'replay');
    if (lookup.kind === 'replay') assert.deepEqual(lookup.events, [event]);
    const replay = await secondStore.reserveTurn({
      userId, roomId: room.id, turnId: accepted.turnId, roomVersion: 1, requestHash: accepted.hash,
      promptVersion: 'test-v1', model: 'fake:test',
    });
    assert.equal(replay.kind, 'replay');
    if (replay.kind === 'replay') assert.deepEqual(replay.events, [event]);

    const feedback = await secondStore.upsertFeedback({
      userId, roomId: room.id, messageId: agentMessageId, rating: 'negative', tags: ['too_short'],
    });
    assert.equal(feedback.turnId, accepted.turnId);
    assert.deepEqual((await firstStore.listFeedback(userId, room.id))[0]?.tags, ['too_short']);

    const [candidate] = await firstStore.createMemoryCandidates({
      userId,
      sourceTurnId: accepted.turnId,
      candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
    });
    assert.ok(candidate);
    await firstStore.failTurn(userId, room.id, accepted.turnId);
    await secondStore.updateMemoryStatus(userId, candidate.id, 'confirmed');
    assert.equal((await firstStore.listConfirmedMemories(userId, ['INTJ']))[0]?.content, '先给结论');
    const relationshipEvent = (await firstStore.listRelationshipEvents(userId, 'INTJ'))[0]!;
    const relationshipBranch = (await secondStore.listRelationshipBranches(userId, ['INTJ']))[0]!;
    assert.equal(relationshipEvent.sourceMemoryId, candidate.id);
    assert.equal(relationshipEvent.event.type, 'preference_stated');
    assert.equal(relationshipBranch.characterId, 'legacy-intj');
    assert.equal(relationshipBranch.branch.interactionStyle[0]?.content, '先给结论');
    const initialBranchVersion = relationshipBranch.version;
    await firstStore.updateMemoryStatus(userId, candidate.id, 'confirmed');
    assert.equal((await secondStore.listRelationshipEvents(userId, 'INTJ')).length, 1);
    assert.equal(
      (await secondStore.listRelationshipBranches(userId, ['INTJ']))[0]?.version,
      initialBranchVersion,
    );
    await assert.rejects(
      () => firstStore.appendRelationshipEvent({
        userId,
        agent: 'INTJ',
        event: {
          id: 'memory:reserved',
          type: 'preference_stated',
          sourceTurnId: accepted.turnId,
          content: '不能占用投影前缀',
        },
      }),
      (error: unknown) => (error as { code?: string }).code === 'RELATIONSHIP_EVENT_CONFLICT',
    );
    await firstStore.updateMemoryStatus(userId, candidate.id, 'deleted');
    assert.equal((await secondStore.listRelationshipEvents(userId, 'INTJ')).length, 0);
    assert.equal(
      (await secondStore.listRelationshipBranches(userId, ['INTJ']))[0]?.branch.eventLog.length,
      0,
    );
    const rupture = {
      id: `rupture:${crypto.randomUUID()}`,
      type: 'meaningful_disagreement' as const,
      sourceTurnId: accepted.turnId,
      content: '人物越过了用户刚刚表达的边界',
    };
    await firstStore.appendRelationshipEvent({ userId, agent: 'INTJ', event: rupture });
    const tenseBranch = (await secondStore.listRelationshipBranches(userId, ['INTJ']))[0]!;
    assert.equal(tenseBranch.branch.recentClimate, 'tense');
    await secondStore.appendRelationshipEvent({ userId, agent: 'INTJ', event: rupture });
    assert.equal((await firstStore.listRelationshipEvents(userId, 'INTJ')).length, 1);
    assert.equal(
      (await firstStore.listRelationshipBranches(userId, ['INTJ']))[0]?.version,
      tenseBranch.version,
    );
    const forgotten = await firstStore.forgetRelationshipEvidence(
      userId,
      'INTJ',
      `tension:${rupture.id}`,
    );
    assert.equal(forgotten.branch.eventLog.length, 0);
    assert.equal((await secondStore.listRelationshipEvents(userId, 'INTJ')).length, 0);

    const [boundaryMemory] = await firstStore.createMemoryCandidates({
      userId,
      sourceTurnId: accepted.turnId,
      candidates: [{ agent: 'INTJ', kind: 'boundary', content: '不要替我安排下一步' }],
    });
    await firstStore.updateMemoryStatus(userId, boundaryMemory!.id, 'confirmed');
    await firstStore.appendRelationshipEvent({
      userId,
      agent: 'INTJ',
      event: {
        id: `boundary-revision:${crypto.randomUUID()}`,
        type: 'boundary_revised',
        sourceTurnId: accepted.turnId,
        content: '可以给选项，但不要替我决定',
        boundaryId: `boundary:memory:${boundaryMemory!.id}`,
      },
    });
    await firstStore.updateMemoryStatus(userId, boundaryMemory!.id, 'deleted');
    assert.equal((await secondStore.listRelationshipEvents(userId, 'INTJ')).length, 0);
    assert.equal(
      (await secondStore.listRelationshipBranches(userId, ['INTJ']))[0]?.branch.eventLog.length,
      0,
    );

    const [roomCandidate] = await firstStore.createMemoryCandidates({
      userId,
      sourceTurnId: accepted.turnId,
      candidates: [{ agent: 'INTJ', kind: 'boundary', content: '这个房间不要催我' }],
    });
    const otherRoom = await firstStore.createRoom({ userId, state: createRoom(['INTJ']) });
    const otherTurnId = crypto.randomUUID();
    await firstStore.reserveTurn({
      userId, roomId: otherRoom.id, turnId: otherTurnId, roomVersion: 1, requestHash: 'other-memory',
      promptVersion: 'test-v1', model: 'fake:test',
    });
    await firstStore.completeTurn({
      userId, roomId: otherRoom.id, turnId: otherTurnId, state: otherRoom.state,
      stopReason: 'complete', events: [],
    });
    await firstStore.createMemoryCandidates({
      userId,
      sourceTurnId: otherTurnId,
      candidates: [{ agent: 'INTJ', kind: 'preference', content: '另一个房间先给例子' }],
    });
    const foreignUserId = crypto.randomUUID();
    const foreignRoom = await firstStore.createRoom({ userId: foreignUserId, state: createRoom(['INTJ']) });
    const foreignTurnId = crypto.randomUUID();
    await firstStore.reserveTurn({
      userId: foreignUserId, roomId: foreignRoom.id, turnId: foreignTurnId, roomVersion: 1,
      requestHash: 'foreign-memory', promptVersion: 'test-v1', model: 'fake:test',
    });
    await firstStore.completeTurn({
      userId: foreignUserId, roomId: foreignRoom.id, turnId: foreignTurnId,
      state: foreignRoom.state, stopReason: 'complete', events: [],
    });
    const scopedEventId = `scoped-event:${crypto.randomUUID()}`;
    await firstStore.appendRelationshipEvent({
      userId,
      agent: 'INTJ',
      event: {
        id: scopedEventId,
        type: 'context_shared',
        sourceTurnId: accepted.turnId,
        content: '主用户上下文',
      },
    });
    await firstStore.appendRelationshipEvent({
      userId: foreignUserId,
      agent: 'INTJ',
      event: {
        id: scopedEventId,
        type: 'context_shared',
        sourceTurnId: foreignTurnId,
        content: '另一用户上下文',
      },
    });
    assert.equal((await firstStore.listRelationshipEvents(userId, 'INTJ')).at(-1)?.event.content, '主用户上下文');
    assert.equal((await firstStore.listRelationshipEvents(foreignUserId, 'INTJ')).at(-1)?.event.content, '另一用户上下文');
    await assert.rejects(
      () => firstStore.createMemoryCandidates({
        userId,
        sourceTurnId: foreignTurnId,
        candidates: [{ agent: 'INTJ', kind: 'preference', content: '伪造的跨用户来源' }],
      }),
      (error: unknown) => (error as { code?: string }).code === 'MEMORY_STATUS_CONFLICT',
    );
    assert.deepEqual(
      (await secondStore.listMemories(userId, 'candidate', room.id)).map((memory) => memory.id),
      [roomCandidate?.id],
    );

    assert.equal((await firstStore.consumeRateLimit(`user:${userId}`, 1, 60_000)).allowed, true);
    assert.equal((await secondStore.consumeRateLimit(`user:${userId}`, 1, 60_000)).allowed, false);

    const leaseRoom = await firstStore.createRoom({ userId, state: createRoom(['INTJ']) });
    const staleTurnId = crypto.randomUUID();
    await firstStore.reserveTurn({
      userId, roomId: leaseRoom.id, turnId: staleTurnId, roomVersion: 1, requestHash: 'stale',
      promptVersion: 'test-v1', model: 'fake:test',
    });
    await firstStore.pool.query(
      `UPDATE turn_runs SET updated_at = now() - interval '4 minutes' WHERE id = $1`,
      [staleTurnId],
    );
    assert.deepEqual(await secondStore.lookupTurn({
      userId, roomId: leaseRoom.id, turnId: staleTurnId, requestHash: 'stale',
    }), { kind: 'conflict', code: 'TURN_FAILED' });
    const afterLease = await secondStore.reserveTurn({
      userId, roomId: leaseRoom.id, turnId: crypto.randomUUID(), roomVersion: 1, requestHash: 'after-lease',
      promptVersion: 'test-v1', model: 'fake:test',
    });
    assert.equal(afterLease.kind, 'accepted');
  } finally {
    await Promise.all([firstStore.close(), secondStore.close()]);
  }
});
