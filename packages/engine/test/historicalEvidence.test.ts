import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeHistoricalEvidence,
  isHistoricalClaimSupported,
  type HistoricalClaim,
} from '../src/historicalEvidence';

function onlyClaim(
  text: string,
  perspective: 'user_message' | 'persona_reply' = 'user_message',
): HistoricalClaim {
  const analysis = analyzeHistoricalEvidence(text, perspective);
  assert.equal(
    analysis.claims.length,
    1,
    `expected one claim for ${JSON.stringify(text)}, got ${JSON.stringify(analysis.claims)}`,
  );
  return analysis.claims[0]!;
}

test('maps perspective once while preserving the historical speech event time', () => {
  const source = onlyClaim('我昨天明确说过只想被听见');
  assert.equal(source.kind, 'speech');
  assert.equal(source.actor, 'user');
  assert.equal(source.attributedOwner, 'user');
  assert.deepEqual(source.eventTime, {
    kind: 'point',
    value: 'yesterday',
    origin: 'explicit',
  });
  assert.equal(source.boundaryCategory, 'listen');
  assert.equal(source.boundaryPolarity, 'positive');
  assert.equal(source.factuality.mode, 'asserted');

  const reply = onlyClaim('你昨天明确说过只想被听见', 'persona_reply');
  assert.equal(reply.actor, 'user');
  assert.equal(reply.attributedOwner, 'user');
  assert.equal(reply.predicate, source.predicate);
});

test('separates utterer from attributed owner in heard and relayed speech', () => {
  const heard = onlyClaim('我昨天听你说只想被听见');
  assert.equal(heard.kind, 'speech');
  assert.equal(heard.actor, 'persona');
  assert.equal(heard.attributedOwner, 'persona');
  assert.deepEqual(heard.eventTime, {
    kind: 'point',
    value: 'yesterday',
    origin: 'explicit',
  });

  const relayed = onlyClaim('我昨天转述小王说只想被听见');
  assert.equal(relayed.actor, 'user');
  assert.equal(relayed.attributedOwner, 'third');
  assert.equal(relayed.boundaryCategory, 'listen');
});

test('keeps event time outside reported content and resets inherited time at a full stop', () => {
  const report = onlyClaim('我上次说你昨天只想被听见');
  assert.deepEqual(report.eventTime, {
    kind: 'point',
    value: 'last_time',
    origin: 'explicit',
  });
  assert.deepEqual(report.contentTime, {
    kind: 'point',
    value: 'yesterday',
    origin: 'explicit',
  });

  const inherited = onlyClaim('昨天，你替我安排了下一步');
  assert.deepEqual(inherited.eventTime, {
    kind: 'point',
    value: 'yesterday',
    origin: 'inherited',
  });

  const weather = onlyClaim('昨天的天气，我不清楚。我明确说过只想被听见');
  assert.deepEqual(weather.eventTime, {
    kind: 'point',
    value: 'before',
    origin: 'explicit',
  });
});

test('resolves uncertainty without letting an unrelated hearing clause taint the assertion', () => {
  for (const text of [
    '如果我没记错，我昨天明确说过只想被听见',
    '要是我没记错，我昨天明确说过只想被听见',
    '假如我没记错，我昨天明确说过只想被听见',
    '我记得没错的话，我昨天明确说过只想被听见',
    '我昨天明确说过只想被听见，但我现在记不清',
    '我昨天明确说过只想被听见，也许我记错了',
    '我昨天明确说过只想被听见，不一定吧',
    '我昨天明确说过只想被听见，没准吧',
    '我昨天明确说过只想被听见，我也说不准',
  ]) {
    assert.equal(onlyClaim(text).factuality.mode, 'uncertain', text);
  }

  assert.equal(
    onlyClaim('我昨天明确说过只想被听见，不过我没听清你的回答')
      .factuality.mode,
    'asserted',
  );
  assert.equal(
    onlyClaim('我昨天明确说过只想被听见，你听到了，对吗？')
      .factuality.mode,
    'asserted',
  );
});

