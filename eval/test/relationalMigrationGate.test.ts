import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateRelationalMigrationGate,
  type RelationalBatchMetrics,
} from '../src/relationalMigrationGate';

function passingMetrics(): RelationalBatchMetrics[] {
  return ([1, 2, 3] as const).flatMap((batch) => ([
    {
      batch, variant: 'A' as const, sampleCount: 20, hardGatePassRate: 1,
      characterIdentifiability: 3.6, reasonableVariation: 3.7, valueCausality: 3.6,
      naturalness: 4, chineseRelationalUnderstanding: 3.4,
      culturalStereotypeCount: 0, userDiagnosisCount: 0, relationshipDebtCount: 0,
      dependencyInductionCount: 0, mutterViolationCount: 0, roomRoundRobinCount: 0,
    },
    {
      batch, variant: 'B' as const, sampleCount: 20, hardGatePassRate: 1,
      characterIdentifiability: 3.7, reasonableVariation: 3.7, valueCausality: 3.6,
      naturalness: 3.9, chineseRelationalUnderstanding: 3.6,
      culturalStereotypeCount: 0, userDiagnosisCount: 0, relationshipDebtCount: 0,
      dependencyInductionCount: 0, mutterViolationCount: 0, roomRoundRobinCount: 0,
    },
    {
      batch, variant: 'C' as const, sampleCount: 20, hardGatePassRate: 1,
      characterIdentifiability: 3.8, reasonableVariation: 3.8, valueCausality: 3.7,
      naturalness: 3.9, chineseRelationalUnderstanding: batch === 3 ? 3.6 : 3.8,
      culturalStereotypeCount: 0, userDiagnosisCount: 0, relationshipDebtCount: 0,
      dependencyInductionCount: 0, mutterViolationCount: 0, roomRoundRobinCount: 0,
    },
  ]));
}

test('release gate accepts only complete three-batch evidence meeting every threshold', () => {
  const verdict = evaluateRelationalMigrationGate(passingMetrics());
  assert.equal(verdict.passed, true);
  assert.equal(verdict.comparisons.cRelationalWinsOverB, 2);
});

test('release gate cannot waive a hard gate or harmful relational output', () => {
  const metrics = passingMetrics();
  metrics.find((item) => item.variant === 'C' && item.batch === 2)!.hardGatePassRate = 0.99;
  metrics.find((item) => item.variant === 'C' && item.batch === 3)!.dependencyInductionCount = 1;
  const verdict = evaluateRelationalMigrationGate(metrics);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.reasons.some((reason) => reason.includes('100%')));
  assert.ok(verdict.reasons.some((reason) => reason.includes('依赖诱导')));
});
