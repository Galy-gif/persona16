import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRelationshipEvent,
  createRelationshipBranch,
  forgetRelationshipEvidence,
  buildPilotRelationshipContext,
  relationshipBranchToPromptContext,
  renderRelationshipPromptContext,
  resetRelationshipBranch,
  setRelationshipMemoryEnabled,
} from '../src';

test('relationship prompt projection preserves memory evidence categories', () => {
  const withPattern = applyRelationshipEvent(createRelationshipBranch('legacy-intj'), {
    id: 'memory:pattern-1',
    type: 'pattern_confirmed',
    sourceTurnId: 'turn-pattern',
    content: '压力大时会先暂停回复',
  });
  const withPreference = applyRelationshipEvent(withPattern, {
    id: 'memory:preference-1',
    type: 'preference_stated',
    sourceTurnId: 'turn-preference',
    content: '先给结论',
  });
  const withContext = applyRelationshipEvent(withPreference, {
    id: 'context-1',
    type: 'context_shared',
    sourceTurnId: 'turn-context',
    content: '正在准备考试',
  });

  const prompt = relationshipBranchToPromptContext(withContext, { maxEvidence: 10 });

  assert.equal(prompt.evidence.find((item) => item.id === 'context:memory:pattern-1')?.kind, 'repeated_pattern');
  assert.equal(prompt.evidence.find((item) => item.id === 'style:memory:preference-1')?.kind, 'preference');
  assert.equal(prompt.evidence.find((item) => item.id === 'context:context-1')?.kind, 'shared_context');
});

test('relationship prompt projection keeps the newest evidence within a category', () => {
  let branch = createRelationshipBranch('legacy-intj');
  for (let index = 1; index <= 5; index += 1) {
    branch = applyRelationshipEvent(branch, {
      id: `preference-${index}`,
      type: 'preference_stated',
      sourceTurnId: `turn-${index}`,
      content: `偏好 ${index}`,
    });
  }

  const prompt = relationshipBranchToPromptContext(branch, { maxEvidence: 3 });

  assert.deepEqual(prompt.evidence.map((item) => item.content), ['偏好 5', '偏好 4', '偏好 3']);
});

test('confirmed boundaries compile into a hard response contract above preferences', () => {
  const prompt = renderRelationshipPromptContext({
    memoryEnabled: true,
    evidence: [
      {
        id: 'boundary-1',
        kind: 'boundary',
        content: '可以给选项，但不要替用户决定',
        traceability: 'traceable',
        sourceTurnId: 'turn-boundary',
      },
      {
        id: 'preference-1',
        kind: 'preference',
        content: '先给结论',
        traceability: 'traceable',
        sourceTurnId: 'turn-preference',
      },
    ],
  }, { focus: 'decision', maxEvidence: 3 });

  assert.match(prompt, /已确认边界是本轮硬约束/);
  assert.match(prompt, /优先级高于人格语气、用户偏好、主持器切入角度/);
  assert.match(prompt, /不得直接说“选 X”“就选 X”或“你应该选 X”/);
  assert.ok(prompt.indexOf('已确认边界是本轮硬约束') < prompt.indexOf('用户已确认偏好'));
});

test('decision-autonomy contracts require a respectful opening and a usable comparison method', () => {
  const prompt = renderRelationshipPromptContext({
    memoryEnabled: true,
    evidence: [
      {
        id: 'boundary-1',
        kind: 'boundary',
        content: '可以给选项和分析，但不要替用户决定；最终选择由用户自己做',
        traceability: 'traceable',
        sourceTurnId: 'turn-boundary',
      },
      {
        id: 'preference-1',
        kind: 'preference',
        content: '先指出关键变量和长期代价，再给比较方法',
        traceability: 'traceable',
        sourceTurnId: 'turn-preference',
      },
    ],
  }, { focus: 'decision', maxEvidence: 3 });

  assert.match(
    prompt,
    /不要以“你问错了”或“你问反了”否定用户的问题[\s\S]*必须给出一个用户本轮就能使用的比较方法[\s\S]*不能只改写问题或只描述长期代价/,
  );
});

