import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateLiteralToneMarkerFrequency } from '../src/pilotExpressionPatterns';

test('literal tone markers may be rare but fail when they become a batch watermark', () => {
  const mostlyNatural = [
    '这件事先别急着下结论。',
    '（小声）我只补一句。',
    '你已经说清楚了，那就停在这里。',
    '先看明天会改变决定的那个约束。',
    '我听着，你继续。',
    '这不是要不要坚持的问题。',
    '那次越界是我替你安排了下一步。',
    '先把高兴说完，别急着分析。',
    '这次不用我补充。',
  ].map((text, index) => ({ id: `sample-${index + 1}`, text }));
  const repeatedOpening = mostlyNatural.map((sample, index) => ({
    ...sample,
    text: index < 3 ? `（小声）${sample.text}` : sample.text,
  }));

  const naturalGate = evaluateLiteralToneMarkerFrequency(mostlyNatural);
  assert.equal(naturalGate.passed, true);
  assert.equal(naturalGate.literalMarkerCount, 1);
  assert.equal(naturalGate.maxAllowedLiteralMarkers, 1);

  const watermarkGate = evaluateLiteralToneMarkerFrequency(repeatedOpening);
  assert.equal(watermarkGate.passed, false);
  assert.deepEqual(watermarkGate.violations, [
    'literal_tone_marker_frequency_exceeded',
    'repeated_tone_marker_watermark',
  ]);
  assert.deepEqual(watermarkGate.markerCounts, { '（小声）': 4 });
});

test('inline tone directions count but ordinary explanatory parentheses do not', () => {
  const gate = evaluateLiteralToneMarkerFrequency([
    { id: 'one', text: '我只补一句（不是反问）：你现在最担心哪笔支出？' },
    { id: 'two', text: '嗯！（顿了一下）这句我信。' },
  ]);

  assert.equal(gate.literalMarkerCount, 1);
  assert.deepEqual(gate.markerCounts, { '（顿了一下）': 1 });
  assert.equal(gate.passed, true);
});

test('repeated inline tone directions cannot evade the batch watermark gate', () => {
  const gate = evaluateLiteralToneMarkerFrequency(Array.from({ length: 9 }, (_, index) => ({
    id: `sample-${index + 1}`,
    text: index < 2 ? '知道了。（安静了一会儿）你继续。' : '知道了，你继续。',
  })));

  assert.equal(gate.passed, false);
  assert.equal(gate.literalMarkerCount, 2);
  assert.ok(gate.violations.includes('literal_tone_marker_frequency_exceeded'));
  assert.ok(gate.violations.includes('repeated_tone_marker_watermark'));
});

test('consecutive opening markers are counted individually', () => {
  const gate = evaluateLiteralToneMarkerFrequency([
    { id: 'one', text: '（小声）（认真）我只补一句。' },
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `plain-${index + 1}`,
      text: '直接说话。',
    })),
  ]);

  assert.equal(gate.literalMarkerCount, 2);
  assert.deepEqual(gate.markerCounts, { '（小声）': 1, '（认真）': 1 });
  assert.ok(gate.violations.includes('literal_tone_marker_frequency_exceeded'));
});
