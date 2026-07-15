export interface ModelBudgetLimits {
  maxReservedCalls: number;
  maxReservedOutputTokens: number;
  maxDurationMs: number;
}

export interface ModelBudgetSnapshot extends ModelBudgetLimits {
  reservedCalls: number;
  reservedOutputTokens: number;
  elapsedMs: number;
  actualUsage: ModelActualUsage;
}

export interface ModelActualUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd?: number;
}

export interface ModelCallReservation {
  maxTokens: number;
  signal(external?: AbortSignal): AbortSignal;
  recordUsage(usage: Omit<ModelActualUsage, 'calls'>): void;
}

export class ModelBudgetExceededError extends Error {
  constructor(public readonly reason: 'calls' | 'tokens' | 'duration') {
    super(`model budget exhausted: ${reason}`);
    this.name = 'ModelBudgetExceededError';
  }
}

export interface ModelBudget {
  reserve(label: string, requestedTokensPerAttempt: number, maxAttempts?: number): ModelCallReservation;
  snapshot(): ModelBudgetSnapshot;
}

export const DEFAULT_MODEL_BUDGET: ModelBudgetLimits = {
  // safety/director/controller 的 JSON 解析最多两次；人格最多 3 人 × 2 次。
  maxReservedCalls: 16,
  maxReservedOutputTokens: 15_000,
  maxDurationMs: 110_000,
};

export function createModelBudget(
  limits: Partial<ModelBudgetLimits> = {},
  now: () => number = Date.now,
): ModelBudget {
  const resolved = { ...DEFAULT_MODEL_BUDGET, ...limits };
  const startedAt = now();
  let reservedCalls = 0;
  let reservedOutputTokens = 0;
  const actualUsage: ModelActualUsage = {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  return {
    reserve(_label, requestedTokensPerAttempt, maxAttempts = 1) {
      const elapsed = now() - startedAt;
      if (elapsed >= resolved.maxDurationMs) throw new ModelBudgetExceededError('duration');
      if (reservedCalls + maxAttempts > resolved.maxReservedCalls) throw new ModelBudgetExceededError('calls');
      const remainingTokens = resolved.maxReservedOutputTokens - reservedOutputTokens;
      const maxTokens = Math.min(requestedTokensPerAttempt, Math.floor(remainingTokens / maxAttempts));
      if (maxTokens < 64) throw new ModelBudgetExceededError('tokens');
      reservedCalls += maxAttempts;
      reservedOutputTokens += maxTokens * maxAttempts;
      return {
        maxTokens,
        recordUsage(usage) {
          actualUsage.calls += 1;
          actualUsage.inputTokens += Math.max(0, usage.inputTokens);
          actualUsage.outputTokens += Math.max(0, usage.outputTokens);
          actualUsage.cacheReadTokens += Math.max(0, usage.cacheReadTokens);
          actualUsage.cacheWriteTokens += Math.max(0, usage.cacheWriteTokens);
          if (usage.estimatedCostUsd !== undefined) {
            actualUsage.estimatedCostUsd = (actualUsage.estimatedCostUsd ?? 0) + Math.max(0, usage.estimatedCostUsd);
          }
        },
        signal(external?: AbortSignal) {
          const remainingMs = Math.max(1, resolved.maxDurationMs - (now() - startedAt));
          const deadline = AbortSignal.timeout(remainingMs);
          return external ? AbortSignal.any([external, deadline]) : deadline;
        },
      };
    },
    snapshot() {
      return {
        ...resolved,
        reservedCalls,
        reservedOutputTokens,
        elapsedMs: Math.max(0, now() - startedAt),
        actualUsage: { ...actualUsage },
      };
    },
  };
}
