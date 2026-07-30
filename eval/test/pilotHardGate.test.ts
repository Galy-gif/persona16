import assert from 'node:assert/strict';
import test from 'node:test';
import { generateWithHardGate, judgeWhenScoreable } from '../src/pilotHardGate';

test('hard gate rejects an unclean final attempt instead of returning scoreable text', async () => {
  const result = await generateWithHardGate({
    attempts: 3,
    generate: async (attempt) => `（第${attempt + 1}次仍在做动作）`,
    validate: () => ['embodied_stage_direction'] as const,
  });

  assert.equal(result.scoreable, false);
  assert.equal(result.regenerated, true);
  assert.deepEqual(result.violations, ['embodied_stage_direction']);
  assert.match(result.text, /第3次/);
  assert.equal(result.modelScoreable, false);
  assert.equal(result.deliverySource, 'model');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.originalText, '（第1次仍在做动作）');
  assert.deepEqual(result.originalViolations, ['embodied_stage_direction']);
  assert.equal(result.originalModelScoreable, false);
  assert.equal(result.retryRecovered, false);
  assert.equal(result.attemptsUsed, 3);
});

test('hard gate accepts the first clean regeneration', async () => {
  const result = await generateWithHardGate({
    attempts: 3,
    generate: async (attempt) => attempt === 0 ? '（递给你一杯水）' : '你继续说，我在听。',
    validate: (text) => text.startsWith('（') ? ['embodied_stage_direction'] as const : [],
  });

  assert.equal(result.scoreable, true);
  assert.equal(result.regenerated, true);
  assert.deepEqual(result.violations, []);
  assert.equal(result.text, '你继续说，我在听。');
  assert.equal(result.modelScoreable, true);
  assert.equal(result.deliverySource, 'model');
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.originalModelScoreable, false);
  assert.equal(result.retryRecovered, true);
  assert.equal(result.attemptsUsed, 2);
});

test('hard gate records model failure separately when a semantic fallback is delivered', async () => {
  const result = await generateWithHardGate({
    attempts: 2,
    generate: async () => '你想让我听，还是给建议？',
    validate: (text) => text.includes('还是') ? ['forbidden_menu'] as const : [],
    fallback: () => ({
      text: '嗯，我听着。',
      fallbackKind: 'listen',
      variantId: 'isfj-listen-v1',
    }),
  });

  assert.equal(result.scoreable, true);
  assert.equal(result.modelScoreable, false);
  assert.equal(result.text, '嗯，我听着。');
  assert.equal(result.deliverySource, 'semantic_fallback');
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.modelViolations, ['forbidden_menu']);
  assert.equal(result.originalModelScoreable, false);
  assert.equal(result.retryRecovered, false);
  assert.equal(result.attemptsUsed, 2);
  assert.equal(result.fallbackKind, 'listen');
  assert.equal(result.variantId, 'isfj-listen-v1');
});

test('quality observations are recorded without causing retry or fallback', async () => {
  let generationCalls = 0;
  let fallbackCalls = 0;
  const result = await generateWithHardGate({
    attempts: 2,
    generate: async () => {
      generationCalls += 1;
      return '我理解错了。';
    },
    validate: () => ({
      blockingViolations: [],
      qualityObservations: ['user_wording_not_preserved'] as const,
    }),
    fallback: () => {
      fallbackCalls += 1;
      return '我理解错了：你不是害怕失败。';
    },
  });

  assert.equal(result.scoreable, true);
  assert.equal(result.deliverySource, 'model');
  assert.equal(result.attemptsUsed, 1);
  assert.equal(result.retryRecovered, false);
  assert.deepEqual(result.qualityObservations, ['user_wording_not_preserved']);
  assert.equal(generationCalls, 1);
  assert.equal(fallbackCalls, 0);
});

for (const scope of ['character', 'relationship', 'room'] as const) {
  test(`${scope} orchestration never calls Judge after hard-gate rejection`, async () => {
    let judgeCalls = 0;
    const verdict = await judgeWhenScoreable(
      [{ scoreable: true }, { scoreable: false }],
      async () => {
        judgeCalls += 1;
        return { passed: true };
      },
    );

    assert.equal(verdict, null);
    assert.equal(judgeCalls, 0);
  });
}

test('orchestration calls Judge once when every generation is scoreable', async () => {
  let judgeCalls = 0;
  const verdict = await judgeWhenScoreable(
    [{ scoreable: true }, { scoreable: true }],
    async () => {
      judgeCalls += 1;
      return { passed: true };
    },
  );

  assert.deepEqual(verdict, { passed: true });
  assert.equal(judgeCalls, 1);
});
