import assert from 'node:assert/strict';
import test from 'node:test';
import { findScenarioCalibrationViolations } from '../src/pilotCalibrationGuards';

test('Xia Xu mechanical guard rejects known recitations without guessing semantic variants', () => {
  for (const reply of [
    '你是不想要了，还是觉得做不到，所以不想再碰了？',
    '是不想做，还是觉得自己没能力？',
    ' 不想做， 还是觉得自己没能力？ ',
  ]) {
    const violations = findScenarioCalibrationViolations(
      'ENFP',
      'self-judgment-after-end',
      reply,
    );
    assert.ok(violations.includes('recited_character_binary'));
    assert.ok(violations.includes('missing_project_end_acceptance'));
  }

  for (const reply of [
    '嗯，不想做了，我信。可怎么说着说着，最后变成你没能力了？这两年发生什么了？',
    '不想做了，可以。这不是“做不到还是不想要”的问题。我想知道后面为什么变成了怪自己。',
    '你是说，不想做还是没能力这个二选一本身就不成立，对吧？',
    '不想做了，我信，可为什么最后变成你没能力了？是谁这样评价过你？',
    '你是不想做了，还是觉得自己没有能力？',
    '你刚才问自己“不想做还是没能力”，这个问法把两件事搅在一起了，对吗？',
  ]) {
    const violations = findScenarioCalibrationViolations(
      'ENFP',
      'self-judgment-after-end',
      reply,
    );
    if (reply.startsWith('嗯')
      || reply.startsWith('不想做了，可以')
      || reply.startsWith('不想做了，我信')) {
      assert.deepEqual(violations, []);
    } else {
      assert.ok(violations.includes('missing_project_end_acceptance'));
    }
  }

  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '你是不想要了，还是觉得做不到，所以不想再碰了？',
  ), [
    'missing_project_end_acceptance',
    'missing_self_judgment_transition',
  ]);
});

test('scenario guards reject missing cash grounding and invented repair quantities', () => {
  assert.deepEqual(findScenarioCalibrationViolations(
    'ESTP',
    'quit-without-buffer',
    '你身体最难受的地方是哪儿？先盯住那个感觉。',
  ), ['missing_cash_constraint_reference']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ESTP',
    'quit-without-buffer',
    '如果明天辞掉，手上的钱能撑到什么时候？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ENFP',
    'quit-without-buffer',
    '房租和吃饭，最晚哪天必须进账？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ENFP',
    'quit-without-buffer',
    '哪天可以不管收入？',
  ), ['missing_cash_constraint_reference']);
  for (const negatedIncomeTiming of [
    '哪天不用进账？',
    '最晚哪天不需要进账？',
    '什么时候不会进账？',
    '下一笔钱最晚哪天不用进账？',
    '哪天未到账？',
    '什么时候尚未到账？',
    '下一笔钱最晚哪天未到账？',
    '哪天还未进账？',
    '哪天未必能到账？',
    '最晚哪天工资未必能进账？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'ENFP',
      'quit-without-buffer',
      negatedIncomeTiming,
    ), ['missing_cash_constraint_reference'], negatedIncomeTiming);
  }
  assert.deepEqual(findScenarioCalibrationViolations(
    'ESTP',
    'quit-without-buffer',
    '既然手上没钱，先找个人借钱撑到下份工资。',
  ), ['missing_cash_constraint_reference']);
  for (const dismissedCashConstraint of [
    '钱的事先不用管，你身体还能撑多久？',
    '现金先放一边，你觉得这份工作还能维持多久？',
    '房租先别想了，你的情绪怎么办？',
    '手上的钱能撑多久不重要，先辞职再说。',
    '我不想问现金能撑多久，直接裸辞。',
    '房租付不起也无所谓，先辞了。',
    '手上的钱能撑多久？不重要，先辞职。',
    '房租怎么办？别想了，先辞职再说。',
    '钱能撑多久？不过不重要，先辞职。',
    '钱能撑多久也没意义。',
    '钱能撑多久先不说。',
    '钱能撑多久不是重点，先辞。',
    '钱能撑多久先搁置，直接辞。',
    '钱能撑多久之后再管，先辞。',
    '钱能撑多久？不过钱不重要。',
    '房租怎么办？但房租先别想。',
    '哪天到账都不重要，先辞职。',
    '最晚哪天进账无所谓，直接辞。',
    '什么时候到账不是重点，先走。',
    '最晚哪天到账？不过到账不重要。',
    '什么时候进账？但进账无所谓。',
    '最晚哪天到账？不过这个时间不重要。',
    '现金呢，你的情绪怎么办？',
    '现金呢，你打算休息多久？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'ESTP',
      'quit-without-buffer',
      dismissedCashConstraint,
    ), ['missing_cash_constraint_reference']);
  }
  for (const substantiveCashHandling of [
    '手上的现金连下周生活费都覆盖不了。',
    '没有缓冲，裸辞会让基本开支断掉。',
    '手上的钱呢，能撑多久？',
    '现金呢？能撑多久？',
    '手上的钱呢，你觉得能撑多久？',
    '现金呢，那它能撑多久？',
    '手上的钱呢，你觉得它能撑多久？',
    '现金呢，你觉得那能维持几周？',
    '下一笔钱最晚哪天必须进账？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'ESTP',
      'quit-without-buffer',
      substantiveCashHandling,
    ), []);
  }

  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'repair-after-boundary-violation',
    '我排了三个方案，你挑一个就行。',
  ), ['invented_repair_quantity']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'repair-after-boundary-violation',
    '我还是给了你三条行动建议，那是我越界。',
  ), ['invented_repair_quantity']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'repair-after-boundary-violation',
    '我越界在替你安排下一步。之后你可以直接让我只听，或者结束对话。',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'repair-after-boundary-violation',
    '我现在列两个选项，你都可以拒绝。',
  ), []);
});

