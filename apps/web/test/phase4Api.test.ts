import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom as createRoomState } from '@persona16/engine';
import { InMemoryPersonaStore } from '@persona16/store';
import { POST as createRoom } from '../app/api/rooms/route';
import { GET as getRoom, PATCH as updateRoom } from '../app/api/rooms/[roomId]/route';
import { POST as runTurn } from '../app/api/turn/route';
import { POST as submitFeedback } from '../app/api/feedback/route';
import { PATCH as updateMemory } from '../app/api/memories/[memoryId]/route';
import { GET as listMemories } from '../app/api/memories/route';

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
  room.store.completeTurn = async () => {
    throw new Error('synthetic commit acknowledgement failure');
  };

  const response = await runTurn(turnRequest(room, crypto.randomUUID()));
  const events = parseEvents(await response.text());
  const failure = events.at(-1);

  assert.equal(failure?.type, 'error');
  assert.equal(failure?.code, 'TURN_RESULT_UNKNOWN');
  assert.equal(failure?.outcome, 'unknown');
  assert.equal(failure?.recoveryAction, 'refresh');
});

test('relationship shadow read timeout never blocks the production turn', async () => {
  const room = await createOwnedRoom();
  room.store.listRelationshipBranches = async () => new Promise<never>(() => undefined);

  const startedAt = Date.now();
  const response = await runTurn(turnRequest(room, crypto.randomUUID()));

  assert.equal(response.status, 200);
  assert.match(await response.text(), /"type":"done"/);
  assert.ok(Date.now() - startedAt < 1_000);
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