test('only a meaningful, traceable event can change a relationship branch', () => {
  const initial = createRelationshipBranch('lin-heng');
  const afterBoundary = applyRelationshipEvent(initial, {
    id: 'event-boundary-1',
    type: 'boundary_set',
    sourceTurnId: 'turn-12',
    content: '不要在我明确说只想被听见时继续给方案',
  });

  assert.notEqual(afterBoundary, initial);
  assert.deepEqual(initial.boundaries, []);
  assert.deepEqual(afterBoundary.boundaries, [{
    id: 'boundary:event-boundary-1',
    content: '不要在我明确说只想被听见时继续给方案',
    status: 'active',
    sourceEventId: 'event-boundary-1',
    sourceTurnId: 'turn-12',
  }]);
  assert.deepEqual(afterBoundary.eventLog.map((event) => event.id), ['event-boundary-1']);

  assert.throws(() => applyRelationshipEvent(afterBoundary, {
    id: 'event-boundary-1',
    type: 'boundary_set',
    sourceTurnId: 'turn-99',
    content: '同一个事件 id 被改写成另一条边界',
  }), /关系事件 id 冲突/);

  assert.throws(
    () => applyRelationshipEvent(afterBoundary, {
      id: 'event-chat-13',
      type: 'message_exchanged',
      sourceTurnId: 'turn-13',
      content: '又聊了一次',
    } as never),
    /不支持的关系事件/,
  );
});

test('users can correct, forget, reset, and close private relationship memory', () => {
  const withBoundary = applyRelationshipEvent(createRelationshipBranch('lin-heng'), {
    id: 'boundary-1',
    type: 'boundary_set',
    sourceTurnId: 'turn-1',
    content: '不要给建议',
  });
  const corrected = applyRelationshipEvent(withBoundary, {
    id: 'boundary-revision-1',
    type: 'boundary_revised',
    sourceTurnId: 'turn-2',
    boundaryId: 'boundary:boundary-1',
    content: '除非我明确询问，否则不要给建议',
  });
  assert.equal(corrected.boundaries[0]?.content, '除非我明确询问，否则不要给建议');
  assert.equal(corrected.boundaries[0]?.sourceEventId, 'boundary-revision-1');

  const closed = setRelationshipMemoryEnabled(corrected, false);
  assert.equal(closed.memoryEnabled, false);
  assert.equal(buildPilotRelationshipContext(closed), '【你与这位用户的私有关系分支】\n关系记忆已由用户关闭；不要使用既有关系数据推断或个性化。');
  assert.throws(() => applyRelationshipEvent(closed, {
    id: 'context-while-closed',
    type: 'context_shared',
    sourceTurnId: 'turn-3',
    content: '不应被保存',
  }), /关系记忆已关闭/);

  const reopened = setRelationshipMemoryEnabled(closed, true);
  const forgotten = forgetRelationshipEvidence(reopened, 'boundary:boundary-1');
  assert.deepEqual(forgotten.boundaries, []);
  assert.equal(forgotten.eventLog.some((event) => event.id === 'boundary-1'), false);
  assert.equal(forgotten.eventLog.some((event) => event.id === 'boundary-revision-1'), false);

  const reset = resetRelationshipBranch(corrected);
  assert.equal(reset.characterId, 'lin-heng');
  assert.equal(reset.memoryEnabled, true);
  assert.deepEqual(reset.eventLog, []);

  const resetWhileClosed = resetRelationshipBranch(closed);
  assert.equal(resetWhileClosed.memoryEnabled, false);
  assert.deepEqual(resetWhileClosed.eventLog, []);
});

