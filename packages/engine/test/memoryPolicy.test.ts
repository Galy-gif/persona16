import assert from 'node:assert/strict';
import test from 'node:test';
import { applyConfirmedMemories, clearInjectedMemories, extractMemoryCandidate } from '../src/memory/memoryPolicy';
import { createRoom } from '../src/engine';

test('only explicit durable statements become memory candidates', () => {
  assert.deepEqual(extractMemoryCandidate('我更喜欢你先给结论，再解释原因。', 'INTJ'), {
    agent: 'INTJ',
    kind: 'preference',
    content: '我更喜欢你先给结论，再解释原因。',
  });
  assert.equal(extractMemoryCandidate('今天午饭吃什么？', 'INTJ'), undefined);
});

test('sensitive personal data is never proposed as memory', () => {
  assert.equal(extractMemoryCandidate('请记住我的身份证号是 110101199001011234', 'INTJ'), undefined);
});

test('prompt relationship state receives confirmed memories only', () => {
  const room = createRoom(['INTJ']);
  applyConfirmedMemories(room, [
    { agent: 'INTJ', kind: 'preference', content: '先说结论', status: 'confirmed' },
    { agent: 'INTJ', kind: 'boundary', content: '不要催我', status: 'candidate' },
    { agent: 'INTJ', kind: 'repeated_pattern', content: '总在最后一天行动', status: 'rejected' },
  ]);

  assert.deepEqual(room.agents[0]!.relationship.userPrefers, ['先说结论']);
  assert.deepEqual(room.agents[0]!.relationship.knownBoundaries, []);
  assert.deepEqual(room.agents[0]!.relationship.repeatedPatterns, []);
  clearInjectedMemories(room);
  assert.deepEqual(room.agents[0]!.relationship.userPrefers, []);
});
