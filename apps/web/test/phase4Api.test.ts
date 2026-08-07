import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRelationshipEvent,
  createRelationshipBranch,
  createRoom as createRoomState,
} from '@persona16/engine';
import { InMemoryPersonaStore } from '@persona16/store';
import type { TurnObservability } from '@persona16/store';
import { POST as createRoom } from '../app/api/rooms/route';
import { GET as getRoom, PATCH as updateRoom } from '../app/api/rooms/[roomId]/route';
import { POST as runTurn } from '../app/api/turn/route';
import { POST as submitFeedback } from '../app/api/feedback/route';
import { PATCH as updateMemory } from '../app/api/memories/[memoryId]/route';
import { GET as listMemories } from '../app/api/memories/route';
import { applyRelationshipBranchContexts } from '../lib/server/turnPreflight';

function resetStore(): InMemoryPersonaStore {
  const store = new InMemoryPersonaStore();
  globalThis.__persona16Store = store;
  return store;
}

async function createOwnedRoom(): Promise<{ id: string; version: number; cookie: string; store: InMemoryPersonaStore }> {
  const store = resetStore();
  const response = await createRoom(new Request('http://localhost/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agents: ['INTJ', 'ENFP'] }),
  }));
  assert.equal(response.status, 201);
  const room = await response.json() as { id: string; version: number };
  const cookie = response.headers.get('set-cookie')!;
  assert.ok(cookie);
  return { ...room, cookie, store };
}

function turnRequest(
  room: { id: string; version: number; cookie: string },
  turnId: string,
  extra: Record<string, unknown> = {},
): Request {
  return new Request('http://localhost/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: room.cookie },
    body: JSON.stringify({
      roomId: room.id,
      turnId,
      roomVersion: room.version,
      command: { type: 'message', text: '我准备好药了，今晚不想活了' },
      ...extra,
    }),
  });
}

