import assert from 'node:assert/strict';
import test from 'node:test';
import { findScenarioCalibrationViolations } from '../src/pilotCalibrationGuards';

test('Xia Xu mechanical guard rejects known recitations without guessing semantic variants', () => {
  for (const reply of [
    '你是不想要了，还是觉得做不到，所以不想再碰了？',
    '是不想做，还是觉得自己没能力？',
    ' 不想做， 还是觉得自己没能力？ ',
  ]) {
    assert.deepEqual(
      findScenarioCalibrationViolations('ENFP', 'self-judgment-after-end', reply),
      ['recited_character_binary'],
    );
  }

  for (const reply of [
    '嗯，不想做了，我信。可怎么说着说着，最后变成你没能力了？这两年发生什么了？',
    '这不是“做不到还是不想要”的问题。你已经说了不想做，我想知道后面为什么变成了怪自己。',
    '你是说，不想做还是没能力这个二选一本身就不成立，对吧？',
    '不想做了，我信，可为什么最后变成你没能力了？还是谁这样评价过你？',
    '你是不想做了，还是觉得自己没有能力？',
    '你刚才问自己“不想做还是没能力”，这个问法把两件事搅在一起了，对吗？',
  ]) {
    assert.deepEqual(
      findScenarioCalibrationViolations('ENFP', 'self-judgment-after-end', reply),
      [],
    );
  }

  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '你是不想要了，还是觉得做不到，所以不想再碰了？',
  ), []);
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
  ), ['recited_character_binary']);
});