test('represents event negation, intention, and questions as factuality instead of deleting claims', () => {
  const cases: Array<{
    text: string;
    expected: HistoricalClaim['factuality']['mode'];
  }> = [
    { text: '我昨天没说过只想被听见', expected: 'negated' },
    { text: '我昨天打算说只想被听见', expected: 'hypothetical' },
    { text: '我昨天可能说过只想被听见', expected: 'uncertain' },
    { text: '我昨天说过只想被听见吗？', expected: 'questioned' },
    { text: '我昨天说过只想被听见，对吗？', expected: 'questioned' },
  ];
  for (const { text, expected } of cases) {
    assert.equal(onlyClaim(text).factuality.mode, expected, text);
  }

  assert.equal(
    onlyClaim('昨天你没有替我安排下一步').factuality.mode,
    'negated',
  );
  assert.equal(
    onlyClaim('昨天你打算替我安排下一步').factuality.mode,
    'hypothetical',
  );
  assert.equal(
    onlyClaim('昨天你替我安排了下一步吗？').factuality.mode,
    'questioned',
  );
});

test('applies generic retractions and attribution corrections to the compatible speech claim', () => {
  for (const text of [
    '我昨天明确说过只想被听见，后来取消前面说法',
    '我昨天明确说过只想被听见，后来我说我不是这个意思',
    '我昨天明确说过只想被听见，后来我改口说不是这个意思',
    '我昨天明确说过只想被听见，后来我纠正说自己没有这个意思',
  ]) {
    assert.ok(onlyClaim(text).factuality.retractedBy, text);
  }

  const scoped = onlyClaim(
    '我昨天明确说过只想被听见，后来撤回了那句话。指的是辞职',
  );
  assert.equal(scoped.factuality.retractedBy, undefined);

  const targeted = analyzeHistoricalEvidence(
    '我昨天说过不想辞职。我昨天也说过只想被听见。后来撤回了那句话。指的是辞职',
    'user_message',
  ).claims;
  assert.equal(targeted.length, 2);
  assert.ok(targeted[0]?.factuality.retractedBy);
  assert.equal(targeted[1]?.factuality.retractedBy, undefined);

  for (const text of [
    '我昨天明确说过只想被听见，这句话来自小王',
    '我昨天明确说过只想被听见，不是我说的，是小王说的',
  ]) {
    assert.equal(onlyClaim(text).attributedOwner, 'third', text);
  }
});

test('parses directed actions without a positive-modifier allowlist', () => {
  for (const text of [
    '昨天你替我安排了下一步',
    '昨天你反而替我安排了下一步',
    '昨天你偏偏替我安排了下一步',
    '昨天你照样替我安排了下一步',
    '昨天你仍旧替我安排了下一步',
    '昨天你真的替我安排了下一步',
    '昨天你当时替我安排了下一步',
    '昨天你已经在替我安排了下一步',
    '昨天你后来直接替我安排了下一步',
  ]) {
    const claim = onlyClaim(text);
    assert.equal(claim.kind, 'directed_action', text);
    assert.equal(claim.actor, 'persona', text);
    assert.equal(claim.recipient, 'user', text);
    assert.equal(claim.actionCategory, 'arrange', text);
    assert.equal(claim.factuality.mode, 'asserted', text);
  }

  const advice = onlyClaim('昨天你给了我建议');
  assert.equal(advice.actionCategory, 'advice');
  assert.equal(advice.actor, 'persona');
  assert.equal(advice.recipient, 'user');
});

test('keeps conditions in reported content separate from the speech event', () => {
  assert.equal(
    onlyClaim('你上次如果说过只想被听见').factuality.mode,
    'hypothetical',
  );
  for (const verb of ['强调', '声称', '答应', '承认', '回复', '明确指出']) {
    const claim = onlyClaim(`你上次${verb}如果累了就停`);
    assert.equal(claim.kind, 'speech', verb);
    assert.equal(claim.factuality.mode, 'asserted', verb);
  }
});

