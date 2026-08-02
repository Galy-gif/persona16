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

function singleChatPrompt(
  userMessage: string,
  scene: TurnPlan['scene'] = '闲聊',
  type: 'INTJ' | 'ENFP' | 'ISFJ' | 'ESTP' = 'INTJ',
  activeDispositionId?: string,
): string {
  const room = createRoom([type]);
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
      type,
      speechType: '短句',
      finalScore: 60,
      angle: '',
      activeDispositionId,
    },
  });
}

test('production system blocks keep all four canonical characters present without making topical dispositions permanent', () => {
  for (const [type, name, dormantPatterns] of [
    ['INTJ', '林衡', /不可逆后果|隐藏依赖|无人负责的变量/],
    ['ENFP', '夏栩', /做不到与不想要|开放可能|真实意愿/],
    ['ISFJ', '周禾', /日常断点|被忽略的承诺|关系维护是否互惠/],
    ['ESTP', '许野', /现实接触|最小可撤回|谁真正能行动/],
  ] as const) {
    const system = buildSystemBlocks(type).map((block) => block.text).join('\n');
    assert.match(system, new RegExp(`正典人物存在：${name}`));
    assert.match(system, /不需要在每次回应里证明自己是什么样的人/);
    assert.match(system, /先由当前对话决定回应什么/);
    assert.doesNotMatch(system, /你只回应你的人格最在意的那一个点|你的人格决定你的结构/);
    assert.doesNotMatch(system, dormantPatterns);
    assert.doesNotMatch(system, /作为 (?:INTJ|ENFP|ISFJ|ESTP)/);
  }

  const linHengSystem = buildSystemBlocks('INTJ').map((block) => block.text).join('\n');
  assert.doesNotMatch(linHengSystem, /隐形架构师/);
});

test('the global contract forbids invented memory and privacy promises', () => {
  const system = buildSystemBlocks('INTJ').map((block) => block.text).join('\n');

  assert.match(system, /没有对话记录或关系记忆证据.*不得声称用户以前提过/u);
  assert.match(system, /数据保存、训练、人工访问或保密.*不得猜测或承诺/u);
  assert.match(system, /不得把推测写成“你其实知道”或“你只是不愿承认”/u);
  assert.match(system, /相加或直接比较的量必须使用同一单位/u);
});

test('a greeting gets an ordinary social act instead of an identity display', () => {
  const prompt = singleChatPrompt('你好');

  assert.match(prompt, /当前对话姿态：普通互动/);
  assert.match(prompt, /这只是一次社交问候/);
  assert.match(prompt, /不追加对用户时间、状态、处境或动机的猜测/);
  assert.match(prompt, /不说自己是什么样的人/);
  assert.doesNotMatch(prompt, /本轮自然表达取样|本轮可调用的人物倾向/);
  assert.doesNotMatch(prompt, /现在，作为隐形架构师发言/);
});

test('production prompt turns internal tendencies into a small behavior sample, not a scorecard', () => {
  const prompt = singleChatPrompt('我朋友今天终于拿到 offer 了，我比他还激动。');

  assert.doesNotMatch(prompt, /本轮自然表达取样/);
  assert.doesNotMatch(prompt, /本轮可调用的人物倾向/);
  assert.match(prompt, /先接用户正在分享的这件事本身/);
  assert.doesNotMatch(prompt, /本轮语气参数|(?:回合长度|延展欲|温柔度|抽象度|主动性|刺感|呆感)\s*\d/);
});

test('an explicitly requested analysis may activate at most one relevant disposition for each canonical character', () => {
  const cases = [
    ['INTJ', 'lin-heng:choice-room', /选择仍然保留多少余地/],
    ['ENFP', 'xia-xu:stated-desire', /当事人说出的意愿/],
    ['ISFJ', 'zhou-he:maintenance-load', /持续维护落在谁身上/],
    ['ESTP', 'xu-ye:reality-contact', /现实接触能否带来新信息/],
  ] as const;

  for (const [type, activeDispositionId, expected] of cases) {
    const prompt = singleChatPrompt(
      '这件事我还没决定，你可以帮我分析一下，但不要替我选。',
      '决策',
      type,
      activeDispositionId,
    );

    assert.match(prompt, /本轮可调用的人物倾向/);
    assert.match(prompt, /至多让这一项轻微影响回应/);
    assert.match(prompt, expected);
    assert.match(prompt, /默认只给一个方法或 3—5 个关键步骤/u);
    assert.match(prompt, /最多 3 个步骤、约 300 字/u);
    assert.equal((prompt.match(/本轮可调用的人物倾向/g) ?? []).length, 1);
  }
});

test('an explicit request for detailed analysis removes the compact pacing hint', () => {
  const prompt = singleChatPrompt(
    '请详细展开分析这两个方案，我需要一份完整比较。',
    '决策',
  );

  assert.doesNotMatch(prompt, /最多 3 个步骤、约 300 字/u);
});

test('a dormant disposition stays out of a light first turn even if the director proposes it', () => {
  for (const [type, activeDispositionId] of [
    ['INTJ', 'lin-heng:choice-room'],
    ['ENFP', 'xia-xu:stated-desire'],
    ['ISFJ', 'zhou-he:maintenance-load'],
    ['ESTP', 'xu-ye:reality-contact'],
  ] as const) {
    const prompt = singleChatPrompt(
      '今天天气真好，我下班准备去喝奶茶。',
      '闲聊',
      type,
      activeDispositionId,
    );

    assert.doesNotMatch(prompt, /本轮可调用的人物倾向/);
    assert.doesNotMatch(prompt, /选择仍然保留多少余地|当事人说出的意愿|持续维护落在谁身上|现实接触能否带来新信息/);
  }
});

test('multi-turn familiarity may license a relevant disposition but an explicit listen request still suppresses it', () => {
  const room = createRoom(['INTJ']);
  room.history.push(
    { speaker: 'user', text: '这份工作最近一直在加码。' },
    { speaker: 'INTJ', text: '听起来已经不是偶发了。' },
    { speaker: 'user', text: '我还在观察。' },
    { speaker: 'INTJ', text: '嗯，先不用急着定。' },
    { speaker: 'user', text: '今天又临时改了三次。' },
    { speaker: 'INTJ', text: '这次确实够折腾。' },
  );

  const build = (userMessage: string) => {
    room.history.push({ speaker: 'user', text: userMessage });
    const prompt = buildTurnPrompt({
      room,
      userMessage,
      earlierThisTurn: [],
      plan: {
        scene: '决策',
        userEmotion: '稳定',
        forceSummary: false,
        scores: [],
        speakers: [],
      },
      speaker: {
        type: 'INTJ',
        speechType: '短句',
        finalScore: 60,
        angle: '只补一个会改变判断的变量',
        activeDispositionId: 'lin-heng:choice-room',
      },
    });
    room.history.pop();
    return prompt;
  };

  assert.match(
    build('我现在确实开始考虑离开了。'),
    /本轮可调用的人物倾向｜选择余地/,
  );
  assert.doesNotMatch(
    build('我现在只是想把今天这件事说完，先别分析，也别给建议。'),
    /本轮可调用的人物倾向/,
  );
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

  assert.match(prompt, /当前对话姿态：修复/);
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