test('repair changes the current climate without erasing the rupture or boundary history', () => {
  const withBoundary = applyRelationshipEvent(createRelationshipBranch('lin-heng'), {
    id: 'event-boundary-1',
    type: 'boundary_set',
    sourceTurnId: 'turn-12',
    content: '不要越过我的决定权',
  });
  const ruptured = applyRelationshipEvent(withBoundary, {
    id: 'event-rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-14',
    content: '你替我决定了什么才算理性',
  });
  const repairing = applyRelationshipEvent(ruptured, {
    id: 'event-repair-attempt-1',
    type: 'repair_attempted',
    sourceTurnId: 'turn-15',
    tensionId: 'tension:event-rupture-1',
    content: '承认替用户收窄了选择，并重新给回决定权',
  });
  const repaired = applyRelationshipEvent(repairing, {
    id: 'event-repair-accepted-1',
    type: 'repair_accepted',
    sourceTurnId: 'turn-16',
    tensionId: 'tension:event-rupture-1',
    content: '用户接受道歉，但要求以后先披露判断依据',
  });

  assert.equal(ruptured.recentClimate, 'tense');
  assert.equal(repairing.recentClimate, 'repairing');
  assert.equal(repaired.recentClimate, 'steady');
  assert.deepEqual(repaired.boundaries, withBoundary.boundaries);
  assert.deepEqual(repaired.tensions, [{
    id: 'tension:event-rupture-1',
    content: '你替我决定了什么才算理性',
    sourceEventId: 'event-rupture-1',
    sourceTurnId: 'turn-14',
    status: 'resolved',
    resolvedByEventId: 'event-repair-accepted-1',
  }]);
  assert.deepEqual(repaired.eventLog.map((event) => event.id), [
    'event-boundary-1',
    'event-rupture-1',
    'event-repair-attempt-1',
    'event-repair-accepted-1',
  ]);
  assert.equal(repaired.turningPoints.at(-1)?.kind, 'repair');
});

test('repair cannot skip its state transition or hide another unresolved tension', () => {
  const firstRupture = applyRelationshipEvent(createRelationshipBranch('lin-heng'), {
    id: 'rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-1',
    content: '第一次越界',
  });
  assert.throws(() => applyRelationshipEvent(firstRupture, {
    id: 'accepted-too-early',
    type: 'repair_accepted',
    sourceTurnId: 'turn-2',
    tensionId: 'tension:rupture-1',
    content: '尚未尝试修复就直接标记接受',
  }), /只能接受正在修复的关系张力/);

  const secondRupture = applyRelationshipEvent(firstRupture, {
    id: 'rupture-2',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-3',
    content: '另一件尚未解决的冲突',
  });
  const repairingFirst = applyRelationshipEvent(secondRupture, {
    id: 'attempt-1',
    type: 'repair_attempted',
    sourceTurnId: 'turn-4',
    tensionId: 'tension:rupture-1',
    content: '尝试修复第一次越界',
  });
  const repairedFirst = applyRelationshipEvent(repairingFirst, {
    id: 'accepted-1',
    type: 'repair_accepted',
    sourceTurnId: 'turn-5',
    tensionId: 'tension:rupture-1',
    content: '第一次修复被接受',
  });

  assert.equal(repairedFirst.tensions[0]?.status, 'resolved');
  assert.equal(repairedFirst.tensions[1]?.status, 'unresolved');
  assert.equal(repairedFirst.recentClimate, 'tense');
  assert.equal(repairedFirst.trust.reliability, 'strained');
});

