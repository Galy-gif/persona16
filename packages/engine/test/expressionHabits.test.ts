import assert from 'node:assert/strict';
import test from 'node:test';
import {
  expressionTendenciesForAgent,
  renderExpressionEvidenceInstruction,
  selectExpressionEvidence,
  type ExpressionTendencies,
} from '../src/expressionHabits';

const vividProfile: ExpressionTendencies = {
  turnExtent: 5,
  initiative: 5,
  selfDisclosure: 1,
  directness: 5,
  affectDisplay: 5,
  warmth: 1,
  playfulness: 5,
  abstraction: 1,
  friction: 5,
};

test('simple greetings do not carry forced personality evidence', () => {
  const evidence = selectExpressionEvidence(vividProfile, {
    turnAct: 'greeting',
    focus: 'ordinary',
    turnKey: '你好',
  });

  assert.deepEqual(evidence, []);
});

test('one turn exposes at most two relevant tendencies', () => {
  const evidence = selectExpressionEvidence(vividProfile, {
    turnAct: 'respond',
    focus: 'decision',
    turnKey: '这个 offer 我该不该接？',
  });

  assert.ok(evidence.length > 0);
  assert.ok(evidence.length <= 2);
  assert.ok(evidence.every((item) => (
    ['turnExtent', 'initiative', 'directness', 'abstraction', 'friction'] as const
  ).includes(item.tendency)));
});

test('support and repair suppress playfulness even for a highly playful person', () => {
  const support = selectExpressionEvidence(vividProfile, {
    turnAct: 'respond',
    focus: 'support',
    turnKey: '我爸刚住院，我脑子一团乱',
  });
  const repair = selectExpressionEvidence(vividProfile, {
    turnAct: 'style_repair',
    focus: 'repair',
    turnKey: '你刚才说话太装了',
  });

  assert.equal(support.some((item) => item.tendency === 'playfulness'), false);
  assert.equal(repair.some((item) => item.tendency === 'playfulness'), false);
});

test('ordinary social turns do not force abstract analysis or disagreement', () => {
  const analyticalAndCombativeOnly: ExpressionTendencies = {
    turnExtent: 3,
    initiative: 3,
    selfDisclosure: 3,
    directness: 3,
    affectDisplay: 3,
    warmth: 3,
    playfulness: 3,
    abstraction: 5,
    friction: 5,
  };
  const evidence = selectExpressionEvidence(analyticalAndCombativeOnly, {
    turnAct: 'respond',
    focus: 'ordinary',
    turnKey: '我朋友今天终于拿到 offer 了，我比他还激动。',
  });

  assert.deepEqual(evidence, []);
});

test('selection is stable for replay but can vary across turns', () => {
  const context = {
    turnAct: 'respond' as const,
    focus: 'ordinary' as const,
  };
  const first = selectExpressionEvidence(vividProfile, { ...context, turnKey: '今天下雨了' });
  const replay = selectExpressionEvidence(vividProfile, { ...context, turnKey: '今天下雨了' });
  const anotherTurn = selectExpressionEvidence(vividProfile, { ...context, turnKey: '我朋友拿到 offer 了' });

  assert.deepEqual(replay, first);
  assert.notDeepEqual(anotherTurn.map((item) => item.tendency), first.map((item) => item.tendency));
});

test('rendered guidance describes behavior without scores or personality labels', () => {
  const instruction = renderExpressionEvidenceInstruction(vividProfile, {
    turnAct: 'respond',
    focus: 'ordinary',
    turnKey: '我朋友拿到 offer 了',
  });

  assert.doesNotMatch(instruction, /\d\s*\/\s*5|内向|外向|幽默的人|性格是|我是那种/);
  assert.match(instruction, /对话动作/);
  assert.match(instruction, /不要.*解释/);
});

test('canonical expression baselines still honor per-turn tone shifts', () => {
  const shifted = expressionTendenciesForAgent('INTJ', {
    turnLength: 5,
    expansion: 2,
    bite: 1,
    warmth: 5,
    daze: 1,
    abstraction: 1,
    initiative: 5,
  });

  assert.equal(shifted.turnExtent, 5);
  assert.equal(shifted.initiative, 5);
  assert.equal(shifted.warmth, 5);
  assert.equal(shifted.playfulness, 1);
  assert.equal(shifted.abstraction, 1);
});
