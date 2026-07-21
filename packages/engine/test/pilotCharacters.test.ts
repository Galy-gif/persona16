import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyRelationshipEvent,
  PILOT_CAST_VERSION,
  buildPilotCharacterCard,
  buildPilotCharacterCore,
  buildPilotCharacterContext,
  buildPilotRelationshipContext,
  buildPilotRoomContext,
  buildPilotSituationLens,
  createRelationshipBranch,
  findPilotNarrativeViolations,
  findPilotRoomProtocolViolations,
  findPilotRoomTranscriptViolations,
  getPilotCharacter,
  renderPilotTurnResponseContract,
} from '../src';

function characterSection(source: string, characterName: string): string {
  const heading = new RegExp(`^## \\d+\\. ${characterName}.*$`, 'm').exec(source);
  assert.ok(heading?.index !== undefined, `正典文档缺少${characterName}章节`);
  const fromHeading = source.slice(heading.index + heading[0].length);
  const nextHeading = fromHeading.search(/^## \d+\./m);
  return nextHeading === -1 ? fromHeading : fromHeading.slice(0, nextHeading);
}

test('pilot characters are canonical people rather than public type labels', () => {
  const linHeng = getPilotCharacter('INTJ');

  assert.equal(linHeng.id, 'lin-heng');
  assert.equal(linHeng.name, '林衡');
  assert.match(linHeng.coreContradiction, /尊重.*自主.*失控/);
  assert.equal(getPilotCharacter('ENTP'), undefined);

  const card = buildPilotCharacterCard('INTJ');
  assert.equal(PILOT_CAST_VERSION, '0.3');
  assert.match(card, /【正典人物：林衡｜正典版本：0\.3】/);
  assert.match(card, /不可漂移/);
  assert.match(card, /不能声称真实看见、听见或触碰用户/);
  assert.match(card, /“（小声）”.*文字语气标记/);
  assert.match(card, /不编造未出现在关系分支中的共同经历/);
  assert.match(card, /绝不能当作亲身往事讲给用户/);
  assert.match(card, /不要求每句话都用口癖、俏皮话或显眼台词证明人设/);
  assert.doesNotMatch(card, /你是 INTJ|请扮演 INTJ/);

  assert.throws(() => {
    (linHeng as unknown as { name: string }).name = '被用户改写的名字';
  }, TypeError);
  assert.throws(() => {
    (linHeng.invariants as unknown as string[]).push('迎合当前用户');
  }, TypeError);
  assert.equal(getPilotCharacter('INTJ')?.name, '林衡');

  const xiaXu = getPilotCharacter('ENFP')!;
  assert.equal(
    xiaXu.firstImpression,
    '她总觉得，做不到和不想要不是一回事。可当别人真的说“我不要了”，她又没那么容易相信。',
  );
  assert.equal(xiaXu.opening, undefined);
  assert.match(xiaXu.coreContradiction, /保护.*真实意愿.*覆盖.*意愿/);
  assert.ok(xiaXu.safetyBoundaries.includes('用户明确说不想继续时停止追问和重开可能'));
  const xiaCard = buildPilotCharacterCard('ENFP');
  assert.match(xiaCard, /不把人物核心复述成固定问题或二选一/);
  assert.doesNotMatch(xiaCard, /这两年发生什么了|自然开口示例/);
});

test('generation context keeps the stable core but activates only the current lens', () => {
  const core = buildPilotCharacterCore('INTJ');
  const ordinaryLens = buildPilotSituationLens('INTJ', 'ordinary');
  const repairLens = buildPilotSituationLens('INTJ', 'repair');
  const ordinary = buildPilotCharacterContext('INTJ', { focus: 'ordinary' });
  const repair = buildPilotCharacterContext('INTJ', { focus: 'repair' });
  const support = buildPilotCharacterContext('INTJ', { focus: 'support' });

  assert.match(core, /正典人物核心：林衡/);
  assert.doesNotMatch(core, /当前情境镜头/);
  assert.match(ordinaryLens, /当前情境镜头：普通互动/);
  assert.doesNotMatch(ordinaryLens, /正典人物核心：林衡/);
  assert.match(repairLens, /当前情境镜头：修复/);
  assert.equal(ordinary, `${core}\n\n${ordinaryLens}`);

  assert.match(ordinary, /正典人物核心：林衡/);
  assert.match(ordinary, /不可漂移/);
  assert.match(ordinary, /普通互动/);
  assert.doesNotMatch(ordinary, /幕后形成依据/);
  assert.doesNotMatch(ordinary, /无人负责的接口/);
  assert.doesNotMatch(ordinary, /自保代价/);

  assert.match(repair, /修复镜头/);
  assert.match(repair, /替对方做了哪一步决定/);
  assert.match(repair, /自保代价/);
  assert.doesNotMatch(repair, /幕后形成依据/);
  assert.match(support, /由本轮关系上下文决定/);
  assert.doesNotMatch(support, /陌生关系方式：/);
});

test('turn response contract renders trusted dynamic state as a separate prompt section', () => {
  const rendered = renderPilotTurnResponseContract({
    userCommitments: ['用户已经明确结束这个项目'],
    requiredMoves: ['先接受项目已经结束', '只处理“没能力”这层自我判决'],
    allowedMoves: ['最多提出一个不施压的问题'],
    forbiddenMoves: ['重开项目可能性', '审问过去投入'],
  });

  assert.match(rendered, /本轮回应合同/);
  assert.match(rendered, /已经确认的用户状态：\n- 用户已经明确结束这个项目/);
  assert.match(rendered, /必须完成：\n- 先接受项目已经结束/);
  assert.match(rendered, /允许动作：\n- 最多提出一个不施压的问题/);
  assert.match(rendered, /禁止动作：\n- 重开项目可能性/);
  assert.doesNotMatch(rendered, /正典人物核心/);
});

test('pilot room context exposes shared canon tensions instead of four isolated personas', () => {
  const context = buildPilotRoomContext('INTJ');

  assert.match(context, /林衡 × 夏栩/);
  assert.match(context, /风险是否足以结束 vs 结论是否下得太早/);
  assert.match(context, /默认周禾承担维护/);
  assert.doesNotMatch(context, /INTJ × ENFP/);
});

test('runtime pilot canon stays aligned with the versioned character source document', () => {
  const v01Source = readFileSync(
    new URL('../../../docs/characters/pilot-cast-v0.1.md', import.meta.url),
    'utf8',
  ).replaceAll('**', '');
  const v02Source = readFileSync(
    new URL('../../../docs/characters/pilot-cast-v0.2.md', import.meta.url),
    'utf8',
  ).replaceAll('**', '');
  const v03Source = readFileSync(
    new URL('../../../docs/characters/pilot-cast-v0.3.md', import.meta.url),
    'utf8',
  ).replaceAll('**', '');

  for (const type of ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const) {
    const character = getPilotCharacter(type)!;
    const source = characterSection(type === 'ENFP' ? v02Source : v01Source, character.name);
    const overlay = type === 'ENFP' ? characterSection(v03Source, character.name) : '';
    const compactSource = source.replace(/[\s|]/g, '');
    assert.ok(source.includes(character.firstImpression), `${character.name} 第一印象发生漂移`);
    if (character.opening) {
      assert.ok(source.includes(character.opening), `${character.name} 开场发生漂移`);
    }
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
    for (const [name, mode] of Object.entries(character.relationshipModes)) {
      const fieldSource = type === 'ENFP' && name === 'stranger' ? overlay : source;
      assert.ok(fieldSource.includes(mode), `${character.name} 人际方式发生漂移：${mode}`);
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

  const roomContext = buildPilotRoomContext('ENFP');
  for (const phrase of ['风险是否足以结束 vs 结论是否下得太早', '真实意愿 vs 现实承受', '再确认意愿 vs 立即接触现实']) {
    assert.ok(v02Source.includes(phrase), `v0.2 文档缺少房间关系：${phrase}`);
    assert.ok(roomContext.includes(phrase), `v0.2 运行时缺少房间关系：${phrase}`);
  }
  const xiaXu = getPilotCharacter('ENFP')!;
  const xiaXuV03Overlay = characterSection(v03Source, xiaXu.name);
  assert.ok(
    xiaXuV03Overlay.includes(`陌生：${xiaXu.relationshipModes.stranger}`),
    '夏栩 v0.3 陌生关系覆盖未写入 v0.3 文档',
  );
  assert.doesNotMatch(xiaXuV03Overlay, /只确认一次“做不到还是不想要”/);
  assert.match(v03Source, /不提供默认开场金标准/);
});

test('narrative honesty lint catches embodied stage directions and invented props', () => {
  assert.deepEqual(findPilotNarrativeViolations('（把杯沿转了半圈，看向你）嗯，我听着。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('椅子够近吗？你继续说。'), [
    'embodied_prop_or_action',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（安静了几秒）嗯，我在听。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（沉默了几秒）你继续。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（顿了两秒）我想问一句。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（小声）我就问一句。'), []);
  assert.deepEqual(findPilotNarrativeViolations('（认真）你继续。'), []);
  assert.deepEqual(findPilotNarrativeViolations('哇，真的啊？(小声) 你帮他庆祝了没？'), []);
  assert.deepEqual(findPilotNarrativeViolations('行啊，我坐这儿也不费电。你说。'), []);
  assert.deepEqual(findPilotNarrativeViolations('手机是什么时候丢的？'), []);
  assert.deepEqual(findPilotNarrativeViolations('我可以做个清单，现在发给你。'), []);
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
  assert.deepEqual(findPilotNarrativeViolations('但你现在还站在这里跟我聊。'), []);
  assert.deepEqual(findPilotNarrativeViolations('你坐着，我听。'), []);
  assert.deepEqual(findPilotNarrativeViolations('我坐到你身边，递给你一杯水。'), [
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
  assert.deepEqual(findPilotRoomProtocolViolations('前者我现在就能做。'), []);
  assert.deepEqual(findPilotRoomProtocolViolations('我可以做个清单，现在发给你。'), []);
  assert.deepEqual(findPilotRoomProtocolViolations('我可以帮你们搭个检查表，现在发出来。'), []);
  assert.deepEqual(findPilotRoomProtocolViolations('我可以在上线前帮你们搭起来，也可以陪你们盯前几天。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('那个谁有空最后大概率是我，我不介意接维护。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('我们半小时能跑一轮测试。'), [
    'unavailable_role_commitment',
  ]);
  assert.deepEqual(findPilotRoomProtocolViolations('目前有没有人默认我会接手维护？'), [
    'persona_real_world_role_assumption',
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
  assert.doesNotMatch(getPilotCharacter('ENFP')!.opening ?? '', /语速|声音|表情|眼神/);
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
  assert.match(tenseContext, /关系事件 rupture-1/);
  assert.match(tenseContext, /对话轮次 turn-8/);
  assert.notEqual(tenseContext, strangerContext);
});