test('classifies standing autonomy separately from unsupported habits', () => {
  for (const text of [
    '你一直可以不回答',
    '你不用回应',
    '你不需要回应',
    '你没必要回应',
    '你无需回答',
    '你不必回答',
    '你有权沉默',
  ]) {
    const claim = onlyClaim(text, 'persona_reply');
    assert.equal(claim.kind, 'standing_permission', text);
    assert.deepEqual(claim.eventTime, { kind: 'standing' }, text);
    assert.equal(claim.factuality.mode, 'asserted', text);
  }

  for (const text of ['你一直不回答', '你总是可以找到借口']) {
    const claim = onlyClaim(text, 'persona_reply');
    assert.equal(claim.kind, 'habit', text);
    assert.equal(claim.eventTime.kind, 'habitual', text);
    assert.equal(claim.factuality.mode, 'asserted', text);
  }
  assert.equal(
    onlyClaim('你一直这样的话', 'persona_reply').factuality.mode,
    'hypothetical',
  );
});

test('accepts natural direct boundary modifiers while preserving denial and ownership', () => {
  for (const text of [
    '我真的只想被听见',
    '我就只想被听见',
    '我现在就只想被听见',
    '我当时只想被听见',
  ]) {
    const claim = onlyClaim(text);
    assert.equal(claim.kind, 'state', text);
    assert.equal(claim.actor, 'user', text);
    assert.equal(claim.attributedOwner, 'user', text);
    assert.equal(claim.boundaryCategory, 'listen', text);
    assert.equal(claim.factuality.mode, 'asserted', text);
  }
  assert.equal(onlyClaim('我不是只想被听见').factuality.mode, 'negated');
  assert.equal(onlyClaim('小王只想被听见').attributedOwner, 'third');
});

test('matches only asserted claims with the same roles, time, and semantic category', () => {
  const source = onlyClaim('昨天你替我安排了下一步');
  const supported = onlyClaim('我昨天替你安排了下一步', 'persona_reply');
  assert.equal(isHistoricalClaimSupported(supported, [source]), true);

  const wrongRecipient = onlyClaim(
    '我昨天替小王安排了下一步',
    'persona_reply',
  );
  const wrongTime = onlyClaim('我上次替你安排了下一步', 'persona_reply');
  const hypothetical = onlyClaim(
    '我昨天如果替你安排了下一步',
    'persona_reply',
  );
  assert.equal(isHistoricalClaimSupported(wrongRecipient, [source]), false);
  assert.equal(isHistoricalClaimSupported(wrongTime, [source]), false);
  assert.equal(isHistoricalClaimSupported(hypothetical, [source]), false);

  const permission = onlyClaim('你有权沉默', 'persona_reply');
  assert.equal(isHistoricalClaimSupported(permission, []), true);
  const habit = onlyClaim('你一直不回答', 'persona_reply');
  assert.equal(isHistoricalClaimSupported(habit, []), false);
});

test('matches speech content time and corrected ownership, not just similar words', () => {
  const source = onlyClaim('我上次说你昨天只想被听见');
  const same = onlyClaim(
    '你上次说我昨天只想被听见',
    'persona_reply',
  );
  assert.equal(isHistoricalClaimSupported(same, [source]), true);

  const differentContentTime = onlyClaim(
    '你上次说我今天只想被听见',
    'persona_reply',
  );
  assert.equal(
    isHistoricalClaimSupported(differentContentTime, [source]),
    false,
  );

  const relayed = onlyClaim('我昨天转述小王说只想被听见');
  const selfOwned = onlyClaim(
    '你昨天说过只想被听见',
    'persona_reply',
  );
  assert.equal(isHistoricalClaimSupported(selfOwned, [relayed]), false);
});

test('keeps source locations tied to the original text after alias normalization', () => {
  const text = '前一句。上一次我明确说过只想被听见。';
  const claim = onlyClaim(text);
  assert.equal(claim.source.text, '上一次我明确说过只想被听见');
  assert.equal(text.slice(claim.source.start, claim.source.end), claim.source.text);
  assert.equal(claim.source.sentenceIndex, 1);
  assert.deepEqual(claim.eventTime, {
    kind: 'point',
    value: 'last_time',
    origin: 'explicit',
  });
});

