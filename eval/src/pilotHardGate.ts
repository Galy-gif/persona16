export interface HardGateFallback {
  text: string;
  fallbackKind?: string;
  variantId?: string;
}

export interface HardGateValidation<
  Violation extends string,
  Observation extends string,
> {
  blockingViolations: readonly Violation[];
  qualityObservations: readonly Observation[];
}

export interface HardGateResult<
  Violation extends string,
  Observation extends string = never,
> {
  text: string;
  violations: Violation[];
  qualityObservations: Observation[];
  regenerated: boolean;
  scoreable: boolean;
  originalText: string;
  originalViolations: Violation[];
  originalQualityObservations: Observation[];
  originalModelScoreable: boolean;
  retryRecovered: boolean;
  attemptsUsed: number;
  modelText: string;
  modelViolations: Violation[];
  modelQualityObservations: Observation[];
  modelScoreable: boolean;
  deliverySource: 'model' | 'semantic_fallback';
  fallbackUsed: boolean;
  fallbackKind?: string;
  variantId?: string;
}

function normalizeValidation<
  Violation extends string,
  Observation extends string,
>(
  validation:
    | readonly Violation[]
    | HardGateValidation<Violation, Observation>,
): HardGateValidation<Violation, Observation> {
  return Array.isArray(validation)
    ? { blockingViolations: validation, qualityObservations: [] }
    : validation as HardGateValidation<Violation, Observation>;
}

function normalizeFallback(
  fallback: string | HardGateFallback,
): HardGateFallback {
  return typeof fallback === 'string' ? { text: fallback } : fallback;
}

export async function generateWithHardGate<
  Violation extends string,
  Observation extends string = never,
>(input: {
  attempts: number;
  generate: (attempt: number, previousViolations: readonly Violation[]) => Promise<string>;
  validate: (
    text: string,
  ) => readonly Violation[] | HardGateValidation<Violation, Observation>;
  fallback?: () => string | HardGateFallback | undefined;
}): Promise<HardGateResult<Violation, Observation>> {
  if (input.attempts < 1) throw new Error('硬门至少需要一次生成尝试');
  let text = '';
  let violations: Violation[] = [];
  let qualityObservations: Observation[] = [];
  let originalText = '';
  let originalViolations: Violation[] = [];
  let originalQualityObservations: Observation[] = [];
  for (let attempt = 0; attempt < input.attempts; attempt++) {
    text = await input.generate(attempt, violations);
    const validation = normalizeValidation(input.validate(text));
    violations = [...validation.blockingViolations];
    qualityObservations = [...validation.qualityObservations];
    if (attempt === 0) {
      originalText = text;
      originalViolations = [...violations];
      originalQualityObservations = [...qualityObservations];
    }
    if (violations.length === 0) {
      return {
        text,
        violations,
        qualityObservations,
        regenerated: attempt > 0,
        scoreable: true,
        originalText,
        originalViolations,
        originalQualityObservations,
        originalModelScoreable: originalViolations.length === 0,
        retryRecovered: attempt > 0,
        attemptsUsed: attempt + 1,
        modelText: text,
        modelViolations: [],
        modelQualityObservations: qualityObservations,
        modelScoreable: true,
        deliverySource: 'model',
        fallbackUsed: false,
      };
    }
  }
  const modelText = text;
  const modelViolations = [...violations];
  const modelQualityObservations = [...qualityObservations];
  const fallbackValue = input.fallback?.();
  if (fallbackValue) {
    const fallback = normalizeFallback(fallbackValue);
    const fallbackValidation = normalizeValidation(input.validate(fallback.text));
    const fallbackViolations = [...fallbackValidation.blockingViolations];
    const fallbackQualityObservations = [...fallbackValidation.qualityObservations];
    if (fallbackViolations.length === 0) {
      return {
        text: fallback.text,
        violations: [],
        qualityObservations: fallbackQualityObservations,
        regenerated: input.attempts > 1,
        scoreable: true,
        originalText,
        originalViolations,
        originalQualityObservations,
        originalModelScoreable: originalViolations.length === 0,
        retryRecovered: false,
        attemptsUsed: input.attempts,
        modelText,
        modelViolations,
        modelQualityObservations,
        modelScoreable: false,
        deliverySource: 'semantic_fallback',
        fallbackUsed: true,
        ...(fallback.fallbackKind ? { fallbackKind: fallback.fallbackKind } : {}),
        ...(fallback.variantId ? { variantId: fallback.variantId } : {}),
      };
    }
  }
  return {
    text,
    violations,
    qualityObservations,
    regenerated: input.attempts > 1,
    scoreable: false,
    originalText,
    originalViolations,
    originalQualityObservations,
    originalModelScoreable: originalViolations.length === 0,
    retryRecovered: false,
    attemptsUsed: input.attempts,
    modelText,
    modelViolations,
    modelQualityObservations,
    modelScoreable: false,
    deliverySource: 'model',
    fallbackUsed: false,
  };
}

/**
 * 统一人物、关系和房间评审的硬门：任一生成未通过时，Judge 不得运行。
 */
export async function judgeWhenScoreable<Verdict>(
  results: readonly { scoreable: boolean }[],
  runJudge: () => Promise<Verdict>,
): Promise<Verdict | null> {
  if (results.some((result) => !result.scoreable)) return null;
  return runJudge();
}
