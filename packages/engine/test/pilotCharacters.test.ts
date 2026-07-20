import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyRelationshipEvent,
  buildPilotCharacterCard,
  buildPilotRelationshipContext,
  buildPilotRoomContext,
  createRelationshipBranch,
  findPilotNarrativeViolations,
  findPilotRoomProtocolViolations,
  findPilotRoomTranscriptViolations,
  getPilotCharacter,
} from '../src';

test('pilot characters are canonical people rather than public type labels', () => {
  const linHeng = getPilotCharacter('INTJ');

  assert.equal(linHeng.id, 'lin-heng');
  assert.equal(linHeng.name, '林衡');
  assert.match(linHeng.coreContradiction, /尊重.*自主.*失控/);
  assert.equal(getPilotCharacter('ENTP'), undefined);

  const card = buildPilotCharacterCard('INTJ');
  assert.match(card, /【正典人物：林衡】/);
  assert.match(card, /不可漂移/);
  assert.match(card, /不写假装拥有身体的舞台动作/);
  assert.match(card, /不编造未出现在关系分支中的共同经历/);
  assert.doesNotMatch(card, /你是 INTJ|请扮演 INTJ/);

  assert.throws(() => {
    (linHeng as unknown as { name: string }).name = '被用户改写的名字';
  }, TypeError);
  assert.throws(() => {
    (linHeng.invariants as unknown as string[]).push('迎合当前用户');
  }, TypeError);
  assert.equal(getPilotCharacter('INTJ')?.name, '林衡');
});

test('pilot room context exposes shared canon tensions instead of four isolated personas', () => {
  const context = buildPilotRoomContext('INTJ');

  assert.match(context, /林衡 × 夏栩/);
  assert.match(context, /收窄风险 vs 打开可能/);
  assert.match(context, /默认周禾承担维护/);
  assert.doesNotMatch(context, /INTJ × ENFP/);
});

test('runtime pilot canon stays aligned with the versioned character source document', () => {
  const source = readFileSync(
    new URL('../../../docs/characters/pilot-cast-v0.1.md', import.meta.url),
    'utf8',
  ).replaceAll('**', '');
  const compactSource = source.replace(/[\s|]/g, '');

  for (const type of ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const) {
    const character = getPilotCharacter(type)!;
    assert.ok(source.includes(character.firstImpression), `${character.name} 第一印象发生漂移`);
    assert.ok(source.includes(character.opening), `${character.name} 开场发生漂移`);
    assert.ok(source.includes(character.coreFear), `${character.name} 核心恐惧发生漂移`);
    assert.ok(source.includes(character.coreContradiction), `${character.name} 核心矛盾发生漂移`);
    for (const [field, value] of Object.entries(character.selfStory)) {
      assert.ok(source.includes(value), `${character.name} 自我故事 ${field} 发生漂移`);
    }
    const hexaco = character.traitProfile.find((entry) => entry.startsWith('HEXACO：'))!;
    for (const trait of hexaco.slice('HEXACO：'.length).split('，')) {
      assert.ok(compactSource.includes(trait), `${character.name} HEXACO 轮廓发生漂移：${trait}`);
    }
    for (const value of character.values) {
      assert.ok(source.includes(value), `${character.name} 价值发生漂移：${value}`);
    }
    for (const event of character.formativeEvents) {
      assert.ok(source.includes(event), `${character.name} 塑造性事件发生漂移：${event}`);
    }
    for (const mode of Object.values(character.relationshipModes)) {
      assert.ok(source.includes(mode), `${character.name} 人际方式发生漂移：${mode}`);
    }
    for (const adaptiveTrait of character.adaptiveRange) {
      assert.ok(source.includes(adaptiveTrait), `${character.name} 可变化范围发生漂移：${adaptiveTrait}`);
    }
    for (const invariant of character.invariants) {
      assert.ok(source.includes(invariant), `${character.name} 不可漂移边界发生漂移：${invariant}`);
    }
    for (const boundary of character.safetyBoundaries) {
      assert.ok(source.includes(boundary), `${character.name} 安全边界发生漂移：${boundary}`);
    }
  }
});