function parseEvents(text: string): Record<string, unknown>[] {
  return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

test('turn API ignores client-supplied history and crisis bypasses room actions', async () => {
  const room = await createOwnedRoom();
  const turnId = crypto.randomUUID();
  const response = await runTurn(turnRequest(room, turnId, {
    room: { history: [{ speaker: 'user', text: '篡改的历史' }], relationship: { intimacy: 5 } },
  }));
  assert.equal(response.status, 200);
  const events = parseEvents(await response.text());
  assert.equal(events.some((event) => event.type === 'room_action'), false);
  assert.equal(events.at(-2)?.type, 'turn_end');
  assert.equal(events.at(-1)?.type, 'done');

  const fetched = await getRoom(
    new Request(`http://localhost/api/rooms/${room.id}`, { headers: { Cookie: room.cookie } }),
    { params: Promise.resolve({ roomId: room.id }) },
  );
  const body = await fetched.json() as { state: { history: { text: string }[] }; version: number };
  assert.equal(body.version, 2);
  assert.equal(body.state.history.some((message) => message.text === '篡改的历史'), false);
  assert.equal(body.state.history[0]?.text, '我准备好药了，今晚不想活了');
});

test('completed turns persist V2 stage latency without exposing text in timing labels', async () => {
  const room = await createOwnedRoom();
  let observed: TurnObservability | undefined;
  const completeTurn = room.store.completeTurn.bind(room.store);
  room.store.completeTurn = async (input) => {
    observed = structuredClone(input.observability);
    return completeTurn(input);
  };

  const response = await runTurn(turnRequest(room, crypto.randomUUID()));
  await response.text();

  const latency = observed?.latency as {
    schemaVersion?: number;
    totalMs?: number;
    validatedOutputMs?: number | null;
    firstTokenMs?: number | null;
    stagesMs?: Record<string, number>;
    counts?: Record<string, number>;
  };
  assert.equal(latency.schemaVersion, 2);
  assert.ok((latency.totalMs ?? -1) >= 0);
  assert.equal(latency.validatedOutputMs, null);
  assert.equal(latency.firstTokenMs, latency.validatedOutputMs);
  assert.deepEqual(Object.keys(latency.stagesMs ?? {}).sort(), [
    'idempotency_lookup',
    'rate_limit',
    'safety',
    'turn_reservation',
  ]);
  assert.deepEqual(latency.counts, {});
  assert.doesNotMatch(JSON.stringify(latency), /今晚不想活了/u);
});

test('preprocessing failures persist the stages completed before fail-closed recovery', async () => {
  const room = await createOwnedRoom();
  let observed: TurnObservability | undefined;
  const failTurn = room.store.failTurn.bind(room.store);
  room.store.failTurn = async (userId, roomId, turnId, failure) => {
    observed = structuredClone(failure);
    return failTurn(userId, roomId, turnId, failure);
  };
  room.store.listRelationshipBranches = async () => [{
    agent: 'INTJ',
    version: 1,
    branch: { recentClimate: 'steady' },
  }] as never;

  const response = await runTurn(turnRequest(room, crypto.randomUUID(), {
    command: { type: 'message', text: '今天发生了一件普通的事。' },
  }));

  assert.equal(response.status, 503);
  const latency = observed?.latency as {
    schemaVersion?: number;
    stagesMs?: Record<string, number>;
  };
  assert.equal(latency.schemaVersion, 2);
  assert.deepEqual(Object.keys(latency.stagesMs ?? {}).sort(), [
    'confirmed_memory_read',
    'idempotency_lookup',
    'rate_limit',
    'relationship_branch_read',
    'safety',
    'turn_reservation',
  ]);
});

test('completed turn returns the persisted event stream for the same idempotency key', async () => {
  const room = await createOwnedRoom();
  const turnId = crypto.randomUUID();
  const first = await runTurn(turnRequest(room, turnId));
  const firstText = await first.text();
  const replay = await runTurn(turnRequest(room, turnId));
  assert.equal(replay.headers.get('x-persona16-replay'), '1');
  assert.equal(await replay.text(), firstText);
});

test('turn conflicts return a Harness-owned recovery decision', async () => {
  const room = await createOwnedRoom();
  const response = await runTurn(turnRequest(room, crypto.randomUUID(), { roomVersion: room.version + 1 }));
  const body = await response.json() as {
    error: { code: string; recoverable: boolean; recoveryAction: string; outcome: string };
  };

  assert.equal(response.status, 409);
  assert.deepEqual(body.error, {
    code: 'ROOM_VERSION_CONFLICT',
    message: '房间已在其他页面更新，请刷新后重试',
    recoverable: true,
    recoveryAction: 'refresh',
    outcome: 'known_failed',
  });
});

test('a missing room is a confirmed stop instead of an unknown turn result', async () => {
  const room = await createOwnedRoom();
  const response = await runTurn(turnRequest({ ...room, id: crypto.randomUUID() }, crypto.randomUUID()));
  const body = await response.json() as {
    error: { code: string; recoverable: boolean; recoveryAction: string; outcome: string };
  };

  assert.equal(response.status, 404);
  assert.deepEqual(body.error, {
    code: 'ROOM_NOT_FOUND',
    message: '房间不存在',
    recoverable: false,
    recoveryAction: 'stop',
    outcome: 'known_failed',
  });
});

test('an uncertain completeTurn result must refresh the original turn instead of retrying', async () => {
  const room = await createOwnedRoom();
  let observed: TurnObservability | undefined;
  room.store.completeTurn = async () => {
    throw new Error('synthetic commit acknowledgement failure');
  };
  const failTurn = room.store.failTurn.bind(room.store);
  room.store.failTurn = async (userId, roomId, turnId, failure) => {
    observed = structuredClone(failure);
    return failTurn(userId, roomId, turnId, failure);
  };

  const response = await runTurn(turnRequest(room, crypto.randomUUID()));
  const events = parseEvents(await response.text());
  const failure = events.at(-1);

  assert.equal(failure?.type, 'error');
  assert.equal(failure?.code, 'TURN_RESULT_UNKNOWN');
  assert.equal(failure?.outcome, 'unknown');
  assert.equal(failure?.recoveryAction, 'refresh');
  const latency = observed?.latency as { totalMs?: number; stagesMs?: Record<string, number> };
  assert.ok((latency.stagesMs?.turn_persistence ?? -1) >= 0);
  assert.ok((latency.totalMs ?? -1) >= (latency.stagesMs?.turn_persistence ?? 0));
});

test('an unknown called agent persists failed-turn timing after reservation', async () => {
  const room = await createOwnedRoom();
  let observed: TurnObservability | undefined;
  const failTurn = room.store.failTurn.bind(room.store);
  room.store.failTurn = async (userId, roomId, turnId, failure) => {
    observed = structuredClone(failure);
    return failTurn(userId, roomId, turnId, failure);
  };

  const response = await runTurn(turnRequest(room, crypto.randomUUID(), {
    command: { type: 'message', text: '今天发生了一件普通的事。', calledAgent: 'ENTP' },
  }));

  assert.equal(response.status, 400);
  assert.equal((observed?.trace as { errorCode?: string }).errorCode, 'UNKNOWN_AGENT');
  const latency = observed?.latency as { schemaVersion?: number; stagesMs?: Record<string, number> };
  assert.equal(latency.schemaVersion, 2);
  assert.ok((latency.stagesMs?.turn_reservation ?? -1) >= 0);
  assert.ok((latency.stagesMs?.safety ?? -1) >= 0);
});

test('relationship branch projection timeout fails closed before persona generation', async () => {
  const room = await createOwnedRoom();
  let aborted = false;
  const shadowStore = room.store as InMemoryPersonaStore & {
    listRelationshipBranches: (
      userId: string,
      agents: string[],
      options?: { signal?: AbortSignal },
    ) => Promise<never>;
  };
  shadowStore.listRelationshipBranches = async (_userId, _agents, options) => new Promise<never>(
    (_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        aborted = true;
        reject(options.signal?.reason);
      }, { once: true });
    },
  );

  const response = await runTurn(turnRequest(room, crypto.randomUUID(), {
    command: { type: 'message', text: '今天发生了一件普通的事。' },
  }));

  assert.equal(response.status, 503);
  assert.match(await response.text(), /PREPROCESSING_FAILED/);
  assert.equal(aborted, true);
});

