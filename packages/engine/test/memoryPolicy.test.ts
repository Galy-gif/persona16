import assert from 'node:assert/strict';
import test from 'node:test';
import { applyConfirmedMemories, clearInjectedMemories, extractMemoryCandidate } from '../src/memory/memoryPolicy';
import { createRoom } from '../src/engine';
import { buildTurnPrompt } from '../src/prompt';

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
    {
      id: 'memory-1',
      agent: 'INTJ',
      kind: 'preference',
      content: '先说结论',
      status: 'confirmed',
      sourceTurnId: 'turn-12',
    },
    {
      id: 'memory-older-duplicate',
      agent: 'INTJ',
      kind: 'preference',
      content: '先说结论',
      status: 'confirmed',
      sourceTurnId: 'turn-3',
    },
    { agent: 'INTJ', kind: 'boundary', content: '不要催我', status: 'candidate' },
    { agent: 'INTJ', kind: 'repeated_pattern', content: '总在最后一天行动', status: 'rejected' },
  ]);

  assert.deepEqual(room.agents[0]!.relationship.userPrefers, ['先说结论']);
  assert.deepEqual(room.agents[0]!.relationship.knownBoundaries, []);
  assert.deepEqual(room.agents[0]!.relationship.repeatedPatterns, []);
  assert.deepEqual(room.agents[0]!.relationship.promptContext?.evidence, [{
    id: 'memory-1',
    kind: 'preference',
    content: '先说结论',
    traceability: 'traceable',
    sourceTurnId: 'turn-12',
  }]);

  const prompt = buildTurnPrompt({
    plan: {
      scene: '闲聊',
      userEmotion: '稳定',
      forceSummary: false,
      speakers: [{ type: 'INTJ', speechType: '短句', finalScore: 80, angle: '自然回应' }],
      scores: [],
    },
    room,
    speaker: { type: 'INTJ', speechType: '短句', finalScore: 80, angle: '自然回应' },
    earlierThisTurn: [],
    userMessage: '先聊重点。',
  });
  assert.match(prompt, /先说结论/);
  assert.match(prompt, /记忆 memory-1/);
  assert.match(prompt, /对话轮次 turn-12/);

  clearInjectedMemories(room);
  assert.deepEqual(room.agents[0]!.relationship.userPrefers, []);
  assert.equal(room.agents[0]!.relationship.promptContext, undefined);

  room.agents[0]!.relationship.userPrefers.push('旧版偏好');
  const legacyPrompt = buildTurnPrompt({
    plan: {
      scene: '闲聊',
      userEmotion: '稳定',
      forceSummary: false,
      speakers: [{ type: 'INTJ', speechType: '短句', finalScore: 80, angle: '自然回应' }],
      scores: [],
    },
    room,
    speaker: { type: 'INTJ', speechType: '短句', finalScore: 80, angle: '自然回应' },
    earlierThisTurn: [],
    userMessage: '继续。',
  });
  assert.match(legacyPrompt, /旧版已确认记录，不可追溯/);
  assert.doesNotMatch(legacyPrompt, /记忆 legacy-preference/);
});