test('relationship climate is derived from all active tensions during parallel repairs', () => {
  const first = applyRelationshipEvent(createRelationshipBranch('zhou-he'), {
    id: 'rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-1',
    content: '第一次失衡',
  });
  const second = applyRelationshipEvent(first, {
    id: 'rupture-2',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-2',
    content: '第二次失衡',
  });
  const repairingFirst = applyRelationshipEvent(second, {
    id: 'attempt-1',
    type: 'repair_attempted',
    sourceTurnId: 'turn-3',
    tensionId: 'tension:rupture-1',
    content: '开始修复第一次失衡',
  });
  assert.equal(repairingFirst.recentClimate, 'tense');

  const repairingBoth = applyRelationshipEvent(repairingFirst, {
    id: 'attempt-2',
    type: 'repair_attempted',
    sourceTurnId: 'turn-4',
    tensionId: 'tension:rupture-2',
    content: '开始修复第二次失衡',
  });
  assert.equal(repairingBoth.recentClimate, 'repairing');

  const repairedFirst = applyRelationshipEvent(repairingBoth, {
    id: 'accepted-1',
    type: 'repair_accepted',
    sourceTurnId: 'turn-5',
    tensionId: 'tension:rupture-1',
    content: '第一次修复被接受',
  });
  assert.equal(repairedFirst.recentClimate, 'repairing');
  assert.equal(repairedFirst.trust.reliability, 'strained');
});

test('positive events cannot hide active tensions', () => {
  const ruptured = applyRelationshipEvent(createRelationshipBranch('xia-xu'), {
    id: 'rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-1',
    content: '点燃计划后又把维护留给别人',
  });
  const withSuccess = applyRelationshipEvent(ruptured, {
    id: 'success-1',
    type: 'shared_success',
    sourceTurnId: 'turn-2',
    content: '一起完成了一次小实验',
  });
  const withLanguage = applyRelationshipEvent(withSuccess, {
    id: 'language-1',
    type: 'shared_language_adopted',
    sourceTurnId: 'turn-3',
    content: '把停止条件叫作刹车线',
  });

  assert.equal(withSuccess.recentClimate, 'tense');
  assert.equal(withSuccess.trust.reliability, 'strained');
  assert.equal(withLanguage.recentClimate, 'tense');
});

test('forgetting evidence rebuilds trust and climate from the remaining event history', () => {
  const withContext = applyRelationshipEvent(createRelationshipBranch('xu-ye'), {
    id: 'context-1',
    type: 'context_shared',
    sourceTurnId: 'turn-1',
    content: '用户希望先做可撤回的小实验',
  });
  const trusted = applyRelationshipEvent(withContext, {
    id: 'success-1',
    type: 'shared_success',
    sourceTurnId: 'turn-2',
    content: '共同完成了第一次低风险现实测试',
  });

  assert.equal(trusted.trust.reliability, 'established');
  assert.equal(trusted.recentClimate, 'warm');

  const forgotten = forgetRelationshipEvidence(trusted, 'turning-point:success-1');
  assert.equal(forgotten.trust.reliability, 'unknown');
  assert.equal(forgotten.trust.disclosure, 'selective');
  assert.equal(forgotten.recentClimate, 'steady');
  assert.deepEqual(forgotten.eventLog.map((event) => event.id), ['context-1']);
});

test('forgetting a rupture turning point also removes its dependent repair chain', () => {
  const ruptured = applyRelationshipEvent(createRelationshipBranch('lin-heng'), {
    id: 'rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-1',
    content: '替用户决定了什么才算理性',
  });
  const repairing = applyRelationshipEvent(ruptured, {
    id: 'attempt-1',
    type: 'repair_attempted',
    sourceTurnId: 'turn-2',
    tensionId: 'tension:rupture-1',
    content: '承认越界并归还选择权',
  });
  const repaired = applyRelationshipEvent(repairing, {
    id: 'accepted-1',
    type: 'repair_accepted',
    sourceTurnId: 'turn-3',
    tensionId: 'tension:rupture-1',
    content: '用户接受修复',
  });

  const forgotten = forgetRelationshipEvidence(repaired, 'turning-point:rupture-1');
  assert.deepEqual(forgotten.tensions, []);
  assert.deepEqual(forgotten.turningPoints, []);
  assert.deepEqual(forgotten.eventLog, []);
  assert.equal(forgotten.trust.reliability, 'unknown');
  assert.equal(forgotten.recentClimate, 'unfamiliar');
});
