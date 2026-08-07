import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parsePerformanceScenarioMap } from './performanceScenarioMap';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

function positiveInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`PERSONA16_PERF_LIMIT must be an integer between 1 and ${maximum}`);
  }
  return parsed;
}

function optionalTimestamp(name: 'PERSONA16_PERF_FROM' | 'PERSONA16_PERF_TO'): Date | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${name} must be an ISO-8601 timestamp`);
  return parsed;
}

const limit = positiveInteger(process.env.PERSONA16_PERF_LIMIT, 1_000, 5_000);
const from = optionalTimestamp('PERSONA16_PERF_FROM');
const to = optionalTimestamp('PERSONA16_PERF_TO');
if (from && to && from > to) throw new Error('PERSONA16_PERF_FROM must not be later than PERSONA16_PERF_TO');

function scenarioMap(): Record<string, string> | undefined {
  const path = process.env.PERSONA16_PERF_SCENARIO_MAP;
  if (!path) return undefined;
  return parsePerformanceScenarioMap(readFileSync(resolve(path), 'utf8'));
}

const scenarios = scenarioMap();

const pool = new Pool({ connectionString });

try {
  const result = await pool.query(
    `WITH scenario_map AS (
       SELECT key AS turn_id, value #>> '{}' AS scenario_id
       FROM jsonb_each(COALESCE($4::jsonb, '{}'::jsonb))
     )
     SELECT status,
            stop_reason AS "stopReason",
            build_version AS "buildVersion",
            prompt_version AS "promptVersion",
            provider,
            model,
            usage_json AS usage,
            latency_json AS latency,
            created_at AS "createdAt",
            updated_at AS "updatedAt",
            scenario_map.scenario_id AS "scenarioId"
     FROM turn_runs
     LEFT JOIN scenario_map ON scenario_map.turn_id = turn_runs.id
     WHERE ($1::timestamptz IS NULL OR created_at >= $1)
       AND ($2::timestamptz IS NULL OR created_at <= $2)
       AND ($4::jsonb IS NULL OR scenario_map.turn_id IS NOT NULL)
     ORDER BY created_at DESC
     LIMIT $3`,
    [from ?? null, to ?? null, limit, scenarios ? JSON.stringify(scenarios) : null],
  );
  for (const row of result.rows) process.stdout.write(`${JSON.stringify(row)}\n`);
} finally {
  await pool.end();
}