test('attributes quoted, relayed, and postposed third-party boundaries to the third party', () => {
  const cases = [
    '我昨天说小王只想被听见',
    '我昨天引用小王说只想被听见',
    '我昨天复述她说只想被听见',
    '我昨天明确说过只想被听见的其实是小王',
    '我昨天明确说过只想被听见的并不是我',
    '我昨天明确说过只想被听见，这句话其实来自小王',
  ];
  const selfOwned = onlyClaim('你昨天说了只想被听见', 'persona_reply');
  for (const text of cases) {
    const claim = onlyClaim(text);
    assert.equal(claim.kind, 'speech', text);
    assert.equal(claim.actor, 'user', text);
    assert.equal(claim.attributedOwner, 'third', text);
    assert.equal(claim.predicate, 'boundary:listen:positive', text);
    assert.equal(isHistoricalClaimSupported(selfOwned, [claim]), false, text);
  }
});

test('propagates reviewer uncertainty variants to the compatible speech claim', () => {
  const candidate = onlyClaim(
    '你昨天说了只想被听见',
    'persona_reply',
  );
  for (const text of [
    '我昨天明确说过只想被听见，但我现在记不清了',
    '我可能记错了，我昨天明确说过只想被听见',
    '我不太确定，我昨天明确说过只想被听见',
  ]) {
    const source = onlyClaim(text);
    assert.equal(source.factuality.mode, 'uncertain', text);
    assert.equal(isHistoricalClaimSupported(candidate, [source]), false, text);
  }
});

test('keeps extended historical time markers distinguishable and matches generic completed past', () => {
  for (const text of [
    '昨天下午，我明确说过只想被听见',
    '昨天晚上，我明确说过只想被听见',
  ]) {
    const claim = onlyClaim(text);
    assert.equal(claim.eventTime.kind, 'point', text);
    assert.equal(
      claim.eventTime.kind === 'point' ? claim.eventTime.value : undefined,
      'yesterday',
      text,
    );
  }
  const lastChat = onlyClaim('上次聊天时，我明确说过只想被听见');
  assert.equal(
    lastChat.eventTime.kind === 'point' ? lastChat.eventTime.value : undefined,
    'last_time',
  );

  const lastWeek = onlyClaim('我上周说过只想被听见');
  const dayBeforeYesterday = onlyClaim(
    '你前天说过只想被听见',
    'persona_reply',
  );
  assert.equal(
    isHistoricalClaimSupported(dayBeforeYesterday, [lastWeek]),
    false,
  );

  const unspecifiedSource = onlyClaim('我说过只想被听见');
  const unspecifiedCandidate = onlyClaim(
    '你说过只想被听见',
    'persona_reply',
  );
  assert.equal(
    isHistoricalClaimSupported(unspecifiedCandidate, [unspecifiedSource]),
    true,
  );
});

test('targets named retractions and treats not-counting as a retraction operator', () => {
  const weather = onlyClaim(
    '我昨天明确说过只想被听见。后来撤回了关于天气的那番话',
  );
  assert.equal(weather.factuality.retractedBy, undefined);

  const notCounting = onlyClaim(
    '我昨天明确说过只想被听见。后来我说前面那句不作数',
  );
  assert.ok(notCounting.factuality.retractedBy);
  assert.equal(
    isHistoricalClaimSupported(
      onlyClaim('你昨天说过只想被听见', 'persona_reply'),
      [notCounting],
    ),
    false,
  );

  const targeted = analyzeHistoricalEvidence(
    '我昨天说过不想辞职。我昨天也说过只想被听见。后来撤回了只想被听见这几个字',
    'user_message',
  ).claims;
  assert.equal(targeted.length, 2);
  assert.equal(targeted[0]?.factuality.retractedBy, undefined);
  assert.ok(targeted[1]?.factuality.retractedBy);
});