test('malformed relationship branch data fails closed before persona generation', async () => {
  const room = await createOwnedRoom();
  room.store.listRelationshipBranches = async () => [{
    agent: 'INTJ',
    version: 1,
    branch: { recentClimate: 'steady' },
  }] as never;

  const response = await runTurn(turnRequest(room, crypto.randomUUID(), {
    command: { type: 'message', text: '今天发生了一件普通的事。' },
  }));

  assert.equal(response.status, 503);
  assert.match(await response.text(), /PREPROCESSING_FAILED/);
});

test('crisis safety bypass runs before relationship projection and cannot be blocked by its timeout', async () => {
  const room = await createOwnedRoom();
  room.store.listRelationshipBranches = async () => new Promise<never>(() => undefined);

  const response = await runTurn(turnRequest(room, crypto.randomUUID()));
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(text, /"type":"safety_notice"/);
  assert.match(text, /"type":"done"/);
});

test('production preflight projects the persisted relationship branch into the engine prompt context', () => {
  const room = createRoomState(['INTJ']);
  let branch = applyRelationshipEvent(createRelationshipBranch('legacy-intj'), {
    id: 'boundary-listen',
    sourceTurnId: 'turn-boundary',
    type: 'boundary_set',
    content: '用户明确说只想被听见时，不继续给方案',
  });
  branch = applyRelationshipEvent(branch, {
    id: 'rupture-listen',
    sourceTurnId: 'turn-rupture',
    type: 'meaningful_disagreement',
    content: '人物越过已知边界，继续替用户安排下一步',
  });

  applyRelationshipBranchContexts(room, [{
    userId: 'user-a',
    agent: 'INTJ',
    characterId: 'legacy-intj',
    branch,
    version: 2,
    updatedAt: new Date(0),
  }]);

  const context = room.agents[0]!.relationship.promptContext;
  assert.equal(context?.climate, 'tense');
  assert.deepEqual(context?.evidence.map((evidence) => evidence.kind), [
    'boundary',
    'tension',
    'turning_point',
  ]);
});

