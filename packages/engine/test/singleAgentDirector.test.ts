import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoom } from '../src/engine';
import {
  createSingleAgentDecision,
  shouldUseModelDirector,
} from '../src/singleAgentDirector';

test('single-agent conversational turns bypass the model director', () => {
  const room = createRoom(['INTJ']);

  assert.equal(
    shouldUseModelDirector(room, '今天有点累，陪我随便聊两句就好。'),
    false,
  );
  assert.equal(
    shouldUseModelDirector(room, '你还记得我之前说过的事吗？'),
    false,
  );
  assert.equal(
    shouldUseModelDirector(room, '请分析这两个工作机会，但别替我选。'),
    true,
  );
});

test('multi-agent rooms retain model scheduling and chemistry', () => {
  const room = createRoom(['INTJ', 'ENFP']);

  assert.equal(shouldUseModelDirector(room, '今天有点累。'), true);

  room.agents[1]!.paused = true;
  assert.equal(
    shouldUseModelDirector(room, '今天有点累。'),
    true,
    'a multi-member room remains a room even when only one member is currently active',
  );
});

test('the deterministic single-agent decision always produces one grounded speaker', () => {
  const room = createRoom(['INTJ']);
  const decision = createSingleAgentDecision(room, '我今天只想被听见。', 'sensitive');

  assert.deepEqual(
    {
      scene: decision.scene,
      userEmotion: decision.userEmotion,
      conflictTopic: decision.conflictTopic,
      forceSummary: decision.forceSummary,
      assessment: decision.assessments[0],
    },
    {
      scene: '陪伴',
      userEmotion: '脆弱',
      conflictTopic: null,
      forceSummary: false,
      assessment: {
        type: 'INTJ',
        baseImpulse: 60,
        angle: '直接接用户这句话；不必展示人物倾向或强行分析',
        suggestedSpeechType: '短句',
      },
    },
  );
});
