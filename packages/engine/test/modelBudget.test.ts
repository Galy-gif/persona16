import assert from 'node:assert/strict';
import test from 'node:test';
import { createModelBudget, ModelBudgetExceededError } from '../src/runtime/modelBudget';

test('model budget reserves worst-case retries before a provider call', () => {
  const budget = createModelBudget({ maxReservedCalls: 10, maxReservedOutputTokens: 1_000, maxDurationMs: 10_000 });
  const reservation = budget.reserve('json', 400, 2);
  assert.equal(reservation.maxTokens, 400);
  assert.equal(budget.snapshot().reservedCalls, 2);
  assert.equal(budget.snapshot().reservedOutputTokens, 800);
  assert.equal(budget.reserve('partial', 200, 2).maxTokens, 100);
  assert.throws(() => budget.reserve('next', 100), (error: unknown) => {
    assert.equal((error as ModelBudgetExceededError).reason, 'tokens');
    return true;
  });
});

test('model budget rejects calls after the total deadline', () => {
  let now = 100;
  const budget = createModelBudget({ maxDurationMs: 50 }, () => now);
  now = 151;
  assert.throws(() => budget.reserve('late', 100), ModelBudgetExceededError);
});

test('model budget aggregates actual provider usage independently from reservations', () => {
  const budget = createModelBudget();
  const first = budget.reserve('director', 200);
  first.recordUsage({ inputTokens: 120, outputTokens: 35, cacheReadTokens: 40, cacheWriteTokens: 0 });
  const second = budget.reserve('persona', 400);
  second.recordUsage({ inputTokens: 180, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 80, estimatedCostUsd: 0.003 });

  assert.deepEqual(budget.snapshot().actualUsage, {
    calls: 2,
    inputTokens: 300,
    outputTokens: 125,
    cacheReadTokens: 40,
    cacheWriteTokens: 80,
    estimatedCostUsd: 0.003,
  });
});
