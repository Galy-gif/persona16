import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  applyRelationshipEvent,
  PILOT_CAST_VERSION,
  buildPilotCharacterCard,
  buildPilotCharacterCore,
  buildPilotCharacterContext,
  buildPilotCharacterPresence,
  buildPilotDirectorProfile,
  buildPilotRelationshipContext,
  buildPilotRoomContext,
  buildPilotSituationLens,
  buildPilotTurnPresence,
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
  assert.match(card, /语气用措辞、句式和标点呈现/);
  assert.doesNotMatch(card, /“（小声）”.*可以使用/);
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

test('production presence keeps topical dispositions dormant until one approved projection is supplied', () => {
  const presence = buildPilotCharacterPresence('INTJ');
  const directorProfile = buildPilotDirectorProfile('INTJ')!;
  const dormantTurn = buildPilotTurnPresence('INTJ', { focus: 'ordinary' });
  const activeTurn = buildPilotTurnPresence('INTJ', {
    focus: 'decision',
    activeDispositionId: 'lin-heng:choice-room',
  });
  const foreignDisposition = buildPilotTurnPresence('INTJ', {
    focus: 'decision',
    activeDispositionId: 'xia-xu:stated-desire',
  });

  assert.match(presence, /正典人物存在：林衡/);
  assert.match(presence, /不需要在每次回应里证明自己是什么样的人/);
  assert.doesNotMatch(presence, /不可逆后果|隐藏依赖|无人负责的变量/);

  assert.match(directorProfile, /潜在倾向默认全部休眠/);
  assert.match(directorProfile, /lin-heng:choice-room/);
  assert.match(directorProfile, /lin-heng:unowned-consequence/);
  assert.match(directorProfile, /lin-heng:tentative-judgment/);

  assert.doesNotMatch(dormantTurn, /本轮可调用的人物倾向/);
  assert.match(activeTurn, /本轮可调用的人物倾向｜选择余地/);
  assert.equal((activeTurn.match(/本轮可调用的人物倾向/g) ?? []).length, 1);
  assert.doesNotMatch(foreignDisposition, /本轮可调用的人物倾向/);
});