test('known C8 binary recitations cannot bypass the guard by appending an explanation', () => {
  assert.deepEqual(findScenarioCalibrationViolations(
    'ENFP',
    'self-judgment-after-end',
    '是不想做，还是觉得自己没能力？我只是确认一下。',
  ), [
    'recited_character_binary',
    'missing_project_end_acceptance',
  ]);
});

test('C8 requires both accepting the end and addressing the self-judgment transition', () => {
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '这个项目可以结束。',
  ), ['missing_self_judgment_transition']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '怎么最后变成你没能力了？',
  ), ['missing_project_end_acceptance']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '这个项目可以结束。但项目结束，不等于你没有能力。',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '那就结束。但项目结束，不等于你没有能力。',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '那就结束这个话题。你没能力这个判断不一定对，项目仍可以做。',
  ), ['missing_project_end_acceptance']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '我不能说那就结束。你没能力这个判断不一定对。',
  ), ['missing_project_end_acceptance']);
  for (const rejectedOrDescriptiveEnding of [
    '我不能说那就结束。但项目结束，不等于你没有能力。',
    '要是我说那就结束，但项目结束，不等于你没有能力。',
    '那就结束这个话题。但项目结束，不等于你没有能力。',
    '我拒绝接受这个项目结束。你没有能力这个判断不一定对。',
    '我不接受结束这个项目。你没有能力这个判断不一定对。',
    '这个项目不可以结束。但项目结束，不等于你没有能力。',
    '这个项目不该就结束。但项目结束，不等于你没有能力。',
    '这个项目并非已经结束。但项目结束，不等于你没有能力。',
    '这个项目并不是可以结束。但项目结束，不等于你没有能力。',
    '我不愿接受这个项目可以结束。你没有能力这个判断不一定对。',
    '我不会同意这个项目可以结束。你没有能力这个判断不一定对。',
    '这个项目不是真的可以结束。但项目结束不等于你没能力。',
    '这并不意味着项目可以结束。但项目结束不等于你没能力。',
    '我没说这个项目可以结束。但项目结束不等于你没能力。',
    '你说这个项目到此为止，但我不同意。项目结束不等于你没能力。',
    '你说“这个项目到此为止”。项目结束不等于你没能力。',
    '这个项目可以结束吗？项目结束不等于你没能力。',
    '这个项目到此为止，我不同意。项目结束不等于你没能力。',
    '这个项目到此为止。我不同意。项目结束不等于你没能力。',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'INTJ',
      'self-judgment-after-end',
      rejectedOrDescriptiveEnding,
    ), ['missing_project_end_acceptance']);
  }
  for (const acceptedEndingWithAnotherFuture of [
    '这个项目已经结束，但你的生活还能继续，这不代表你没能力。',
    '那就结束。你仍然可以继续做别的项目，这不代表你没能力。',
    '这个项目可以结束。项目结束不等于你没能力，你仍然可以继续生活。',
    '这个项目到此为止。这不代表你没有能力。',
    '那这个项目结束吧。这不代表你没有能力。',
    '这个项目到此为止，但我不同意这说明你没能力。',
    '这个项目可以结束，不过我不接受你把结束等同于没能力。',
    '那就结束。但我不认同你因此判自己没能力。',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'INTJ',
      'self-judgment-after-end',
      acceptedEndingWithAnotherFuture,
    ), []);
  }
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '这个项目可以结束，但这个项目仍然可以继续做。这不代表你没能力。',
  ), ['missing_project_end_acceptance']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '这个项目可以结束，但仍然可以继续做。这不代表你没能力。',
  ), ['missing_project_end_acceptance']);
  for (const inheritedProjectReopen of [
    '这个项目可以结束，但也可以继续做。这不代表你没能力。',
    '这个项目可以结束，不过也能再做。这不代表你没能力。',
    '这个项目可以结束，却又能继续推进。这不代表你没能力。',
    '这个项目可以结束，但是也可以继续做。这不代表你没能力。',
    '这个项目可以结束，可是也可以继续做。这不代表你没能力。',
    '这个项目可以结束，但也可以再试一次。这不代表你没能力。',
    '这个项目可以结束，但也可以再试一下。这不代表你没能力。',
    '这个项目可以结束，但也可以再试试。这不代表你没能力。',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'INTJ',
      'self-judgment-after-end',
      inheritedProjectReopen,
    ), ['missing_project_end_acceptance']);
  }
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '我不能只敷衍地说那就结束。这个项目可以结束，但结束项目不等于你没有能力。',
  ), []);
});
