import {
  TURN_TIMING_STAGES,
  type TurnTimingStage,
} from '@persona16/engine';

export { TURN_TIMING_STAGES };

export interface TurnPerformanceSample extends Record<string, unknown> {
  status?: unknown;
  stopReason?: unknown;
  stop_reason?: unknown;
  buildVersion?: unknown;
  build_version?: unknown;
  promptVersion?: unknown;
  prompt_version?: unknown;
  provider?: unknown;
  model?: unknown;
  scenarioId?: unknown;
  scenario_id?: unknown;
  usage?: unknown;
  usage_json?: unknown;
  latency?: unknown;
  latency_json?: unknown;
}

export interface MetricCoverage {
  present: number;
  total: number;
  ratio: number;
}

export interface DurationDistribution {
  count: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

export interface PerformanceGroupSummary {
  sampleCount: number;
  sourceFormats: {
    legacy: number;
    v2: number;
    missing: number;
  };
  coverage: {
    totalMs: MetricCoverage;
    validatedOutputMs: MetricCoverage;
    stages: Record<TurnTimingStage, MetricCoverage>;
    usage: Record<UsageMetric, MetricCoverage>;
  };
  latency: {
    totalMs: DurationDistribution | null;
    validatedOutputMs: DurationDistribution | null;
  };
  stages: Record<TurnTimingStage, DurationDistribution | null>;
  repeatedStageCounts: Partial<Record<TurnTimingStage, number>>;
  usage: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    estimatedCostUsd: number | null;
  };
}

export interface TurnPerformanceReport {
  schemaVersion: 1;
  generatedAt: string;
  sampleCount: number;
  metadataSets: {
    buildVersions: string[];
    promptVersions: string[];
    providers: string[];
    models: string[];
    scenarios: string[];
  };
  overall: PerformanceGroupSummary;
  byStatus: Record<string, PerformanceGroupSummary>;
  byStopReason: Record<string, PerformanceGroupSummary>;
  byProviderModel: Record<string, PerformanceGroupSummary>;
  byBuildPrompt: Record<string, PerformanceGroupSummary>;
  byScenario: Record<string, PerformanceGroupSummary>;
}

const USAGE_METRICS = [
  'calls',
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'estimatedCostUsd',
] as const;
type UsageMetric = typeof USAGE_METRICS[number];
type RecordValue = Record<string, unknown>;

interface NormalizedSample {
  status: string;
  stopReason: string;
  buildVersion: string;
  promptVersion: string;
  provider: string;
  model: string;
  scenario: string;
  sourceFormat: 'legacy' | 'v2' | 'missing';
  totalMs?: number;
  validatedOutputMs?: number;
  stages: Partial<Record<TurnTimingStage, number>>;
  counts: Partial<Record<TurnTimingStage, number>>;
  usage: Partial<Record<UsageMetric, number>>;
}

function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function field(sample: TurnPerformanceSample, camel: string, snake: string): unknown {
  return sample[camel] ?? sample[snake];
}

function stageDuration(value: unknown): number | undefined {
  const direct = nonNegativeNumber(value);
  if (direct !== undefined) return direct;
  return nonNegativeNumber(record(value)?.totalMs);
}

function normalize(sample: TurnPerformanceSample): NormalizedSample {
  const latency = record(sample.latency ?? sample.latency_json);
  const usage = record(sample.usage ?? sample.usage_json);
  const stagesRecord = record(latency?.stagesMs ?? latency?.stages);
  const countsRecord = record(latency?.counts);
  const v2 = latency !== undefined && (
    latency.schemaVersion === 2
    || latency.v === 2
    || stagesRecord !== undefined
    || 'validatedOutputMs' in latency
  );
  const stages: Partial<Record<TurnTimingStage, number>> = {};
  const counts: Partial<Record<TurnTimingStage, number>> = {};
  for (const stage of TURN_TIMING_STAGES) {
    const duration = stageDuration(stagesRecord?.[stage]);
    if (duration !== undefined) stages[stage] = duration;
    const count = nonNegativeNumber(countsRecord?.[stage]);
    if (count !== undefined) counts[stage] = count;
  }
  const normalizedUsage: Partial<Record<UsageMetric, number>> = {};
  for (const metric of USAGE_METRICS) {
    const value = nonNegativeNumber(usage?.[metric]);
    if (value !== undefined) normalizedUsage[metric] = value;
  }
  return {
    status: text(sample.status, 'unknown'),
    stopReason: text(field(sample, 'stopReason', 'stop_reason'), 'none'),
    buildVersion: text(field(sample, 'buildVersion', 'build_version'), 'unknown'),
    promptVersion: text(field(sample, 'promptVersion', 'prompt_version'), 'unknown'),
    provider: text(sample.provider, 'unknown'),
    model: text(sample.model, 'unknown'),
    scenario: text(field(sample, 'scenarioId', 'scenario_id'), 'unclassified'),
    sourceFormat: latency ? (v2 ? 'v2' : 'legacy') : 'missing',
    totalMs: nonNegativeNumber(latency?.totalMs),
    validatedOutputMs: nonNegativeNumber(latency?.validatedOutputMs)
      ?? nonNegativeNumber(latency?.firstTokenMs),
    stages,
    counts,
    usage: normalizedUsage,
  };
}

