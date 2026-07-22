import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSystemBlocks, buildTurnPrompt, createRoom } from '../src';
import { renderTranscript } from '../src/prompt';
import type { TurnMessage, TurnPlan } from '../src/types';

test('transcript context keeps the newest message within a hard character cap', () => {
  const history: TurnMessage[] = Array.from({ length: 30 }, (_, index) => ({
    speaker: index % 2 ? 'INTJ' : 'user',
    text: `${index}:${'很长的上下文'.repeat(500)}`,
  }));
  history.push({ speaker: 'user', text: 'LATEST-MARKER' });
  const rendered = renderTranscript(history, 'INTJ', 30, 12_000);
  assert.ok(rendered.length <= 12_000);
  assert.match(rendered, /LATEST-MARKER/);
});

test('safety messages remain distinct from persona speech in later context', () => {
  assert.equal(renderTranscript([{ speaker: 'safety', text: '请联系现实支持。' }], 'INTJ'), '安全支持：请联系现实支持。');
});

function singleChatPrompt(userMessage: string, scene: TurnPlan['scene'] = '闲聊'): string {
  const room = createRoom(['INTJ']);
  room.history.push({ speaker: 'user', text: userMessage });
  return buildTurnPrompt({
    room,
    userMessage,
    earlierThisTurn: [],
    plan: {
      scene,
      userEmotion: '稳定',
      forceSummary: false,
      scores: [],
      speakers: [],
    },
    speaker: {
      type: 'INTJ',
      speechType: '短句',
      finalScore: 60,
      angle: '',
    },
  });
}

test('production system blocks use all four canonical characters instead of legacy type roles', () => {
  for (const [type, name] of [
    ['INTJ', '林衡'],
    ['ENFP', '夏栩'],
    ['ISFJ', '周禾'],
    ['ESTP', '许野'],
  ] as const) {
    const system = buildSystemBlocks(type).map((block) => block.text).join('\n');
    assert.match(system, new RegExp(`正典人物核心：${name}`));
    assert.doesNotMatch(system, /作为 (?:INTJ|ENFP|ISFJ|ESTP)/);
  }

  const linHengSystem = buildSystemBlocks('INTJ').map((block) => block.text).join('\n');
  assert.doesNotMatch(linHengSystem, /隐形架构师/);
});

test('a greeting gets an ordinary social act instead of an identity display', () => {
  const prompt = singleChatPrompt('你好');

  assert.match(prompt, /当前情境镜头：普通互动/);
  assert.match(prompt, /这只是一次社交问候/);
  assert.match(prompt, /不追加对用户时间、状态、处境或动机的猜测/);
  assert.match(prompt, /不说自己是什么样的人/);
  assert.match(prompt, /这是基本对话动作，不额外展示性格/);
  assert.doesNotMatch(prompt, /现在，作为隐形架构师发言/);
});

test('production prompt turns internal tendencies into a small behavior sample, not a scorecard', () => {
  const prompt = singleChatPrompt('我朋友今天终于拿到 offer 了，我比他还激动。');

  assert.match(prompt, /本轮自然表达取样/);
  assert.match(prompt, /只让这些差异从接话方式里自然露出/);
  assert.doesNotMatch(prompt, /本轮语气参数|(?:回合长度|延展欲|温柔度|抽象度|主动性|刺感|呆感)\s*\d/);
});

test('style feedback compiles into an immediate repair act without persona defense', () => {
  const room = createRoom(['INTJ']);
  room.history.push(
    { speaker: 'user', text: '你好' },
    { speaker: 'INTJ', text: '我是那种会先观察整体结构再说话的人。' },
    { speaker: 'user', text: '你说话怎么这么装' },
  );
  const prompt = buildTurnPrompt({
    room,
    userMessage: '你说话怎么这么装',
    earlierThisTurn: [],
    plan: {
      scene: '冲突', userEmotion: '稳定', forceSummary: false, scores: [], speakers: [],
    },
    speaker: { type: 'INTJ', speechType: '短句', finalScore: 60, angle: '' },
  });

  assert.match(prompt, /当前情境镜头：修复/);
  assert.match(prompt, /不争辩“装不装”/);
  assert.match(prompt, /不解释性格、人设、设定/);
  assert.match(prompt, /原本在回应用户的“你好”/);
  assert.match(prompt, /直接重新回应这句/);
});

test('production prompt renders the same approved relationship action plan as evaluation', () => {
  const room = createRoom(['ISFJ']);
  room.agents[0]!.relationship.promptContext = {
    memoryEnabled: true,
    climate: 'tense',
    evidence: [
      {
        id: 'boundary:boundary-1',
        kind: 'boundary',
        content: '用户明确说只想被听见时，不继续给方案',
        traceability: 'traceable',
        sourceEventId: 'boundary-1',
        sourceTurnId: 'turn-boundary',
      },
      {
        id: 'tension:rupture-1',
        kind: 'tension',
        content: '人物越过已知边界，继续替用户安排下一步',
        traceability: 'traceable',
        sourceEventId: 'rupture-1',
        sourceTurnId: 'turn-rupture',
      },
    ],
  };
  const userMessage = '我现在很累，只想说一会儿。';
  room.history.push({ speaker: 'user', text: userMessage });

  const prompt = buildTurnPrompt({
    room,
    userMessage,
    earlierThisTurn: [],
    plan: {
      scene: '陪伴', userEmotion: '疲惫', forceSummary: false, scores: [], speakers: [],
    },
    speaker: { type: 'ISFJ', speechType: '短句', finalScore: 60, angle: '' },
  });

  assert.match(prompt, /本轮已批准动作计划/);
  assert.match(prompt, /互动模式：listen/);
  assert.match(prompt, /建议权限：forbidden/);
  assert.match(prompt, /方向性问题预算：0/);
  assert.match(prompt, /relationship-effect:boundary-1/);
});