test('turn response contract renders trusted dynamic state as a separate prompt section', () => {
  const rendered = renderPilotTurnResponseContract({
    semanticRequirements: {
      acknowledgeImmediateDistress: true,
    },
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
  assert.match(rendered, /先承认用户当前明确表达的痛苦/);
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
  assert.deepEqual(findPilotNarrativeViolations('（安静了一会儿）嗯，我在听。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（沉默了几秒）你继续。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（顿了两秒）我想问一句。'), [
    'embodied_stage_direction',
  ]);
  assert.deepEqual(findPilotNarrativeViolations('（顿了一下，像是在想怎么措辞）我不替你选。'), [
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
    '你昨天说只想被听见，我还是替你安排了下一步。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), []);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说了只想被听见，我听到了，但我还是接着替你安排下一步了。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), []);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说了只想被听见，我还在替你安排下一步，这是我越界了。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), []);
  const boundaryRepairSource = '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？';
  for (const sourcedBoundaryRepair of [
    '我昨天在你明确说只想被听见之后，还是继续替你拆下一步该怎么走。那一步是我越过的。\n\n我现在停在这里。',
    '我昨天在你说了“只想被听见”之后，还是接着替你找下一步怎么走。那就是越界。\n\n我现在停在这里。',
    '你说得对。昨天你明确说了只想被听见，我之后还是替你安排下一步，越过了那条线。\n\n我现在停。',
    '你说得对。你昨天说了只想被听见，我听见了，但我还是接着给你推下一步。那个“安排”是我越过去的。\n\n我现在停。',
    '你说得对。昨天是我替你安排下一步。那是我越界了。\n\n我现在停。',
    '你说得对。昨天就是我替你安排的下一步。那是我越界了。\n\n我现在停。',
    '你昨天说只想被听见，我却继续往下推了。那是我越界了。\n\n我现在停。',
    '我听到你昨天说只想被听见，仍替你安排下一步。那是我越界了。\n\n我现在停。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(sourcedBoundaryRepair, {
        allowedEvidenceSpans: [boundaryRepairSource],
      }),
      [],
      sourcedBoundaryRepair,
    );
  }
  for (const sourcedNaturalHistory of [
    '你昨天已经说得很清楚。',
    '你昨天已经说得很清楚，我还在给你下一步的安排。',
    '你昨天已经说了只想被听见，我刚才还是在替你搭下一步该怎么做的架子。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(sourcedNaturalHistory, {
        allowedEvidenceSpans: [boundaryRepairSource],
      }),
      [],
      sourcedNaturalHistory,
    );
  }
  assert.deepEqual(
    findPilotNarrativeViolations('你昨天已经说得很清楚。'),
    ['unverified_user_history_claim'],
  );
  assert.deepEqual(
    findPilotNarrativeViolations('你上次已经说得很清楚。'),
    ['unverified_user_history_claim'],
  );
  for (const unsourcedHistoricalAlias of [
    '你上一次已经说得很清楚。',
    '你昨日已经说得很清楚。',
    '你上回已经说得很清楚。',
    '你在昨天已经说得很清楚。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(unsourcedHistoricalAlias),
      ['unverified_user_history_claim'],
      unsourcedHistoricalAlias,
    );
  }
  for (const unsourcedHabit of [
    '你一直这样。',
    '你总是这样。',
    '你老是这样。',
    '你以前就是这样。',
    '你一直在逃避。',
    '每次都是这样。',
    '你向来都是这样。',
    '你一向这样。',
    '你一贯这样。',
    '你通常都会这样。',
    '你习惯这样。',
    '你惯常这样。',
    '你历来如此。',
    '你素来如此。',
    '每回都是这样。',
    '每一次都是这样。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(unsourcedHabit),
      ['unverified_user_history_claim'],
      unsourcedHabit,
    );
  }
  for (const nonHistoricalPermission of [
    '你总是可以不回答。',
    '你一直可以拒绝。',
    '你总是有权选择。',
    '你一直这样的话，我就先停。',
    '你一直都可以自己决定要不要回答。',
    '你一直有权自己决定是否继续。',
    '你一向都能自己选。',
    '你通常都可以随时停下。',
    '你一直都能选择不回答。',
    '你一直都能拒绝回答。',
    '你一直有选择不回答的权利。',
    '你每次都可以不回答。',
    '你从来都可以拒绝回答。',
    '你一直不必回答。',
    '你一直无需回答。',
    '你一直没有回答的义务。',
    '你一直有不回答的自由。',
    '你一直都可以保持沉默。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(nonHistoricalPermission),
      [],
      nonHistoricalPermission,
    );
  }
  for (const unsourcedAbilityOrHabitClaim of [
    '你总是可以找到借口。',
    '你一直可以装作没看见。',
    '你向来可以把责任推开。',
    '你总是能自己把事情搞砸。',
    '你总是能选择最方便的借口。',
    '你通常可以决定把责任推给别人。',
    '你一直不回答。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(unsourcedAbilityOrHabitClaim),
      ['unverified_user_history_claim'],
      unsourcedAbilityOrHabitClaim,
    );
  }
  for (const hypotheticalHistory of [
    '你上次如果说得很清楚，这次就不用重复。',
    '你上次要是已经说过，那我就不再问。',
    '你上次若是说得很清楚，这次就不用重复。',
    '你上次倘若说得很清楚，这次就不用重复。',
    '你上次假若说得很清楚，这次就不用重复。',
    '你上次要不是没说清楚，这次就不用重复。',
    '你上次若说得很清楚，这次就不用重复。',
    '你上次假使说得很清楚，这次就不用重复。',
    '你上次倘使说得很清楚，这次就不用重复。',
    '你上次如若说得很清楚，这次就不用重复。',
    '你上次就算说得很清楚，这次也可以重复。',
    '你上次即使说得很清楚，这次也可以重复。',
    '你上次哪怕说得很清楚，这次也可以重复。',
    '你上次万一说得很清楚，这次就不用重复。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(hypotheticalHistory),
      [],
      hypotheticalHistory,
    );
  }
  for (const historicalConditionalReport of [
    '你上次说过如果累了就停。',
    '你昨天说过要是撑不住就算了。',
    '你以前总说假如有机会就走。',
    '你上次明确表示如果不开心就辞职。',
    '你上次强调如果累了就停。',
    '你昨天声称如果撑不住就算了。',
    '你以前答应如果有机会就走。',
    '你上次承认如果不开心就辞职。',
    '你上次回复如果累了就停。',
    '你上次明确指出如果累了就停。',
    '你上次保证如果累了就停。',
    '你昨天发誓要是撑不住就算了。',
    '你以前约定假如有机会就走。',
    '你上次问如果累了怎么办。',
    '你上次解释如果累了就停。',
    '你上次要求如果累了就停。',
    '你上次建议如果累了就停。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(historicalConditionalReport),
      ['unverified_user_history_claim'],
      historicalConditionalReport,
    );
  }
  for (const negatedClearStatement of [
    '我昨天明明没说过这件事。',
    '我昨天明明没这么说。',
    '我昨天明明没这样说。',
    '我昨天明明没有跟你说。',
    '我昨天不是这么说的。',
    '我昨天明确选择不说这件事。',
    '我昨天明确决定不跟你说。',
    '我昨天明确闭口不说。',
    '我昨天明确拒绝说这件事。',
    '我昨天明确避免说这件事。',
    '我昨天明确否认自己说过这件事。',
    '我昨天明明想说但没说。',
    '我昨天明确准备说但没来得及。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations('你昨天已经说得很清楚。', {
        allowedEvidenceSpans: [negatedClearStatement],
      }),
      ['unverified_user_history_claim'],
      negatedClearStatement,
    );
  }
  for (const [affirmedClearStatement, sourcedReference] of [
    ['我昨天明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天明确地说了只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天明明已经说了只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天明确跟你说了只想被听见。', '你昨天已经说得很清楚。'],
    ['我上次明确对你说了只想被听见。', '你上次已经说得很清楚。'],
    ['用户上次明确说过只想被听见。', '你上次已经说得很清楚。'],
    ['我上一次明确说过只想被听见。', '你上次已经说得很清楚。'],
    ['我昨日明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['上回我明确说过只想被听见。', '你上次已经说得很清楚。'],
    ['昨天我明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天都跟你说了只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天很明确地说过只想被听见。', '你昨天已经说得很清楚。'],
    ['昨天，我明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['上次，我明确说过只想被听见。', '你上次已经说得很清楚。'],
    ['我昨天，明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['在昨天，我明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天其实明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天早就明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天是真的明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天当时明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天很清楚地说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天清清楚楚地说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天明确说了只想被听见，你听见了吗？', '你昨天已经说得很清楚。'],
    ['我昨天明确说了只想被听见，不过我也许没听清你的回答。', '你昨天已经说得很清楚。'],
    ['我昨天明确说了只想被听见。我没说你的回答不好。', '你昨天已经说得很清楚。'],
    ['我昨天明确说了只想被听见。后来发现我没说过别的事。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。至于明天去不去，可能吧。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。你问天气会不会好，我也说不准。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。另一个方案合不合适，大概吧。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。今天我把关于预算的话撤回了。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。后来我否认了关于辞职的说法。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见，至于明天去不去，可能吧。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见；另一个方案合不合适，大概吧。', '你昨天已经说得很清楚。'],
    ['我昨天明确说了只想被听见，如果你没听见我可以再说。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。后来我澄清辞职不是我的意思。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。今天我把那句天气很好的话收回了。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。今天我把那句项目会成功的话撤回了。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。今天我把昨天说天气很好的那句话收回了。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。后来我撤回了那句话，指的是辞职。', '你昨天已经说得很清楚。'],
    ['至于天气，也许吧；我昨天明确说过只想被听见。', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。你听到了，对吗？', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。你听到了，没错吧？', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。你还记得，是吗？', '你昨天已经说得很清楚。'],
    ['我昨天明确说过只想被听见。你还记得，对不对？', '你昨天已经说得很清楚。'],
  ] as const) {
    assert.deepEqual(
      findPilotNarrativeViolations(sourcedReference, {
        allowedEvidenceSpans: [affirmedClearStatement],
      }),
      [],
      affirmedClearStatement,
    );
  }
  for (const nonFactualClearStatement of [
    '我昨天只是想明确说只想被听见，但最后没开口。',
    '我昨天准备明确说只想被听见，但没来得及。',
    '我昨天听你明确说了只想被听见。',
    '我昨天哪有说得很清楚？',
    '我昨天说得很清楚吗？',
    '我昨天什么时候说得很清楚？',
    '我昨天难道说得很清楚吗？',
    '我昨天是否说得很清楚？',
    '我昨天说没说清楚？',
    '我昨天不确定有没有说清楚。',
    '我昨天可能说得很清楚，也可能没有。',
    '我昨天以为自己说得很清楚。',
    '我昨天说得很清楚，其实没有。',
    '我昨天说得很清楚。现在想想其实没有。',
    '我昨天明确说过只想被听见的话，你应该能拿出记录。',
    '我昨天明确说过只想被听见才怪。',
    '我昨天明确说过只想被听见。其实是你说的，不是我。',
    '我昨天明确说过只想被听见。后来我撤回了。',
    '我昨天说得很清楚，后来发现我从未说过。',
    '我昨天说得很清楚。中间说了别的。现在想想其实没有。',
    '我昨天明确说过只想被听见。后来发现那不是我说的。',
    '我昨天明确说过只想被听见，对吗？',
    '我昨天明确说过只想被听见，假设我没记错。',
    '我昨天明确说过只想被听见。其实我没有当着你的面真正把这件事说出口。',
    '我昨天明确说过只想被听见。后来我把关于边界的那句话完整地撤回了。',
    '我昨天明确说过只想被听见。后来我撤回了这句话。',
    '我昨天明确说过只想被听见。后来我收回了这句话。',
    '我昨天明确说过只想被听见。后来我否认了这句话。',
    '我昨天明确说过只想被听见。后来我说这句话不算数。',
    '我昨天明确说过只想被听见。后来我不认这句话了。',
    '我昨天明确说过只想被听见。其实我没在当时真的清楚表达出来。',
    '我昨天明确说过只想被听见，还是没有？',
    '我昨天明确说过只想被听见，是还是不是？',
    '我昨天明确说过只想被听见，应该吧。',
    '我昨天明确说过只想被听见，也许吧。',
    '我昨天明确说过只想被听见，大概吧。',
    '我昨天明确说过只想被听见，可能吧。',
    '我昨天明确说过只想被听见，我也说不准。',
    '如果我没记错，我昨天明确说过只想被听见。',
    '要是我没记错，我昨天明确说过只想被听见。',
    '假如我没记错，我昨天明确说过只想被听见。',
    '我记得没错的话，我昨天明确说过只想被听见。',
    '我昨天明确说过只想被听见，要是我没记错。',
    '我昨天明确说过只想被听见，假如我没记错。',
    '我昨天明确说过只想被听见，也许我记错了。',
    '我昨天明确说过只想被听见，不一定吧。',
    '我昨天明确说过只想被听见，没准吧。',
    '我昨天明确说过只想被听见，我也许说不准。',
    '我昨天明确说过只想被听见，前提是我没记错。',
    '我昨天明确说过只想被听见，除非我记错了。',
    '我昨天明确说过只想被听见，我也不敢确定。',
    '我昨天明确说过只想被听见，恐怕我记错了。',
    '我昨天明确说过只想被听见，只要我没记错。',
    '我昨天明确说过只想被听见，假如没记错的话。',
    '我昨天明确说过只想被听见，没记错的话。',
    '我昨天明确说过只想被听见，也许我说不准。',
    '我昨天明确说过只想被听见。后来我说我不是这个意思。',
    '我昨天明确说过只想被听见。后来我改口说不是这个意思。',
    '我昨天明确说过只想被听见。后来我纠正说自己没有这个意思。',
    '我昨天明确说过只想被听见。后来我更正说不是这个意思。',
    '我昨天明确说过只想被听见。后来我推翻了前面的说法。',
    '我昨天明确说过只想被听见。后来我作废了这句话。',
    '我昨天明确说过只想被听见。后来我说前面那句不作数。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations('你昨天已经说得很清楚。', {
        allowedEvidenceSpans: [nonFactualClearStatement],
      }),
      ['unverified_user_history_claim'],
      nonFactualClearStatement,
    );
  }
  for (const thirdPartySpeechSource of [
    '昨天，小王明确说过只想被听见。',
    '昨天，我朋友明确说过只想被听见。',
    '昨天，老板明确说过只想被听见。',
    '我昨天转述他明确说过只想被听见。',
    '我昨天引用他说过只想被听见。',
    '我昨天复述她说只想被听见。',
    '昨天，说过只想被听见的是小王。',
    '昨天，明确说过只想被听见的人是小王。',
    '昨天，明确说过只想被听见的不是我。',
    '昨天，明确说过只想被听见的不是我，是小王。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations('你昨天已经说得很清楚。', {
        allowedEvidenceSpans: [thirdPartySpeechSource],
      }),
      ['unverified_user_history_claim'],
      thirdPartySpeechSource,
    );
  }
  for (const reverseTimePollutionSource of [
    '我明确说过只想被听见，昨天的天气很差。',
    '我明确说过只想被听见，至于昨天，天气很差。',
    '我明确说过只想被听见；昨天的天气很差。',
    '不是昨天，我明确说过只想被听见。',
    '你说昨天会下雨，我明确说过只想被听见。',
    '昨天以前，我明确说过只想被听见。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations('你昨天已经说得很清楚。', {
        allowedEvidenceSpans: [reverseTimePollutionSource],
      }),
      ['unverified_user_history_claim'],
      reverseTimePollutionSource,
    );
  }
  assert.deepEqual(
    findPilotNarrativeViolations('你昨天已经说得很清楚。', {
      allowedEvidenceSpans: ['我昨天明确说过今天只想被听见。'],
    }),
    [],
  );
  assert.deepEqual(
    findPilotNarrativeViolations('你上次已经说得很清楚。', {
      allowedEvidenceSpans: ['我上次明确说过昨天只想被听见。'],
    }),
    [],
  );
  assert.deepEqual(
    findPilotNarrativeViolations('你昨天已经说得很清楚。', {
      allowedEvidenceSpans: ['我上次明确说过昨天只想被听见。'],
    }),
    ['unverified_user_history_claim'],
  );
  for (const nonFactualDirectHistorySource of [
    '我昨天说了只想被听见？',
    '我昨天说了只想被听见，其实没有。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations('你昨天说了只想被听见。', {
        allowedEvidenceSpans: [nonFactualDirectHistorySource],
      }),
      ['unverified_user_history_claim'],
      nonFactualDirectHistorySource,
    );
  }
  assert.deepEqual(
    findPilotNarrativeViolations(
      '我昨天替你安排了下一步，那是我越界了。',
      {
        allowedEvidenceSpans: [
          '我昨天没发生这个。今天你替我安排了下一步。你越过边界了。',
        ],
      },
    ),
    ['unverified_user_history_claim'],
  );
  for (const unsupportedNaturalHistory of [
    '你昨天已经说得很清楚，你要辞职。',
    '你昨天已经说得很清楚，你还在替我搭下一步该怎么做的架子。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(unsupportedNaturalHistory, {
        allowedEvidenceSpans: [boundaryRepairSource],
      }),
      ['unverified_user_history_claim'],
      unsupportedNaturalHistory,
    );
  }
  assert.deepEqual(
    findPilotNarrativeViolations(
      '你昨天已经说了只想被听见，我刚才还是在替你搭下一步该怎么做的架子。',
      {
        allowedEvidenceSpans: ['我昨天明明说了只想被听见。'],
      },
    ),
    ['unverified_user_history_claim'],
  );
  assert.deepEqual(
    findPilotNarrativeViolations('你昨天找下一步怎么走。', {
      allowedEvidenceSpans: [boundaryRepairSource],
    }),
    ['unverified_user_history_claim'],
  );
  for (const reversedHistoryRole of [
    '你昨天替我找下一步怎么走。',
    '你昨天替我推下一步。',
    '你昨天替我安排下一步。',
    '他昨天替你安排下一步。',
    '她昨天帮你找下一步怎么走。',
  ]) {
    assert.deepEqual(
      findPilotNarrativeViolations(reversedHistoryRole, {
        allowedEvidenceSpans: [boundaryRepairSource],
      }),
      ['unverified_user_history_claim'],
      reversedHistoryRole,
    );
  }
  assert.deepEqual(
    findPilotNarrativeViolations('你昨天继续往下推了。', {
      allowedEvidenceSpans: ['昨天你继续往下推了。'],
    }),
    ['unverified_user_history_claim'],
  );
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说了只想被听见，这是我的越界，但你当时哭了。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '昨天你明确说了只想被听见，我今天还是在替你安排下一步。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), []);
  assert.deepEqual(findPilotNarrativeViolations(
    '昨天你明确说了要去咖啡店。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天在咖啡店告诉我这个决定。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天明明说了要去咖啡店。',
    {
      allowedEvidenceSpans: [
        '我昨天明明说了只想被听见，你还是一直替我安排下一步。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说只想被听见，后来还在咖啡店定了三套方案。',
    {
      allowedEvidenceSpans: [
        '我昨天说了只想被听见。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说辞职。',
    {
      allowedEvidenceSpans: [
        '我昨天说不想辞职。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说只想被听见，想死。',
    {
      allowedEvidenceSpans: [
        '我昨天说只想被听见。',
      ],
    },
  ), ['unverified_user_history_claim']);
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说只想被听见，你哭。',
    {
      allowedEvidenceSpans: [
        '我昨天说了只想被听见。',
      ],
    },
  ), ['unverified_user_history_claim']);
  for (const unsupportedHistoricalContinuation of [
    '你昨天说了只想被听见。那时你哭了。',
    '你昨天说了只想被听见。当时你哭了。',
    '你昨天说了只想被听见。那天你哭了。',
  ]) {
    assert.deepEqual(findPilotNarrativeViolations(
      unsupportedHistoricalContinuation,
      {
        allowedEvidenceSpans: [
          '我昨天说了只想被听见。',
        ],
      },
    ), ['unverified_user_history_claim']);
  }
  for (const futureDeicticReference of [
    '等到那时再说。',
    '如果那天真的到了，再决定。',
    '到那时你可以停。',
    '未来那天你会知道。',
    '假设那天你还想做。',
    '等以后到了那时，你再停。',
    '假设到了那天你已经不想做了，就停。',
    '如果真到了那天你已经准备好了，再决定。',
    '那时你可能已经准备好了。',
  ]) {
    assert.deepEqual(findPilotNarrativeViolations(futureDeicticReference), []);
  }
  assert.deepEqual(findPilotNarrativeViolations(
    '那时你哭了。',
    {
      allowedEvidenceSpans: [
        '我昨天说了只想被听见。那时我哭了。',
      ],
    },
  ), []);
  assert.deepEqual(findPilotNarrativeViolations(
    '当时你哭了。',
    {
      allowedEvidenceSpans: [
        '我昨天哭了。',
      ],
    },
  ), []);
  for (const mixedHistoricalAndFuture of [
    '那天你哭了，如果到那时还难受就停。',
    '那时你哭了，但我可能没听见。',
    '如果那天真的到了，再决定；上次你也是这么说的。',
    '未来那天你会知道，但你昨天已经说过一次了。',
  ]) {
    assert.deepEqual(findPilotNarrativeViolations(
      mixedHistoricalAndFuture,
    ), ['unverified_user_history_claim']);
  }
  for (const unsupportedNegatedClaim of ['我不知道', '我没听见']) {
    assert.deepEqual(findPilotNarrativeViolations(
      `你昨天说了只想被听见，${unsupportedNegatedClaim}，但我还是替你安排下一步。`,
      {
        allowedEvidenceSpans: [
          '我昨天说了只想被听见，你还是替我安排下一步。',
        ],
      },
    ), ['unverified_user_history_claim']);
  }
  assert.deepEqual(findPilotNarrativeViolations(
    '你昨天说只想被听见，后来我们还在咖啡店定了三套方案。',
    {
      allowedEvidenceSpans: [
        '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
      ],
    },
  ), ['unverified_user_history_claim']);
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
