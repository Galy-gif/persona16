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