test('treats additional pre-event condition operators as hypothetical only outside reported content', () => {
  const candidate = onlyClaim(
    '你上次说过只想被听见',
    'persona_reply',
  );
  for (const condition of ['即便', '纵使', '纵然', '假定']) {
    const source = onlyClaim(`我上次${condition}说过只想被听见`);
    assert.equal(source.factuality.mode, 'hypothetical', condition);
    assert.equal(isHistoricalClaimSupported(candidate, [source]), false, condition);
  }
  assert.equal(
    onlyClaim('我上次说即便累了也会停').factuality.mode,
    'asserted',
  );
});

test('classifies choice-based autonomy as standing permission', () => {
  for (const text of [
    '你一直都能选择不回答',
    '你一直有选择不回答的权利',
  ]) {
    const claim = onlyClaim(text, 'persona_reply');
    assert.equal(claim.kind, 'standing_permission', text);
    assert.equal(claim.actor, 'user', text);
    assert.deepEqual(claim.eventTime, { kind: 'standing' }, text);
    assert.equal(claim.predicate, 'permission:withhold_response', text);
    assert.equal(isHistoricalClaimSupported(claim, []), true, text);
  }
});

test('lets tail denial negate a previously parsed directed action', () => {
  const candidate = onlyClaim(
    '我昨天替你安排了下一步',
    'persona_reply',
  );
  for (const text of [
    '昨天你替我安排了下一步，其实没有',
    '昨天你替我安排了下一步，但最后没做',
  ]) {
    const source = onlyClaim(text);
    assert.equal(source.kind, 'directed_action', text);
    assert.equal(source.factuality.mode, 'negated', text);
    assert.equal(isHistoricalClaimSupported(candidate, [source]), false, text);
  }
});

test('preserves boundary residual content and content-level negation in matching', () => {
  const source = onlyClaim('我昨天说过只想被听见');
  const addedAdvice = onlyClaim(
    '你昨天说过只想被听见而且也想听建议',
    'persona_reply',
  );
  assert.equal(isHistoricalClaimSupported(addedAdvice, [source]), false);
  assert.notEqual(addedAdvice.predicate, source.predicate);

  const timedSource = onlyClaim('我上次说你昨天只想被听见');
  const negatedContent = onlyClaim(
    '你上次说我不是昨天只想被听见',
    'persona_reply',
  );
  assert.equal(negatedContent.contentPolarity, 'negative');
  assert.equal(isHistoricalClaimSupported(negatedContent, [timedSource]), false);
});

test('matches an explicitly clear omitted-content callback only to a verified specific speech', () => {
  const source = onlyClaim('我昨天明确说过只想被听见');
  const callback = onlyClaim(
    '你昨天已经说得很清楚',
    'persona_reply',
  );
  assert.equal(callback.contentSpecificity, 'omitted');
  assert.equal(callback.speechClarity, 'clear');
  assert.equal(callback.predicate, 'speech:content_omitted');
  assert.equal(isHistoricalClaimSupported(callback, [source]), true);

  const vague = onlyClaim('你昨天说过', 'persona_reply');
  assert.equal(vague.contentSpecificity, 'omitted');
  assert.equal(vague.speechClarity, undefined);
  assert.equal(isHistoricalClaimSupported(vague, [source]), false);
});

test('parses historical original-word constructions as speech claims', () => {
  const source = onlyClaim('昨天你说我最好休息');
  const originalWords = onlyClaim(
    '我昨天的原话是你最好休息',
    'persona_reply',
  );
  assert.equal(originalWords.kind, 'speech');
  assert.equal(originalWords.actor, 'persona');
  assert.equal(originalWords.attributedOwner, 'persona');
  assert.equal(originalWords.predicate, 'ROLE_USER最好休息');
  assert.equal(originalWords.factuality.mode, 'asserted');
  assert.equal(isHistoricalClaimSupported(originalWords, [source]), true);

  const direct = onlyClaim(
    '我昨天对你说你最好休息',
    'persona_reply',
  );
  assert.equal(isHistoricalClaimSupported(direct, [source]), true);
});
