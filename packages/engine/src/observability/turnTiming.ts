export const TURN_TIMING_STAGES = [
  'idempotency_lookup',
  'rate_limit',
  'turn_reservation',
  'safety',
  'confirmed_memory_read',
  'relationship_branch_read',
  'director',
  'persona_generation',
  'delivery_validation',
  'room_controller',
  'candidate_memory',
  'turn_persistence',
] as const;

export type TurnTimingStage = (typeof TURN_TIMING_STAGES)[number];

export const REPEATED_TURN_TIMING_STAGES = [
  'persona_generation',
  'delivery_validation',
  'room_controller',
] as const satisfies readonly TurnTimingStage[];

export type RepeatedTurnTimingStage = (typeof REPEATED_TURN_TIMING_STAGES)[number];

export interface TurnLatencySnapshot {
  schemaVersion: 2;
  totalMs: number;
  validatedOutputMs: number | null;
  /** @deprecated 保留一个兼容周期；其语义与 validatedOutputMs 相同。 */
  firstTokenMs: number | null;
  stagesMs: Partial<Record<TurnTimingStage, number>>;
  counts: Partial<Record<RepeatedTurnTimingStage, number>>;
  [key: string]: unknown;
}

export type TurnClock = () => number;

const repeatedStages = new Set<TurnTimingStage>(REPEATED_TURN_TIMING_STAGES);

function boundedDuration(startedAt: number, endedAt: number): number {
  return Math.max(0, endedAt - startedAt);
}

/**
 * 单个 Turn 共享的低基数计时器。它只保存固定阶段和数值，不接收 Prompt、正文或关系内容。
 */
export class TurnTimingRecorder {
  private readonly stagesMs: Partial<Record<TurnTimingStage, number>> = {};
  private readonly counts: Partial<Record<RepeatedTurnTimingStage, number>> = {};
  private validatedOutputAt: number | undefined;

  constructor(
    private readonly now: TurnClock = Date.now,
    private readonly startedAt = now(),
  ) {}

  async measure<T>(stage: TurnTimingStage, operation: () => Promise<T>): Promise<T> {
    const stageStartedAt = this.now();
    try {
      return await operation();
    } finally {
      this.record(stage, boundedDuration(stageStartedAt, this.now()));
    }
  }

  measureSync<T>(stage: TurnTimingStage, operation: () => T): T {
    const stageStartedAt = this.now();
    try {
      return operation();
    } finally {
      this.record(stage, boundedDuration(stageStartedAt, this.now()));
    }
  }

  record(stage: TurnTimingStage, durationMs: number): void {
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    this.stagesMs[stage] = (this.stagesMs[stage] ?? 0) + safeDuration;
    if (repeatedStages.has(stage)) {
      const repeated = stage as RepeatedTurnTimingStage;
      this.counts[repeated] = (this.counts[repeated] ?? 0) + 1;
    }
  }

  markValidatedOutput(at = this.now()): void {
    this.validatedOutputAt ??= at;
  }

  snapshot(endedAt = this.now()): TurnLatencySnapshot {
    const validatedOutputMs = this.validatedOutputAt === undefined
      ? null
      : boundedDuration(this.startedAt, this.validatedOutputAt);
    return {
      schemaVersion: 2,
      totalMs: boundedDuration(this.startedAt, endedAt),
      validatedOutputMs,
      firstTokenMs: validatedOutputMs,
      stagesMs: { ...this.stagesMs },
      counts: { ...this.counts },
    };
  }
}

export function createTurnTimingRecorder(now: TurnClock = Date.now): TurnTimingRecorder {
  return new TurnTimingRecorder(now);
}
