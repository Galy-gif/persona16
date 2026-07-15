import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceRoomState, createRoom, resolveTurnPlan } from '../src';
import type { AgentType, DirectorDecision } from '../src/types';

function decision(
  assessments: Array<{ type: AgentType; baseImpulse: number; suggestedSpeechType?: '长发言' | '短句' }>,
): DirectorDecision {
  return {
    scene: '决策',
    userEmotion: '稳定',
    conflictTopic: null,
    forceSummary: false,
    assessments: assessments.map((item) => ({
      type: item.type,
      baseImpulse: item.baseImpulse,
      angle: `${item.type} 的角度`,
      suggestedSpeechType: item.suggestedSpeechType ?? '长发言',
    })),
  };
}

test('a called active agent receives +40 and speaks first', () => {
  const room = createRoom(['INTJ', 'ENFP']);
  room.calledAgent = 'ENFP';

  const plan = resolveTurnPlan(
    decision([
      { type: 'INTJ', baseImpulse: 70 },
      { type: 'ENFP', baseImpulse: 20 },
    ]),
    room,
  );

  assert.equal(plan.speakers[0]?.type, 'ENFP');
  assert.equal(plan.scores.find((score) => score.type === 'ENFP')?.adjusted, 60);
});

test('a paused agent never speaks even when called', () => {
  const room = createRoom(['INTJ', 'ENFP']);
  room.calledAgent = 'ENFP';
  room.agents.find((agent) => agent.type === 'ENFP')!.paused = true;

  const plan = resolveTurnPlan(
    decision([
      { type: 'INTJ', baseImpulse: 70 },
      { type: 'ENFP', baseImpulse: 85 },
    ]),
    room,
  );

  assert.equal(plan.speakers.some((speaker) => speaker.type === 'ENFP'), false);
  assert.equal(plan.scores.find((score) => score.type === 'ENFP')?.adjusted, 0);
});

test('the three-agent crowd penalty can push an agent below the speaking threshold', () => {
  const room = createRoom(['INTJ', 'ENFP', 'ISTJ']);

  const plan = resolveTurnPlan(
    decision([
      { type: 'INTJ', baseImpulse: 80 },
      { type: 'ENFP', baseImpulse: 80 },
      { type: 'ISTJ', baseImpulse: 52 },
    ]),
    room,
  );

  assert.equal(plan.scores.find((score) => score.type === 'ISTJ')?.adjusted, 44);
  assert.equal(plan.speakers.some((speaker) => speaker.type === 'ISTJ'), false);
});

test('a newly added agent receives +20', () => {
  const room = createRoom(['INTJ']);
  room.agents.push({
    type: 'ENFP',
    paused: false,
    turnsSinceSpoke: 999,
    turnsInRoom: 0,
    recentOpenings: [],
    relationship: { intimacy: 0, userPrefers: [], repeatedPatterns: [], knownBoundaries: [] },
  });

  const plan = resolveTurnPlan(
    decision([
      { type: 'INTJ', baseImpulse: 20 },
      { type: 'ENFP', baseImpulse: 30 },
    ]),
    room,
  );

  assert.equal(plan.scores.find((score) => score.type === 'ENFP')?.adjusted, 50);
  assert.equal(plan.speakers[0]?.type, 'ENFP');
});

test('at most two speakers keep the long-speech type', () => {
  const room = createRoom(['INTJ', 'ENFP', 'ISTJ']);
  const plan = resolveTurnPlan(
    decision([
      { type: 'INTJ', baseImpulse: 85 },
      { type: 'ENFP', baseImpulse: 84 },
      { type: 'ISTJ', baseImpulse: 83 },
    ]),
    room,
  );

  assert.equal(plan.speakers.length, 3);
  assert.equal(plan.speakers.filter((speaker) => speaker.speechType === '长发言').length, 2);
  assert.equal(plan.speakers[2]?.speechType, '短句');
});

test('a completed summary clears the tracked conflict after advancing the room', () => {
  const room = createRoom(['INTJ', 'ENFP']);
  room.conflictTopic = '是否辞职';
  room.conflictRounds = 3;
  const plan = resolveTurnPlan(
    { ...decision([{ type: 'INTJ', baseImpulse: 80 }]), forceSummary: true },
    room,
  );

  advanceRoomState(room, plan, '是否辞职', true);

  assert.equal(room.conflictTopic, null);
  assert.equal(room.conflictRounds, 0);
});

test('a requested summary does not clear conflict when no summary completed', () => {
  const room = createRoom(['INTJ']);
  room.conflictTopic = '是否辞职';
  room.conflictRounds = 3;
  const plan = resolveTurnPlan(
    {
      ...decision([{ type: 'INTJ', baseImpulse: 0 }]),
      conflictTopic: '是否辞职',
      forceSummary: true,
      assessments: [{
        type: 'INTJ',
        baseImpulse: 0,
        angle: '',
        suggestedSpeechType: '沉默',
      }],
    },
    room,
  );

  assert.equal(plan.speakers.length, 0);
  advanceRoomState(room, plan, '是否辞职', false);

  assert.equal(room.conflictTopic, '是否辞职');
  assert.equal(room.conflictRounds, 4);
});
