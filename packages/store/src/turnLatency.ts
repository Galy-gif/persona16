import type { TurnObservability } from './types';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * 为 V2 latency snapshot 补充事务内持久化耗时。Legacy 数据保持原样。
 */
export function recordTurnPersistence(
  observability: TurnObservability | undefined,
  durationMs: number,
): void {
  const latency = record(observability?.latency);
  if (latency?.schemaVersion !== 2) return;
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const stages = record(latency.stagesMs) ?? {};
  const existingDuration = typeof stages.turn_persistence === 'number'
    && Number.isFinite(stages.turn_persistence)
    ? Math.max(0, stages.turn_persistence)
    : 0;
  latency.stagesMs = {
    ...stages,
    turn_persistence: existingDuration + safeDuration,
  };
  if (typeof latency.totalMs === 'number' && Number.isFinite(latency.totalMs)) {
    latency.totalMs = Math.max(0, latency.totalMs) + safeDuration;
  }
}
