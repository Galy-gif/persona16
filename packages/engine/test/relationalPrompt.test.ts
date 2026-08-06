import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDynamicContextPacket,
  buildRelationalSystemPrompt,
  buildSystemBlocks,
  buildTurnPrompt,
  compileSemanticTurnControl,
  createRoom,
  getRelationalCharacterProfile,
  parseRelationalReplyDraft,
  renderDynamicContextPacket,
  renderRelationalCharacterPrompt,
  validateMutter,
} from '../src';
import type { TurnPlan } from '../src';

const plan: TurnPlan = {
  scene: '陪伴',
  userEmotion: '稳定',
  forceSummary: false,
  speakers: [],
  scores: [],
};

test('shared relational system prompt states one precedence chain and keeps user personality unscored', () => {
  const prompt = buildRelationalSystemPrompt();

  assert.match(prompt, /安全、事实、隐私与叙事诚信/u);
  assert.match(prompt, /用户本轮明确请求与边界/u);
  assert.match(prompt, /CPAI-inspired/u);
  assert.match(prompt, /关系线索/u);
  assert.match(prompt, /IPC.*本轮人际动作/u);
  assert.match(prompt, /不得.*用户.*IPC.*CPAI.*依恋/u);
  assert.match(prompt, /mutter/u);
  assert.match(prompt, /reply/u);
});

test('all four canonical characters expose the same ten relational lens facets without rendering scores or MBTI', () => {
  for (const type of ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const) {
    const profile = getRelationalCharacterProfile(type);
    assert.ok(profile);
    assert.equal(Object.keys(profile.culturalRelationalLens).length, 10);
    assert.equal(profile.interpersonalPolicy.transitionRules.length, 8);

    const prompt = renderRelationalCharacterPrompt(type);
    assert.match(prompt, /文化—关系镜头/u);
    assert.match(prompt, /IPC 人际策略/u);
    assert.match(prompt, /过度使用风险/u);
    assert.doesNotMatch(prompt, /INTJ|ENFP|ISFJ|ESTP|Agency\s*[:：]\s*-?\d|Communion\s*[:：]\s*-?\d/u);
  }

  const ipcOnly = renderRelationalCharacterPrompt('INTJ', { includeCulturalLens: false });
  assert.match(ipcOnly, /IPC 人际策略/u);
  assert.doesNotMatch(ipcOnly, /文化—关系镜头/u);
});

test('dynamic context packet carries coverage, sourced evidence, an interpersonal intent, and unknown metadata explicitly', () => {
  const room = createRoom(['INTJ']);
  room.history.push(
    { id: 'message-user-1', createdAt: '2026-08-07T00:00:00.000Z', turnId: 'turn-1', speaker: 'user', text: '我最近总是先自己扛着。' },
    { id: 'message-agent-1', createdAt: '2026-08-07T00:01:00.000Z', turnId: 'turn-1', speaker: 'INTJ', text: '先不用急着给它下结论。' },
    { id: 'message-user-2', speaker: 'user', text: '今天先别分析，我只想说一会儿。' },
  );
  room.agents[0]!.relationship.promptContext = {
    memoryEnabled: true,
    climate: 'steady',
    evidence: [
      { id: 'boundary-1', kind: 'boundary', content: '用户要求倾听时不提供建议', traceability: 'traceable', sourceTurnId: 'turn-1', sourceMessageId: 'message-user-1', recordedAt: '2026-08-07T00:00:00.000Z' },
      { id: 'preference-1', kind: 'preference', content: '用户喜欢先看到真实例子', traceability: 'traceable', sourceTurnId: 'turn-2' },
      { id: 'context-1', kind: 'shared_context', content: '讨论过工作压力', traceability: 'traceable', sourceTurnId: 'turn-3' },
      { id: 'context-2', kind: 'shared_context', content: '讨论过交接问题', traceability: 'traceable', sourceTurnId: 'turn-4' },
    ],
  };
  const userMessage = '今天先别分析，我只想说一会儿。';
  const semanticControl = compileSemanticTurnControl({
    userMessage,
    relationshipContext: room.agents[0]!.relationship.promptContext,
    relationshipFocus: 'support',
  });

  const packet = buildDynamicContextPacket({
    generatedAt: '2026-08-07T00:02:00.000Z',
    room,
    plan,
    speaker: 'INTJ',
    userMessage,
    semanticControl,
    relationshipFocus: 'support',
  });

  assert.equal(packet.coverage.fromMessageId, 'message-user-1');
  assert.equal(packet.coverage.fromTurnId, 'turn-1');
  assert.equal(packet.coverage.throughMessageId, 'message-user-2');
  assert.equal(packet.coverage.throughTurnId, 'unknown');
  assert.equal(packet.coverage.throughRecordedAt, 'unknown');
  assert.ok(packet.relationshipEvidence.length <= 3);
  assert.equal(packet.relationshipEvidence[0]?.sourceMessageId, 'message-user-1');
  assert.equal(packet.interpersonalIntent.primaryAct, 'listen');
  assert.equal(packet.interpersonalIntent.target.agency < 0, true);
  assert.equal(packet.mutterPolicy, 'default');

  const rendered = renderDynamicContextPacket(packet);
  assert.match(rendered, /覆盖范围/u);
  assert.match(rendered, /未知/u);
  assert.match(rendered, /来源消息 message-user-1/u);
  assert.match(rendered, /最近原始对话/u);
  assert.match(rendered, /关系状态/u);
  assert.doesNotMatch(rendered, /Agency\s*[:：]\s*-?\d|Communion\s*[:：]\s*-?\d/u);
});

