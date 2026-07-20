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
