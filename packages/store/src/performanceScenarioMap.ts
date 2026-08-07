export function parsePerformanceScenarioMap(source: string): Record<string, string> {
  const parsed = JSON.parse(source) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('PERSONA16_PERF_SCENARIO_MAP must contain a JSON object');
  }
  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 5_000) {
    throw new Error('PERSONA16_PERF_SCENARIO_MAP must contain between 1 and 5000 turns');
  }
  const result: Record<string, string> = {};
  for (const [turnId, value] of entries) {
    if (!turnId || turnId.length > 128 || /[\u0000-\u001f]/u.test(turnId)) {
      throw new Error('scenario map contains an invalid turn id');
    }
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value)) {
      throw new Error('scenario ids must be lowercase stable ids up to 64 characters');
    }
    result[turnId] = value;
  }
  return result;
}
