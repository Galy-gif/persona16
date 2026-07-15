import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom } from '@persona16/engine';
import { InMemoryPersonaStore } from '@persona16/store';
import {
  RoomCommandError,
  createRoomCommandModule,
  decideRoomCommandPermission,
} from '../lib/server/roomCommand';

async function ownedRoom() {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({
    userId: 'user-a',
    state: createRoom(['INTJ', 'ENFP']),
  });
  return { store, room };
}

test('permission decision is explicit about allow, confirm and deny', () => {
  assert.deepEqual(
    decideRoomCommandPermission(
      { type: 'pause_agent', agent: 'INTJ' },
      { source: 'explicit_user_text' },
    ),
    { decision: 'allow' },
  );
  assert.deepEqual(
    decideRoomCommandPermission(
      { type: 'remove_agent', agent: 'INTJ' },
      { source: 'ui_action' },
    ),
    { decision: 'confirm', code: 'ROOM_COMMAND_CONFIRMATION_REQUIRED' },
  );
  assert.deepEqual(
    decideRoomCommandPermission(
      { type: 'pause_agent', agent: 'INTJ' },
      { source: 'model_inference' },
    ),
    { decision: 'deny', code: 'ROOM_COMMAND_PERMISSION_DENIED' },
  );
});

test('model inference cannot pause a room member without user authorization', async () => {
  const { store, room } = await ownedRoom();
  const commands = createRoomCommandModule(store);

  await assert.rejects(
    commands.execute({
      userId: 'user-a',
      roomId: room.id,
      expectedVersion: room.version,
      command: { type: 'pause_agent', agent: 'INTJ' },
      authorization: { source: 'model_inference' },
    }),
    (error) => error instanceof RoomCommandError
      && error.code === 'ROOM_COMMAND_PERMISSION_DENIED',
  );

  const unchanged = await store.getRoom(room.id, 'user-a');
  assert.equal(unchanged.state.agents.find((agent) => agent.type === 'INTJ')?.paused, false);
  assert.equal(unchanged.version, room.version);
});

test('explicit user text can pause a member through the shared command module', async () => {
  const { store, room } = await ownedRoom();
  const commands = createRoomCommandModule(store);

  const result = await commands.execute({
    userId: 'user-a',
    roomId: room.id,
    expectedVersion: room.version,
    command: { type: 'pause_agent', agent: 'INTJ' },
    authorization: { source: 'explicit_user_text' },
  });

  assert.equal(result.changed, true);
  assert.equal(result.room.version, room.version + 1);
  assert.equal(result.room.state.agents.find((agent) => agent.type === 'INTJ')?.paused, true);
});

test('removing a member requires a separate user confirmation', async () => {
  const { store, room } = await ownedRoom();
  const commands = createRoomCommandModule(store);

  await assert.rejects(
    commands.execute({
      userId: 'user-a',
      roomId: room.id,
      expectedVersion: room.version,
      command: { type: 'remove_agent', agent: 'INTJ' },
      authorization: { source: 'explicit_user_text' },
    }),
    (error) => error instanceof RoomCommandError
      && error.code === 'ROOM_COMMAND_CONFIRMATION_REQUIRED',
  );

  const unchanged = await store.getRoom(room.id, 'user-a');
  assert.deepEqual(unchanged.state.agents.map((agent) => agent.type), ['INTJ', 'ENFP']);
});

test('confirmed user action removes a member', async () => {
  const { store, room } = await ownedRoom();
  const commands = createRoomCommandModule(store);

  const result = await commands.execute({
    userId: 'user-a',
    roomId: room.id,
    expectedVersion: room.version,
    command: { type: 'remove_agent', agent: 'INTJ' },
    authorization: { source: 'ui_action', confirmed: true },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(result.room.state.agents.map((agent) => agent.type), ['ENFP']);
});

test('permission does not bypass the last active member room policy', async () => {
  const store = new InMemoryPersonaStore();
  const room = await store.createRoom({
    userId: 'user-a',
    state: createRoom(['INTJ']),
  });
  const commands = createRoomCommandModule(store);

  await assert.rejects(
    commands.execute({
      userId: 'user-a',
      roomId: room.id,
      expectedVersion: room.version,
      command: { type: 'pause_agent', agent: 'INTJ' },
      authorization: { source: 'ui_action' },
    }),
    (error) => error instanceof RoomCommandError && error.code === 'LAST_ACTIVE_AGENT',
  );
});

test('the shared command module resumes and invites members', async () => {
  const { store, room } = await ownedRoom();
  const commands = createRoomCommandModule(store);
  const paused = await commands.execute({
    userId: 'user-a', roomId: room.id, expectedVersion: room.version,
    command: { type: 'pause_agent', agent: 'INTJ' },
    authorization: { source: 'ui_action' },
  });

  const resumed = await commands.execute({
    userId: 'user-a', roomId: room.id, expectedVersion: paused.room.version,
    command: { type: 'resume_agent', agent: 'INTJ' },
    authorization: { source: 'ui_action' },
  });
  assert.equal(resumed.changed, true);
  assert.equal(resumed.room.state.agents.find((agent) => agent.type === 'INTJ')?.paused, false);

  const invited = await commands.execute({
    userId: 'user-a', roomId: room.id, expectedVersion: resumed.room.version,
    command: { type: 'invite_agent', agent: 'ENTP' },
    authorization: { source: 'ui_action' },
  });
  assert.equal(invited.changed, true);
  assert.deepEqual(invited.room.state.agents.map((agent) => agent.type), ['INTJ', 'ENFP', 'ENTP']);
});