test('relational reply parser separates a public mutter and drops unsafe or duplicate mutters without losing the reply', () => {
  const parsed = parseRelationalReplyDraft(
    '{"mutter":"这句话像是压了很久。","reply":"好，今天不分析。你慢慢说。"}',
  );
  assert.deepEqual(parsed, {
    mutter: '这句话像是压了很久。',
    reply: '好，今天不分析。你慢慢说。',
    structured: true,
  });
  assert.equal(validateMutter(parsed.mutter!, parsed.reply).ok, true);

  const leaked = parseRelationalReplyDraft(
    '{"mutter":"IPC分数说明你其实是焦虑型人格。","reply":"我们先只看眼前这件事。"}',
  );
  assert.equal(validateMutter(leaked.mutter!, leaked.reply).ok, false);

  const duplicate = parseRelationalReplyDraft(
    '{"mutter":"今天不分析。","reply":"今天不分析。你慢慢说。"}',
  );
  assert.equal(validateMutter(duplicate.mutter!, duplicate.reply).ok, false);

  assert.deepEqual(parseRelationalReplyDraft('我在听。'), {
    mutter: null,
    reply: '我在听。',
    structured: false,
  });
});

test('dynamic context never exposes disabled relationship memory and caps one-turn IPC movement', () => {
  const room = createRoom(['ESTP']);
  const userMessage = '今天不要建议，我只想说一会儿。';
  room.history.push({
    id: 'disabled-memory-current',
    createdAt: '2026-08-07T00:00:00.000Z',
    turnId: 'disabled-memory-turn',
    speaker: 'user',
    text: userMessage,
  });
  room.agents[0]!.relationship.promptContext = {
    memoryEnabled: false,
    evidence: [{
      id: 'must-not-leak',
      kind: 'preference',
      content: '这条关闭后的记忆绝不能进入动态包',
      traceability: 'traceable',
      sourceTurnId: 'old-turn',
    }],
  };
  const semanticControl = compileSemanticTurnControl({ userMessage, relationshipFocus: 'support' });
  const packet = buildDynamicContextPacket({
    room,
    plan,
    speaker: 'ESTP',
    userMessage,
    semanticControl,
    relationshipFocus: 'support',
  });

  assert.equal(packet.relationshipState.memoryEnabled, false);
  assert.deepEqual(packet.relationshipEvidence, []);
  assert.deepEqual(packet.activeBoundaries, []);
  assert.doesNotMatch(renderDynamicContextPacket(packet), /这条关闭后的记忆/u);
  assert.ok(packet.interpersonalIntent.target.agency >= -0.100001);
});

test('relational prompt variant composes the shared system, one character prompt, and one dynamic packet without legacy identity labels', () => {
  const system = buildSystemBlocks('INTJ', { variant: 'relational' })
    .map((block) => block.text)
    .join('\n');
  assert.match(system, /关系型人物共同系统规则/u);
  assert.match(system, /正典人物 Prompt：林衡/u);
  assert.match(system, /文化—关系镜头/u);
  assert.doesNotMatch(system, /内部代号 INTJ|作为 INTJ/u);
  assert.doesNotMatch(system, /直接输出你要说的话/u);

  const room = createRoom(['INTJ']);
  const userMessage = '今天先别分析，我只想说一会儿。';
  room.history.push({ id: 'message-current', createdAt: '2026-08-07T00:02:00.000Z', speaker: 'user', text: userMessage });
  const semanticControl = compileSemanticTurnControl({ userMessage, relationshipFocus: 'support' });
  const prompt = buildTurnPrompt({
    room,
    userMessage,
    earlierThisTurn: [],
    plan,
    speaker: {
      type: 'INTJ',
      speechType: '短句',
      finalScore: 60,
      angle: '',
    },
    semanticControl,
    promptVariant: 'relational',
    generatedAt: '2026-08-07T00:02:00.000Z',
  });

  assert.match(prompt, /动态上下文包/u);
  assert.match(prompt, /本轮人际意图/u);
  assert.match(prompt, /碎碎念策略/u);
  assert.match(prompt, /只输出.*JSON/u);
  assert.doesNotMatch(prompt, /【关系记忆】/u);
});

test('a later relational room speaker receives earlier public replies instead of answering in isolation', () => {
  const room = createRoom(['INTJ', 'ENFP', 'ISFJ'], '听见反方');
  room.history.push(
    { id: 'room-user', createdAt: '2026-08-07T00:00:00.000Z', turnId: 'room-turn', speaker: 'user', text: '没人认领维护，也没有停止条件。你们怎么看？' },
    { id: 'room-linheng', createdAt: '2026-08-07T00:00:10.000Z', turnId: 'room-turn', speaker: 'INTJ', text: '先别把上线当默认，维护接口还是空的。' },
  );
  const userMessage = '没人认领维护，也没有停止条件。你们怎么看？';
  const semanticControl = compileSemanticTurnControl({ userMessage, relationshipFocus: 'room' });
  const prompt = buildTurnPrompt({
    room,
    userMessage,
    earlierThisTurn: [{ type: 'INTJ', text: '先别把上线当默认，维护接口还是空的。' }],
    plan: { ...plan, scene: '决策' },
    speaker: { type: 'ENFP', speechType: '短句', finalScore: 60, angle: '只补新增价值' },
    semanticControl,
    promptVariant: 'relational',
    generatedAt: '2026-08-07T00:00:20.000Z',
  });

  assert.match(prompt, /在场人数：3/u);
  assert.match(prompt, /INTJ：先别把上线当默认，维护接口还是空的/u);
  const compiled = `${buildSystemBlocks('ENFP', { variant: 'relational' }).map((block) => block.text).join('\n')}\n${prompt}`;
  assert.match(compiled, /不重复前一位|不要重复/u);
});
