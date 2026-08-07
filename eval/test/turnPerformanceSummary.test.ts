import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nearestRankPercentile,
  summarizeTurnPerformance,
  type TurnPerformanceSample,
} from '../src/turnPerformanceSummary';

test('performance summary accepts legacy and V2 latency without treating missing stages as zero', () => {
  const samples: TurnPerformanceSample[] = [
    {
      status: 'completed', stopReason: 'complete', buildVersion: 'build-a', promptVersion: 'prompt-a',
      provider: 'fake', model: 'model-a',
      message: '不应进入报告的用户原文', trace: { privateRelationship: '不应进入报告的关系内容' },
      usage: { calls: 1, inputTokens: 100, outputTokens: 20 },
      latency: { totalMs: 100, firstTokenMs: 80 },
    },
    {
      status: 'completed', stopReason: 'complete', buildVersion: 'build-a', promptVersion: 'prompt-a',
      provider: 'fake', model: 'model-a', scenarioId: 'greeting',
      usage: { calls: 2, inputTokens: 200, outputTokens: 40, cacheReadTokens: 50, estimatedCostUsd: 0.01 },
      latency: {
        schemaVersion: 2,
        totalMs: 200,
        validatedOutputMs: 180,
        firstTokenMs: 180,
        stagesMs: { safety: 20, persona_generation: 100 },
        counts: { persona_generation: 1 },
      },
    },
    {
      status: 'failed', stop_reason: 'error', build_version: 'build-b', prompt_version: 'prompt-a',
      provider: 'fake', model: 'model-a',
      usage_json: { calls: 3, inputTokens: 300, outputTokens: 60, cacheWriteTokens: 25 },
      latency_json: {
        v: 2,
        totalMs: 300,
        validatedOutputMs: 250,
        stages: { persona_generation: { totalMs: 200 } },
        counts: { persona_generation: 2 },
      },
    },
    { status: 'active', provider: 'fake', model: 'model-b' },
  ];

  const report = summarizeTurnPerformance(samples, { generatedAt: '2026-08-06T00:00:00.000Z' });

  assert.equal(report.sampleCount, 4);
  assert.deepEqual(report.overall.sourceFormats, { legacy: 1, v2: 2, missing: 1 });
  assert.deepEqual(report.overall.latency.totalMs, { count: 3, p50Ms: 200, p95Ms: 300, maxMs: 300 });
  assert.deepEqual(report.overall.latency.validatedOutputMs, { count: 3, p50Ms: 180, p95Ms: 250, maxMs: 250 });
  assert.equal(report.overall.coverage.totalMs.ratio, 0.75);
  assert.equal(report.overall.coverage.stages.safety.ratio, 0.25);
  assert.deepEqual(report.overall.stages.persona_generation, { count: 2, p50Ms: 100, p95Ms: 200, maxMs: 200 });
  assert.equal(report.overall.stages.safety?.p50Ms, 20);
  assert.equal(report.overall.repeatedStageCounts.persona_generation, 3);
  assert.deepEqual(report.overall.usage, {
    calls: 6,
    inputTokens: 600,
    outputTokens: 120,
    cacheReadTokens: 50,
    cacheWriteTokens: 25,
    estimatedCostUsd: 0.01,
  });
  assert.equal(report.overall.coverage.usage.estimatedCostUsd.ratio, 0.25);
  assert.deepEqual(report.metadataSets.scenarios, ['greeting', 'unclassified']);
  assert.deepEqual(Object.keys(report.byStatus), ['active', 'completed', 'failed']);
  assert.doesNotMatch(JSON.stringify(report), /不应进入报告/);
});

test('invalid negative and non-finite metrics are missing rather than zero', () => {
  const report = summarizeTurnPerformance([
    {
      latency: {
        schemaVersion: 2,
        totalMs: -1,
        validatedOutputMs: Number.NaN,
        stagesMs: { safety: -5, director: 0 },
      },
      usage: { calls: -1, inputTokens: Number.POSITIVE_INFINITY, outputTokens: 0 },
    },
  ], { generatedAt: '2026-08-06T00:00:00.000Z' });

  assert.equal(report.overall.latency.totalMs, null);
  assert.equal(report.overall.coverage.totalMs.present, 0);
  assert.equal(report.overall.stages.safety, null);
  assert.deepEqual(report.overall.stages.director, { count: 1, p50Ms: 0, p95Ms: 0, maxMs: 0 });
  assert.equal(report.overall.coverage.usage.calls.present, 0);
  assert.equal(report.overall.coverage.usage.outputTokens.present, 1);
});

test('nearest-rank percentile is deterministic and rejects invalid input', () => {
  assert.equal(nearestRankPercentile([50, 10, 40, 20, 30], 0.5), 30);
  assert.equal(nearestRankPercentile([50, 10, 40, 20, 30], 0.95), 50);
  assert.throws(() => nearestRankPercentile([], 0.5), /at least one/);
  assert.throws(() => nearestRankPercentile([1], 0), /fraction/);
});
