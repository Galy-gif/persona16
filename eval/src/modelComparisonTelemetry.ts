import {
  chatJson,
  chatText,
  type ChatJsonOpts,
  type ChatTextOpts,
  type ModelActualUsage,
  type Provider,
} from '@persona16/engine';

export type EvaluationModelRole = 'candidate' | 'judge' | 'arbitrator';

interface EvaluationModelCall {
  role: EvaluationModelRole;
  operation: string;
  provider: Provider;
  model: string;
  logicalCallCount: 1;
  providerCallCount: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number | null;
  succeeded: boolean;
}

interface ModelPricing {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
  cacheReadUsdPerMillion: number;
  cacheWriteUsdPerMillion: number;
}

const PRICING_SOURCE_DATE = '2026-07-27';
const PRICING: Record<string, ModelPricing> = {
  'deepseek/deepseek-v4-pro': {
    inputUsdPerMillion: 0.435,
    outputUsdPerMillion: 0.87,
    cacheReadUsdPerMillion: 0.003625,
    cacheWriteUsdPerMillion: 0.435,
  },
  'anthropic/claude-sonnet-5': {
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
    cacheReadUsdPerMillion: 0.2,
    cacheWriteUsdPerMillion: 2.5,
  },
};

const calls: EvaluationModelCall[] = [];
let telemetryStartedAt = Date.now();

function emptyUsage(): ModelActualUsage {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function addUsage(
  target: ModelActualUsage,
  usage: Omit<ModelActualUsage, 'calls'>,
): void {
  target.calls += 1;
  target.inputTokens += Math.max(0, usage.inputTokens);
  target.outputTokens += Math.max(0, usage.outputTokens);
  target.cacheReadTokens += Math.max(0, usage.cacheReadTokens);
  target.cacheWriteTokens += Math.max(0, usage.cacheWriteTokens);
}

function estimatedCostUsd(
  provider: Provider,
  model: string,
  usage: ModelActualUsage,
): number | null {
  const pricing = PRICING[`${provider}/${model}`];
  if (!pricing) return null;
  const cacheSplitAvailable = usage.cacheReadTokens + usage.cacheWriteTokens > 0;
  const ordinaryInputTokens = provider === 'deepseek' && cacheSplitAvailable
    ? 0
    : usage.inputTokens;
  return (
    ordinaryInputTokens * pricing.inputUsdPerMillion
    + usage.outputTokens * pricing.outputUsdPerMillion
    + usage.cacheReadTokens * pricing.cacheReadUsdPerMillion
    + usage.cacheWriteTokens * pricing.cacheWriteUsdPerMillion
  ) / 1_000_000;
}

async function measured<T>(
  input: {
    role: EvaluationModelRole;
    operation: string;
    provider: Provider;
    model: string;
    run: (onUsage: (usage: Omit<ModelActualUsage, 'calls'>) => void) => Promise<T>;
  },
): Promise<T> {
  const startedAt = Date.now();
  const usage = emptyUsage();
  let succeeded = false;
  try {
    const result = await input.run((observed) => addUsage(usage, observed));
    succeeded = true;
    return result;
  } finally {
    calls.push({
      role: input.role,
      operation: input.operation,
      provider: input.provider,
      model: input.model,
      logicalCallCount: 1,
      providerCallCount: Math.max(1, usage.calls),
      durationMs: Math.max(0, Date.now() - startedAt),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      estimatedCostUsd: estimatedCostUsd(input.provider, input.model, usage),
      succeeded,
    });
  }
}

export async function measuredChatText(
  role: EvaluationModelRole,
  operation: string,
  opts: ChatTextOpts & { provider: Provider },
): Promise<string> {
  return measured({
    role,
    operation,
    provider: opts.provider,
    model: opts.model,
    run: (onUsage) => chatText({
      ...opts,
      onUsage: (usage) => {
        onUsage(usage);
        opts.onUsage?.(usage);
      },
    }),
  });
}

export async function measuredChatJson<T>(
  role: EvaluationModelRole,
  operation: string,
  opts: ChatJsonOpts & { provider: Provider },
): Promise<T> {
  return measured({
    role,
    operation,
    provider: opts.provider,
    model: opts.model,
    run: (onUsage) => chatJson<T>({
      ...opts,
      onUsage: (usage) => {
        onUsage(usage);
        opts.onUsage?.(usage);
      },
    }),
  });
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)]!;
}

function summarize(group: readonly EvaluationModelCall[]) {
  const knownCosts = group
    .map(({ estimatedCostUsd: cost }) => cost)
    .filter((cost): cost is number => cost !== null);
  const durations = group.map(({ durationMs }) => durationMs);
  return {
    logicalCallCount: group.length,
    providerCallCount: group.reduce((sum, call) => sum + call.providerCallCount, 0),
    failedLogicalCallCount: group.filter(({ succeeded }) => !succeeded).length,
    inputTokens: group.reduce((sum, call) => sum + call.inputTokens, 0),
    outputTokens: group.reduce((sum, call) => sum + call.outputTokens, 0),
    cacheReadTokens: group.reduce((sum, call) => sum + call.cacheReadTokens, 0),
    cacheWriteTokens: group.reduce((sum, call) => sum + call.cacheWriteTokens, 0),
    meanLogicalCallLatencyMs: group.length === 0
      ? 0
      : Math.round(durations.reduce((sum, duration) => sum + duration, 0) / group.length),
    p50LogicalCallLatencyMs: percentile(durations, 0.5),
    p95LogicalCallLatencyMs: percentile(durations, 0.95),
    estimatedCostUsd: knownCosts.length === group.length
      ? knownCosts.reduce((sum, cost) => sum + cost, 0)
      : null,
  };
}

export function resetEvaluationModelTelemetry(): void {
  calls.length = 0;
  telemetryStartedAt = Date.now();
}

export function evaluationModelTelemetrySnapshot() {
  return {
    pricingSourceDate: PRICING_SOURCE_DATE,
    pricingBasis: {
      'deepseek/deepseek-v4-pro': 'official USD API pricing: cache hit / miss / output',
      'anthropic/claude-sonnet-5': 'official introductory API pricing through 2026-08-31',
    },
    elapsedMs: Math.max(0, Date.now() - telemetryStartedAt),
    total: summarize(calls),
    byRole: Object.fromEntries(
      (['candidate', 'judge', 'arbitrator'] as const).map((role) => [
        role,
        summarize(calls.filter((call) => call.role === role)),
      ]),
    ),
    byProviderModel: Object.fromEntries(
      [...new Set(calls.map(({ provider, model }) => `${provider}/${model}`))]
        .map((key) => [
          key,
          summarize(calls.filter(({ provider, model }) => `${provider}/${model}` === key)),
        ]),
    ),
  };
}
