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
  'deepseek/deepseek-v4-flash': {
    inputUsdPerMillion: 0.154,
    outputUsdPerMillion: 0.308,
    cacheReadUsdPerMillion: 0.00308,
    cacheWriteUsdPerMillion: 0.154,
  },
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
let spentCostUsd = 0;
let reservedCostUsd = 0;

function configuredBudgetUsd(): number | null {
  const raw = process.env.PERSONA16_EVAL_MAX_COST_USD;
  if (raw === undefined || raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('PERSONA16_EVAL_MAX_COST_USD 必须是大于 0 的美元金额');
  }
  return value;
}

function requestCostReservationUsd(input: {
  provider: Provider;
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  providerCallLimit: number;
}): number | null {
  const pricing = PRICING[`${input.provider}/${input.model}`];
  if (!pricing) return null;
  const encoder = new TextEncoder();
  const inputTokenUpperBound = (
    encoder.encode(input.system).byteLength
    + encoder.encode(input.prompt).byteLength
    + 4_096
  );
  const perCall = (
    inputTokenUpperBound * Math.max(pricing.inputUsdPerMillion, pricing.cacheWriteUsdPerMillion)
    + input.maxTokens * pricing.outputUsdPerMillion
  ) / 1_000_000;
  return perCall * input.providerCallLimit;
}

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
    reservedMaxCostUsd: number | null;
    run: (onUsage: (usage: Omit<ModelActualUsage, 'calls'>) => void) => Promise<T>;
  },
): Promise<T> {
  const budgetUsd = configuredBudgetUsd();
  if (budgetUsd !== null && input.reservedMaxCostUsd === null) {
    throw new Error(`无法为 ${input.provider}/${input.model} 计算费用，已在模型调用前停止`);
  }
  const reservation = input.reservedMaxCostUsd ?? 0;
  if (budgetUsd !== null && spentCostUsd + reservedCostUsd + reservation > budgetUsd) {
    throw new Error(
      `评测预算将超限：已花费 $${spentCostUsd.toFixed(6)}，进行中预留 $${reservedCostUsd.toFixed(6)}，下一调用最多 $${reservation.toFixed(6)}，上限 $${budgetUsd.toFixed(2)}`,
    );
  }
  reservedCostUsd += reservation;
  const startedAt = Date.now();
  const usage = emptyUsage();
  let succeeded = false;
  try {
    const result = await input.run((observed) => addUsage(usage, observed));
    succeeded = true;
    return result;
  } finally {
    reservedCostUsd = Math.max(0, reservedCostUsd - reservation);
    const observedCost = estimatedCostUsd(input.provider, input.model, usage);
    if (observedCost !== null) spentCostUsd += observedCost;
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
      estimatedCostUsd: observedCost,
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
    reservedMaxCostUsd: requestCostReservationUsd({
      provider: opts.provider,
      model: opts.model,
      system: opts.system.map((block) => block.text).join('\n\n'),
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      providerCallLimit: 1,
    }),
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
    reservedMaxCostUsd: requestCostReservationUsd({
      provider: opts.provider,
      model: opts.model,
      system: `${opts.system}\n${JSON.stringify(opts.schema)}`,
      prompt: opts.prompt,
      maxTokens: opts.maxTokens,
      providerCallLimit: opts.provider === 'deepseek' || opts.provider === 'aihubmix' ? 2 : 1,
    }),
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
  spentCostUsd = 0;
  reservedCostUsd = 0;
}

export function evaluationModelTelemetrySnapshot() {
  const budgetUsd = configuredBudgetUsd();
  return {
    pricingSourceDate: PRICING_SOURCE_DATE,
    pricingBasis: {
      'deepseek/deepseek-v4-flash': 'conservative USD pricing aligned with the local AIHubMix model catalog',
      'deepseek/deepseek-v4-pro': 'official USD API pricing: cache hit / miss / output',
      'anthropic/claude-sonnet-5': 'official introductory API pricing through 2026-08-31',
    },
    elapsedMs: Math.max(0, Date.now() - telemetryStartedAt),
    budget: budgetUsd === null ? null : {
      maxCostUsd: budgetUsd,
      spentCostUsd,
      reservedCostUsd,
      remainingCostUsd: Math.max(0, budgetUsd - spentCostUsd - reservedCostUsd),
    },
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