test('relationship projection enriches matching branch evidence with memory message and time provenance', () => {
  const room = createRoomState(['INTJ']);
  room.agents[0]!.relationship.promptContext = {
    memoryEnabled: true,
    evidence: [{
      id: 'memory-preference-1',
      kind: 'preference',
      content: '用户希望先看到真实例子',
      traceability: 'traceable',
      sourceTurnId: 'turn-source',
      sourceMessageId: 'message-source',
      recordedAt: '2026-08-07T00:00:00.000Z',
    }],
  };
  const branch = applyRelationshipEvent(createRelationshipBranch('legacy-intj'), {
    id: 'memory:preference-1',
    sourceTurnId: 'turn-source',
    type: 'preference_stated',
    content: '用户希望先看到真实例子',
  });

  applyRelationshipBranchContexts(room, [{
    userId: 'user-a',
    agent: 'INTJ',
    characterId: 'legacy-intj',
    branch,
    version: 1,
    updatedAt: new Date(0),
  }]);

  const [evidence] = room.agents[0]!.relationship.promptContext?.evidence ?? [];
  assert.equal(evidence?.traceability, 'traceable');
  if (evidence?.traceability === 'traceable') {
    assert.equal(evidence.sourceMessageId, 'message-source');
    assert.equal(evidence.recordedAt, '2026-08-07T00:00:00.000Z');
  }
});

test('production projection keeps active boundaries even behind more than fifty ordinary events', () => {
  const room = createRoomState(['INTJ']);
  let branch = createRelationshipBranch('legacy-intj');
  for (let index = 0; index < 55; index += 1) {
    branch = applyRelationshipEvent(branch, {
      id: `context-${index}`,
      sourceTurnId: `turn-${index}`,
      type: 'context_shared',
      content: `普通共同语境 ${index}`,
    });
  }
  branch = applyRelationshipEvent(branch, {
    id: 'boundary-after-context',
    sourceTurnId: 'turn-boundary',
    type: 'boundary_set',
    content: '用户明确说只想被听见时，不继续给方案',
  });

  applyRelationshipBranchContexts(room, [{
    userId: 'user-a', agent: 'INTJ', characterId: 'legacy-intj', branch,
    version: 56, updatedAt: new Date(0),
  }]);

  assert.ok(room.agents[0]!.relationship.promptContext?.evidence.some((item) => (
    item.id === 'boundary:boundary-after-context'
  )));
});

test('another anonymous session cannot read a room', async () => {
  const room = await createOwnedRoom();
  const response = await getRoom(
    new Request(`http://localhost/api/rooms/${room.id}`),
    { params: Promise.resolve({ roomId: room.id }) },
  );
  assert.equal(response.status, 404);
});

test('memory confirmation endpoint moves a candidate into prompt-eligible status', async () => {
  const room = await createOwnedRoom();
  const turnId = crypto.randomUUID();
  await (await runTurn(turnRequest(room, turnId))).text();
  const [candidate] = await room.store.createMemoryCandidates({
    userId: (await room.store.getRoom(room.id, parseCookieUserId(room.cookie))).userId,
    sourceTurnId: turnId,
    candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
  });
  assert.ok(candidate);
  const response = await updateMemory(
    new Request(`http://localhost/api/memories/${candidate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: room.cookie },
      body: JSON.stringify({ action: 'confirm' }),
    }),
    { params: Promise.resolve({ memoryId: candidate.id }) },
  );
  assert.equal(response.status, 200);
  const confirmed = await room.store.listConfirmedMemories(candidate.userId, ['INTJ']);
  assert.equal(confirmed[0]?.content, '先给结论');
  const [branch] = await room.store.listRelationshipBranches(candidate.userId, ['INTJ']);
  assert.equal(branch?.branch.interactionStyle[0]?.content, '先给结论');

  const currentRoom = await room.store.getRoom(room.id, candidate.userId);
  const shadowTurn = await runTurn(turnRequest({ ...room, version: currentRoom.version }, crypto.randomUUID()));
  assert.equal(shadowTurn.status, 200);
  await shadowTurn.text();
});

test('memory endpoint restores only pending decisions from the requested room', async () => {
  const room = await createOwnedRoom();
  const userId = parseCookieUserId(room.cookie);
  const secondRoom = await room.store.createRoom({ userId, state: createRoomState(['INTJ']) });
  const complete = async (roomId: string, turnId: string) => {
    const stored = await room.store.getRoom(roomId, userId);
    await room.store.reserveTurn({
      userId, roomId, turnId, roomVersion: stored.version, requestHash: `memory:${turnId}`,
      promptVersion: 'test-v1', model: 'fake:test',
    });
    await room.store.completeTurn({
      userId, roomId, turnId, state: stored.state, stopReason: 'complete', events: [],
    });
  };
  await complete(room.id, 'turn-room-a');
  await complete(secondRoom.id, 'turn-room-b');
  const [expected] = await room.store.createMemoryCandidates({
    userId, sourceTurnId: 'turn-room-a',
    candidates: [{ agent: 'INTJ', kind: 'preference', content: '先给结论' }],
  });
  await room.store.createMemoryCandidates({
    userId, sourceTurnId: 'turn-room-b',
    candidates: [{ agent: 'INTJ', kind: 'boundary', content: '不要催我' }],
  });

  const response = await listMemories(new Request(
    `http://localhost/api/memories?status=candidate&roomId=${room.id}`,
    { headers: { Cookie: room.cookie } },
  ));
  const body = await response.json() as { memories: Array<{ id: string }> };

  assert.equal(response.status, 200);
  assert.deepEqual(body.memories.map((memory) => memory.id), [expected?.id]);
});