function coverage(present: number, total: number): MetricCoverage {
  return { present, total, ratio: total === 0 ? 0 : present / total };
}

export function nearestRankPercentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) throw new Error('percentile requires at least one value');
  if (!(fraction > 0 && fraction <= 1)) throw new Error('fraction must be in (0, 1]');
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

function distribution(values: readonly number[]): DurationDistribution | null {
  if (values.length === 0) return null;
  return {
    count: values.length,
    p50Ms: nearestRankPercentile(values, 0.5),
    p95Ms: nearestRankPercentile(values, 0.95),
    maxMs: Math.max(...values),
  };
}

function summarizeGroup(samples: readonly NormalizedSample[]): PerformanceGroupSummary {
  const stages = {} as Record<TurnTimingStage, DurationDistribution | null>;
  const stageCoverage = {} as Record<TurnTimingStage, MetricCoverage>;
  const repeatedStageCounts: Partial<Record<TurnTimingStage, number>> = {};
  for (const stage of TURN_TIMING_STAGES) {
    const durations = samples.flatMap((sample) => sample.stages[stage] === undefined ? [] : [sample.stages[stage]]);
    stages[stage] = distribution(durations);
    stageCoverage[stage] = coverage(durations.length, samples.length);
    const observedCounts = samples.flatMap((sample) => sample.counts[stage] === undefined ? [] : [sample.counts[stage]]);
    if (observedCounts.length > 0) {
      repeatedStageCounts[stage] = observedCounts.reduce((sum, count) => sum + count, 0);
    }
  }
  const usageCoverage = {} as Record<UsageMetric, MetricCoverage>;
  for (const metric of USAGE_METRICS) {
    usageCoverage[metric] = coverage(samples.filter((sample) => sample.usage[metric] !== undefined).length, samples.length);
  }
  const sumUsage = (metric: Exclude<UsageMetric, 'estimatedCostUsd'>) => samples.reduce(
    (sum, sample) => sum + (sample.usage[metric] ?? 0),
    0,
  );
  const knownCosts = samples.flatMap((sample) => sample.usage.estimatedCostUsd === undefined
    ? []
    : [sample.usage.estimatedCostUsd]);
  const totalDurations = samples.flatMap((sample) => sample.totalMs === undefined ? [] : [sample.totalMs]);
  const validatedDurations = samples.flatMap((sample) => sample.validatedOutputMs === undefined
    ? []
    : [sample.validatedOutputMs]);
  return {
    sampleCount: samples.length,
    sourceFormats: {
      legacy: samples.filter(({ sourceFormat }) => sourceFormat === 'legacy').length,
      v2: samples.filter(({ sourceFormat }) => sourceFormat === 'v2').length,
      missing: samples.filter(({ sourceFormat }) => sourceFormat === 'missing').length,
    },
    coverage: {
      totalMs: coverage(totalDurations.length, samples.length),
      validatedOutputMs: coverage(validatedDurations.length, samples.length),
      stages: stageCoverage,
      usage: usageCoverage,
    },
    latency: {
      totalMs: distribution(totalDurations),
      validatedOutputMs: distribution(validatedDurations),
    },
    stages,
    repeatedStageCounts,
    usage: {
      calls: sumUsage('calls'),
      inputTokens: sumUsage('inputTokens'),
      outputTokens: sumUsage('outputTokens'),
      cacheReadTokens: sumUsage('cacheReadTokens'),
      cacheWriteTokens: sumUsage('cacheWriteTokens'),
      estimatedCostUsd: knownCosts.length === 0 ? null : knownCosts.reduce((sum, cost) => sum + cost, 0),
    },
  };
}

function grouped(
  samples: readonly NormalizedSample[],
  key: (sample: NormalizedSample) => string,
): Record<string, PerformanceGroupSummary> {
  const groups = new Map<string, NormalizedSample[]>();
  for (const sample of samples) groups.set(key(sample), [...(groups.get(key(sample)) ?? []), sample]);
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([groupKey, groupSamples]) => [groupKey, summarizeGroup(groupSamples)]),
  );
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function summarizeTurnPerformance(
  input: readonly TurnPerformanceSample[],
  options: { generatedAt?: string } = {},
): TurnPerformanceReport {
  const samples = input.map(normalize);
  return {
    schemaVersion: 1,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    sampleCount: samples.length,
    metadataSets: {
      buildVersions: uniqueSorted(samples.map(({ buildVersion }) => buildVersion)),
      promptVersions: uniqueSorted(samples.map(({ promptVersion }) => promptVersion)),
      providers: uniqueSorted(samples.map(({ provider }) => provider)),
      models: uniqueSorted(samples.map(({ model }) => model)),
      scenarios: uniqueSorted(samples.map(({ scenario }) => scenario)),
    },
    overall: summarizeGroup(samples),
    byStatus: grouped(samples, ({ status }) => status),
    byStopReason: grouped(samples, ({ stopReason }) => stopReason),
    byProviderModel: grouped(samples, ({ provider, model }) => `${provider}/${model}`),
    byBuildPrompt: grouped(samples, ({ buildVersion, promptVersion }) => `${buildVersion}/${promptVersion}`),
    byScenario: grouped(samples, ({ scenario }) => scenario),
  };
}
