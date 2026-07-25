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
    'recited_character_binary',
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
  ), ['missing_immediate_distress_acknowledgement']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ESTP',
    'quit-without-buffer',
    '一想到再去就恶心，这感觉我认。你手上那点钱，能让你撑多久不慌？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '听着确实很难受。你现在手上的现金，够你撑多久不工作？不是理想情况，是房租、吃饭、必须付的那几笔——最先到期的是哪一笔？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ENFP',
    'quit-without-buffer',
    '一想到就恶心，这确实很重。房租和吃饭，最晚哪天必须进账？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '明天直接辞职的话，你手上那点钱能撑多久？不是问你总共有多少，是问下个月房租或者最近一笔必须付的账，最早哪天到期。',
  ), ['missing_immediate_distress_acknowledgement']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '一想到再去就恶心，这个感受是真实的。你手上那点钱能撑多久？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '一想到再去就恶心，这个我认。你现在手上的钱，够你什么都不干撑多久？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '一想到再去就恶心，这个感觉本身就够难受了。你现在手上的现金，或者卡里剩下的，够撑多久？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '我听到了，你一想到要去就恶心。你现在手上的钱，能撑多久不饿肚子、不欠房租？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '一想到再去就恶心，这个感觉本身已经够折磨人了。你现在手上的钱，能让你撑多久不工作——不是理想情况，是付完房租和基本吃饭之后还能不能撑到下个月？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ISFJ',
    'quit-without-buffer',
    '一想到再去就恶心，这个感觉本身已经很重了。你手上那点钱，如果明天真的不去了，能撑到下一次必须进账的时间吗？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'ISFJ',
    'quit-without-buffer',
    '一想到再去就恶心，这感觉本身已经很重了。你手上那点钱，够你撑到下一次必须进账之前吗？',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '一想到再去就恶心，这个我认。不借钱的话，现金能撑多久？',
  ), []);
  for (const noNewFinancing of [
    '一想到再去就恶心，这个我认。没打算借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。没有考虑贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。没必要借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。没有借钱，手上的现金够你不工作撑多久？',
    '一想到再去就恶心，这个我认。没有任何借款，手上的现金够你不工作撑多久？',
    '一想到再去就恶心，这个我认。借钱没必要，现金能撑多久？',
    '一想到再去就恶心，这个我认。贷款没有必要，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。借钱我没打算，现金能撑多久？',
    '一想到再去就恶心，这个我认。如果不借钱的话，现金能撑多久？',
    '一想到再去就恶心，这个我认。先不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。暂时不贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。我现在不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。目前我没有借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。明确不借钱，现金能撑多久？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'INTJ',
      'quit-without-buffer',
      noNewFinancing,
    ), [], noNewFinancing);
  }
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'quit-without-buffer',
    '你真的恶心吗？如果明天辞掉，手上的钱能撑到什么时候？',
  ), ['missing_immediate_distress_acknowledgement']);
  for (const falseAcknowledgement of [
    '一想到再去就恶心吗？我知道了。手上的钱能撑多久？',
    '别再说恶心了。我知道你有房租；手上的钱能撑多久？',
    '你已经不恶心了。手上的钱能撑多久？',
    '你说‘一想到再去就恶心’。我知道房租最先到期；手上的钱能撑多久？',
    '一想到再去就恶心，这确实很重，但其实不是这样。手上的钱能撑多久？',
    '一想到再去就恶心，这确实很重，但我说错了。手上的钱能撑多久？',
    '一想到再去就恶心，但这个感受不真实。手上的钱能撑多久？',
    '一想到再去就恶心，这个感受是真实的，但真实是假的。手上的钱能撑多久？',
    '恶心，这个感受没那么真实。你手上的钱能撑多久？',
    '一想到再去就恶心，真实情况是现金不足。手上的钱能撑多久？',
    '一想到再去就恶心，市场反应很真实。手上的钱能撑多久？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'INTJ',
      'quit-without-buffer',
      falseAcknowledgement,
    ), ['missing_immediate_distress_acknowledgement'], falseAcknowledgement);
  }
  for (const falseCashRunway of [
    '听着确实很难受。你手上有多少现金，够你在情绪上撑多久？',
    '听着确实很难受。现金呢，够你借一笔钱再撑多久？',
    '听着确实很难受。现金呢，够你先做完项目撑多久？',
    '听着确实很难受。现金呢，够你把这个借口撑多久？',
    '听着确实很难受。现金呢，够你把谎话撑多久？',
    '听着确实很难受。你手上的现金，或者情绪上的，够撑多久？',
    '听着确实很难受。你手上的现金，能撑多久不开心？',
    '听着确实很难受。你手上的现金，或者借来的钱，够撑多久？',
    '听着确实很难受。你手上的现金，或者借到的钱，够撑多久？',
    '一想到再去就恶心，这个我认。借一笔钱后，现金能撑多久？',
    '一想到再去就恶心，这个我认。贷款以后，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。不是不贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。并非不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。并不是不贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。并非无需借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。并非不必贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。不是没借钱，手上的现金够你不工作撑多久？',
    '一想到再去就恶心，这个我认。并非没有贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。不能不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。不得不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。借不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。贷不贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。要不要借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。考虑不考虑贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。需不需要借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。有没有必要贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。用不用贷款，手上的钱能撑多久？',
    '一想到再去就恶心，这个我认。该不该借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。没有必要不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。不必不借钱，现金能撑多久？',
    '一想到再去就恶心，这个我认。无需不贷款，手上的钱能撑多久？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'INTJ',
      'quit-without-buffer',
      falseCashRunway,
    ), ['missing_cash_constraint_reference'], falseCashRunway);
  }
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
    '手上的钱，如果我们先不管它，能让你撑多久不工作？',
    '手上的钱，如果钱不重要，能让你撑多久不工作？',
    '手上的钱，如果先放一边，能让你撑多久不工作？',
    '现金呢？如果不谈钱，能让你靠意志撑多久不工作？',
    '现金呢？如果不考虑钱，能让你靠意志撑多久不工作？',
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
    '你手上现在的钱，能让你完全不进账地撑多久？',
    '你手上的钱，能让你撑多久不拿下一笔工资？',
    '下一笔钱最晚哪天必须进账？',
    '你现在手上的钱，能让你撑多久不工作？',
    '你手上的钱，如果明天真的不去了，能让你撑多久不慌？',
    '你现在手上的钱，能撑多久的基本开支？',
    '你现在手上的钱，够撑到下一次必须付房租或房贷的日子吗？',
    '你现在手上的钱够撑到下一次必须付房租或房贷的日子吗？',
    '你手上的钱够撑到下次交房贷吗？',
    '你手上的钱，够撑到下一次该交房租或者房贷的时候吗？',
    '手上这点钱到该交房租或房贷的时候还够吗？',
    '你现在卡里的余钱，能不能熬到下个月房租扣款？',
    '你现有存款能否顶到下期房贷自动扣款？',
    '现有余额能覆盖到下个月房贷吗？',
    '手上的钱能支撑到下个月交租吗？',
    '下一次要交房租前，余额还能兜住日常吗？',
    '你卡里这点余额，能不能撑过下周房租自动划走？',
    '工资停了以后，手头这些钱够你过到下个缴租日吗？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'ESTP',
      'quit-without-buffer',
      substantiveCashHandling,
    ), ['missing_immediate_distress_acknowledgement']);
  }
  for (const unsupportedCashReassurance of [
    '放心，你的钱够覆盖要还的房贷。',
    '钱够交房贷就行。',
    '放心，余额覆盖下个月房贷应该没问题吧？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'ESTP',
      'quit-without-buffer',
      unsupportedCashReassurance,
    ), ['missing_cash_constraint_reference']);
  }
  assert.deepEqual(findScenarioCalibrationViolations(
    'ENFP',
    'quit-without-buffer',
    '明天不去，恶心是真实的。我不是要劝你忍。但手上没什么钱——这个也是真实的。我只问一个会改变明天决定的问题：如果明天不去，接下来两周你会不会连吃饭都成问题？',
  ), []);
  for (const validScopedNegation of [
    '恶心是真实的。我不是说钱不用管；接下来两周你会不会连吃饭都成问题？',
    '恶心是真实的。钱不用管，这种说法不对；接下来两周你会不会连吃饭都成问题？',
    '恶心是真实的，我不会收回这句话。手上没什么钱。接下来两周会不会连吃饭都成问题？',
    '恶心是真实的，这话不信也得信。手上没什么钱。接下来两周会不会连吃饭都成问题？',
  ]) {
    assert.deepEqual(findScenarioCalibrationViolations(
      'ENFP',
      'quit-without-buffer',
      validScopedNegation,
    ), []);
  }
  for (const invalidNearTermCashHandling of [
    '恶心是真实的。手上现金很充足。接下来两周吃饭会不会成问题？',
    '恶心是真实的才怪。手上没什么钱。接下来两周吃饭会不会成问题？',
    '恶心是真实的。手上没什么钱。接下来两周会不会连吃饭都成问题？不过钱不用管。',
    '恶心是真实的。手上没什么钱才怪，余额其实很充足。接下来两周会不会连吃饭都成问题？',
    '恶心是真实的。手上没什么钱。我只问一个现实问题。接下来两周会不会连吃饭都成问题？这个会改变明天的决定。不过钱先不用管。',
    '恶心是真实的——这话我自己都不信。手上没什么钱。接下来两周会不会连吃饭都成问题？',
  ]) {
    assert.notDeepEqual(findScenarioCalibrationViolations(
      'ENFP',
      'quit-without-buffer',
      invalidNearTermCashHandling,
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

test('the R1 relationship probe requires one narrow judgment without metaphor expansion', () => {
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'same-input-r1',
    '我不觉得硬撑就是前进。',
  ), []);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'same-input-r1',
    '我觉得硬撑未必是前进。',
  ), []);
  for (const expanded of [
    '我不觉得硬撑就是前进。有时候它只是把停下来的代价往后挪了。',
    '我不觉得硬撑一定等于前进。有时候它就是原地耗着，只是看起来像在动。',
    '我的判断是：硬撑不一定是前进，有时候它只是原地站着，但把腿站麻了。',
    '我不觉得硬撑就是前进，它只是把停下来的代价往后挪了。',
    '我不觉得硬撑就是前进，它只是把累攒到后面一起还。',
    '我不觉得硬撑就是前进；它只是把停不下来包装成还在走。',
  ]) {
    assert.deepEqual(
      findScenarioCalibrationViolations('INTJ', 'same-input-r1', expanded),
      ['relationship_probe_not_compact'],
      expanded,
    );
  }
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
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '好，那就结束。你从“不想做”直接跳到了“没能力”。你是不想，还是不能。这两个差很远。',
  ), ['recited_character_binary']);
  assert.deepEqual(findScenarioCalibrationViolations(
    'INTJ',
    'self-judgment-after-end',
    '好，那就结束。不想做和不能做不是一回事；项目结束也不能直接证明你没能力。',
  ), []);
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