test('room commands use narrow actions and confirm destructive member removal', async () => {
  const room = await createOwnedRoom();
  const context = { params: Promise.resolve({ roomId: room.id }) };
  const command = (roomVersion: number, body: Record<string, unknown>) => updateRoom(
    new Request(`http://localhost/api/rooms/${room.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: room.cookie },
      body: JSON.stringify({ roomVersion, command: body }),
    }),
    context,
  );

  const paused = await command(1, { type: 'pause_agent', agent: 'INTJ' });
  assert.equal(paused.status, 200);
  const pausedRoom = await paused.json() as { version: number; state: { agents: Array<{ type: string; paused: boolean }> } };
  assert.equal(pausedRoom.state.agents.find((agent) => agent.type === 'INTJ')?.paused, true);

  const invited = await command(pausedRoom.version, { type: 'invite_agent', agent: 'ENTP' });
  const invitedRoom = await invited.json() as { version: number; state: { agents: Array<{ type: string }> } };
  assert.deepEqual(invitedRoom.state.agents.map((agent) => agent.type), ['INTJ', 'ENFP', 'ENTP']);

  const needsConfirmation = await command(invitedRoom.version, { type: 'remove_agent', agent: 'INTJ' });
  assert.equal(needsConfirmation.status, 409);
  assert.equal((await needsConfirmation.json() as { error: { code: string } }).error.code, 'ROOM_COMMAND_CONFIRMATION_REQUIRED');

  const removed = await command(invitedRoom.version, { type: 'remove_agent', agent: 'INTJ', confirmed: true });
  const removedRoom = await removed.json() as { state: { agents: Array<{ type: string }> } };
  assert.deepEqual(removedRoom.state.agents.map((agent) => agent.type), ['ENFP', 'ENTP']);
});

test('feedback API accepts an owned persona message and rejects user messages', async () => {
  const room = await createOwnedRoom();
  const userId = parseCookieUserId(room.cookie);
  const stored = await room.store.getRoom(room.id, userId);
  const turnId = crypto.randomUUID();
  await room.store.reserveTurn({
    userId, roomId: room.id, turnId, roomVersion: stored.version, requestHash: 'feedback-api',
    promptVersion: 'test-v1', model: 'fake:test',
  });
  const state = structuredClone(stored.state);
  const userMessageId = crypto.randomUUID();
  const agentMessageId = crypto.randomUUID();
  state.history.push({ id: userMessageId, speaker: 'user', text: '问题' });
  state.history.push({ id: agentMessageId, speaker: 'INTJ', text: '回答', speechType: '短句' });
  await room.store.completeTurn({ userId, roomId: room.id, turnId, state, stopReason: 'complete', events: [] });

  const accepted = await submitFeedback(new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: room.cookie },
    body: JSON.stringify({ roomId: room.id, messageId: agentMessageId, rating: 'negative', tags: ['too_short'] }),
  }));
  assert.equal(accepted.status, 200);
  const rejected = await submitFeedback(new Request('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: room.cookie },
    body: JSON.stringify({ roomId: room.id, messageId: userMessageId, rating: 'positive', tags: [] }),
  }));
  assert.equal(rejected.status, 404);
});

function parseCookieUserId(cookie: string): string {
  const encoded = cookie.split(';')[0]!.split('=').slice(1).join('=');
  return decodeURIComponent(encoded).split('.')[0]!;
}