test('narrative honesty lint catches embodied stage directions and invented props', () => {
  assert.deepEqual(findPilotNarrativeViolations('（把杯沿转了半圈，看向你）嗯，我听着。'), [
    'embodied_stage_direction',
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('椅子够近吗？你继续说。'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（安静了几秒）嗯，我在听。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('这让我想起上回我打赌输掉的那顿火锅。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('你一直都是自己撞上去才算数的人。'), [
    'unverified_user_history_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('下次我闭嘴，只点头。'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('需要我拉住你的手吗？'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('不是你活该，是我那副表情活该。'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('但你现在还站在这里跟我聊。'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('你坐着，我听。'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('我昨晚回去又翻了一遍你说的那些话。'), [
    'simulated_offline_continuity',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('那句话在我脑子里停了一整个晚上，第二天我还是犯了。'), [
    'simulated_offline_continuity',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('你刚才说这件事的时候，眼睛亮了一下。'), [
    'simulated_sensory_access',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('我猜你以前可能确实会管一下。'), [
    'unverified_user_history_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('给我十分钟，我来认领上线后的维护，每十二小时拉一次表。'), [
    'unsupported_future_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('这个检查我来拉人做，我负责在会前补好文档。'), [
    'unsupported_future_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('上线后三天内，我每天中午会点进去跑一圈；我能到场，当天晚上我补。'), [
    'unsupported_future_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('我可以当那个喊停的人，也愿意担任维护者。'), [
    'unsupported_future_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('我这个月手上已经有三个收尾的活。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('周禾以前帮我收过太多次尾。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('这话我熟，我认识一堆人最后都这么说。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('这句话我一天能听见三遍，在脑子里。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('两边的雷我都踩过。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('我又不是没有过不听劝的时候。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('我确实做过这个。'), [
    'unverified_autobiographical_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('你这是已经想过多少遍了才说出口的。'), [
    'unverified_user_history_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('可以告诉我昨天那些话里哪一部分最需要被听见。'), [
    'unverified_user_history_claim',
  ]);
  assert.deepEqual(findPilotNarrativeViolations(
    '我曾经也走过“一次昂贵的捷径”，所以这次先写检查项。',
    { allowedAutobiographicalAnchors: ['一次昂贵的捷径'] },
  ), []);
  assert.deepEqual(findPilotNarrativeViolations(
    '我曾经也走过“一次昂贵的捷径”。我这个月手上还有三个收尾的活。',
    { allowedAutobiographicalAnchors: ['一次昂贵的捷径'] },
  ), ['unverified_autobiographical_claim']);
  assert.deepEqual(findPilotRoomProtocolViolations('【沉默】\n（但我其实还有一个问题）'), [
    'invalid_silence_payload',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('【沉默】'), []);
  assert.deepEqual(findPilotRoomProtocolViolations('上线后第一个月我负责接反馈。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('我认第二个月的维护，但我有容量接的只有试验阶段。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('前者我现在就能做。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('我可以在上线前帮你们搭起来，也可以陪你们盯前几天。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('那个谁有空最后大概率是我，我不介意接。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('我们半小时能跑一轮测试。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('大家会来找周禾这样的人兜底。', '周禾'), [
    'third_person_self_reference',
  ]);
  const priorRoomSpeech = [
    { name: '许野', text: '维护不是我一个人能扛的。' },
    { name: '林衡', text: '自动停止条件必须先写清楚。' },
  ];
  assert.deepEqual(
    findPilotRoomTranscriptViolations('刚才林衡说“维护不是我一个人能扛的”。', priorRoomSpeech),
    ['misattributed_prior_speech'],
  );
  assert.deepEqual(
    findPilotRoomTranscriptViolations('刚才许野说“维护不是我一个人能扛的”。', priorRoomSpeech),
    [],
  );
  assert.deepEqual(findPilotNarrativeViolations('我先不急着回答。你继续说，我在听。'), []);
  assert.doesNotMatch(getPilotCharacter('ENFP')!.opening, /语速|声音|表情|眼神/);
});

test('private relationship context varies while the canonical character card stays unchanged', () => {
  const stranger = createRelationshipBranch('lin-heng');
  const afterRupture = applyRelationshipEvent(stranger, {
    id: 'rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-8',
    content: '林衡在用户只想被听见时仍然替用户收窄了选项',
  });

  const canonicalBefore = buildPilotCharacterCard('INTJ');
  const strangerContext = buildPilotRelationshipContext(stranger);
  const tenseContext = buildPilotRelationshipContext(afterRupture);
  const canonicalAfter = buildPilotCharacterCard('INTJ');

  assert.equal(canonicalAfter, canonicalBefore);
  assert.match(strangerContext, /关系仍陌生/);
  assert.match(tenseContext, /尚未解决的张力/);
  assert.match(tenseContext, /替用户收窄了选项/);
  assert.notEqual(tenseContext, strangerContext);
});
