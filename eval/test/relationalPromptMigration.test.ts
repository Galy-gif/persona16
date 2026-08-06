import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assembleRelationalMigrationCase,
  buildRelationalMigrationManifest,
} from '../src/relationalPromptMigrationAssembly';
import {
  RELATIONAL_MIGRATION_HARD_GATE_TAGS,
  RELATIONAL_MIGRATION_SCENARIOS,
} from '../src/relationalPromptMigrationScenarios';

test('migration corpus has 20 distinct scenarios and every required hard gate', () => {
  assert.equal(RELATIONAL_MIGRATION_SCENARIOS.length, 20);
  assert.equal(new Set(RELATIONAL_MIGRATION_SCENARIOS.map((scenario) => scenario.id)).size, 20);
  for (const tag of RELATIONAL_MIGRATION_HARD_GATE_TAGS) {
    assert.ok(RELATIONAL_MIGRATION_SCENARIOS.some((scenario) => scenario.tags.includes(tag)));
  }
});

test('A/B/C isolate the old baseline, IPC-only prompt, and full cultural relationship lens', () => {
  const scenario = RELATIONAL_MIGRATION_SCENARIOS[0]!;
  const render = (variant: 'A' | 'B' | 'C') => assembleRelationalMigrationCase({
    batch: 1,
    variant,
    agent: 'INTJ',
    scenario,
    generatedAt: '2026-08-07T01:00:00.000Z',
  });
  const a = render('A');
  const b = render('B');
  const c = render('C');
  const system = (sample: typeof a) => sample.system.map((block) => block.text).join('\n');

  assert.doesNotMatch(system(a), /关系型人物共同系统规则/u);
  assert.doesNotMatch(a.prompt, /动态上下文包/u);
  assert.match(system(b), /IPC 人际策略/u);
  assert.doesNotMatch(b.system.at(-1)?.text ?? '', /文化—关系镜头/u);
  assert.match(system(c), /IPC 人际策略/u);
  assert.match(system(c), /文化—关系镜头/u);
  assert.doesNotMatch(system(c), /直接输出你要说的话/u);
});

test('three blinded batches cover every combination and carry coverage plus mutter policy', () => {
  const manifest = buildRelationalMigrationManifest();
  assert.equal(manifest.length, 3 * 3 * 4 * 20);
  assert.equal(new Set(manifest.map((sample) => sample.id)).size, manifest.length);
  assert.equal(new Set(manifest.map((sample) => sample.blindId)).size, manifest.length);
  assert.deepEqual([...new Set(manifest.map((sample) => sample.batch))].sort(), [1, 2, 3]);

  for (const sample of manifest) {
    assert.notEqual(sample.dynamicContext.coverage.fromMessageId, 'unknown');
    assert.notEqual(sample.dynamicContext.coverage.throughMessageId, 'unknown');
    assert.notEqual(sample.dynamicContext.coverage.fromTurnId, 'unknown');
    assert.notEqual(sample.dynamicContext.coverage.throughTurnId, 'unknown');
    assert.ok(sample.dynamicContext.coverage.sourceMessageIds.length >= 1);
    if (sample.expectations.mutter === 'suppress') {
      assert.equal(sample.dynamicContext.mutterPolicy, 'suppress');
    }
  }
});
