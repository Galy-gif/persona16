import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { InMemoryPersonaStore } from '@persona16/store';
import { saveArtifact } from './shared';

loadEnv({ path: join(import.meta.dirname, '..', '..', '.env') });

const store = new InMemoryPersonaStore();
globalThis.__persona16Store = store;
const [{ POST: createRoom }, { POST: runTurn }, { PATCH: updateMemory }] = await Promise.all([
  import('../../apps/web/app/api/rooms/route'),
  import('../../apps/web/app/api/turn/route'),
  import('../../apps/web/app/api/memories/[memoryId]/route'),
]);

const createdResponse = await createRoom(new Request('http://localhost/api/rooms', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agents: ['INTJ'] }),
}));
if (!createdResponse.ok) throw new Error(`create room failed: ${createdResponse.status}`);
const room = await createdResponse.json() as { id: string; version: number };
const cookie = createdResponse.headers.get('set-cookie')!;
const turnId = crypto.randomUUID();
const turnResponse = await runTurn(new Request('http://localhost/api/turn', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({
    roomId: room.id,
    turnId,
    roomVersion: room.version,
    command: { type: 'message', text: '我更喜欢你先给结论，再解释最关键的原因。' },
  }),
}));
const events = (await turnResponse.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
const error = events.find((event) => event.type === 'error');
if (error) throw new Error(`turn failed: ${String(error.code)}`);
const candidateEvent = events.find((event) => event.type === 'memory_candidate') as
  | { candidate: { id: string } }
  | undefined;
if (!candidateEvent) throw new Error('expected a memory candidate');
const memoryResponse = await updateMemory(new Request(`http://localhost/api/memories/${candidateEvent.candidate.id}`, {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ action: 'confirm' }),
}), { params: Promise.resolve({ memoryId: candidateEvent.candidate.id }) });
if (!memoryResponse.ok) throw new Error(`memory confirmation failed: ${memoryResponse.status}`);

const result = {
  passed: true,
  eventTypes: events.map((event) => event.type),
  hasRoomAction: events.some((event) => event.type === 'room_action'),
  hasMemoryCandidate: true,
  terminalEvent: events.at(-1)?.type,
};
saveArtifact('phase4-smoke.json', result);
console.log(result);
