import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRoom,
  createRoomLoopState,
  forcedStopReason,
  initialRoomAction,
  utteranceSimilarity,
  validateRoomAction,
} from '../src';
import type { TurnPlan } from '../src/types';

function plan(forceSummary = false): TurnPlan {
  return {
    scene: '决策',
    userEmotion: '稳定',
    forceSummary,
    scores: [],
    speakers: [
      { type: 'INTJ', speechType: '长发言', finalScore: 80, angle: '长期风险' },
      { type: 'ENFP', speechType: '短句', finalScore: 70, angle: '新可能' },
    ],
  };
}

test('initial action uses the first planned speaker', () => {
  assert.deepEqual(initialRoomAction(plan()), {
    type: 'speak',
    agent: 'INTJ',
    speechType: '长发言',
    angle: '长期风险',
  });
});

test('forceSummary converts the first action into a summary', () => {
  assert.deepEqual(initialRoomAction(plan(true)), {
    type: 'summarize',
    agent: 'INTJ',
    reason: '争论已达到收束阈值',
  });
});

test('policy rejects paused, unplanned and repeated normal speakers', () => {
  const room = createRoom(['INTJ', 'ENFP', 'ISTJ']);
  const state = createRoomLoopState();
  room.agents.find((agent) => agent.type === 'ENFP')!.paused = true;

  assert.equal(validateRoomAction(
    { type: 'speak', agent: 'ENFP', speechType: '短句', angle: 'x' }, room, plan(), state,
  ).type, 'stop');
  assert.equal(validateRoomAction(
    { type: 'speak', agent: 'ISTJ', speechType: '短句', angle: 'x' }, room, plan(), state,
  ).type, 'stop');

  state.normalSpeakers.push('INTJ');
  assert.equal(validateRoomAction(
    { type: 'speak', agent: 'INTJ', speechType: '短句', angle: 'x' }, room, plan(), state,
  ).type, 'stop');
});

test('hard duration and generated-character budgets stop the room', () => {
  const state = createRoomLoopState(100);
  assert.equal(forcedStopReason(state, { maxNormalSpeakers: 3, maxSummaries: 1, maxControllerCalls: 3, maxDurationMs: 10, maxGeneratedCharacters: 100 }, 110), 'budget_exhausted');

  state.generatedCharacters = 100;
  assert.equal(forcedStopReason(state, { maxNormalSpeakers: 3, maxSummaries: 1, maxControllerCalls: 3, maxDurationMs: 1_000, maxGeneratedCharacters: 100 }, 101), 'budget_exhausted');
});

test('bigram similarity detects near-identical Chinese replies', () => {
  const left = '你真正害怕的不是辞职，而是辞职以后不知道往哪里走。';
  const right = '你真正害怕的不是辞职，而是辞职以后不知道应该往哪里走。';
  const unrelated = '先算清楚现金储备能支撑多少个月，再决定离场时间。';

  assert.ok(utteranceSimilarity(left, right) >= 0.72);
  assert.ok(utteranceSimilarity(left, unrelated) < 0.72);
});

test('controller cannot upgrade a planned short speaker to a long speech', () => {
  const room = createRoom(['INTJ', 'ENFP']);
  const action = validateRoomAction(
    { type: 'speak', agent: 'ENFP', speechType: '长发言', angle: '尝试展开' },
    room,
    plan(),
    createRoomLoopState(),
  );

  assert.equal(action.type === 'speak' ? action.speechType : '', '短句');
});
