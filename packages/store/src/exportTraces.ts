import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const roomId = process.env.PERSONA16_TRACE_ROOM_ID;
const requestedLimit = Number(process.env.PERSONA16_TRACE_LIMIT ?? 100);
const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, Math.floor(requestedLimit))) : 100;
const pool = new Pool({ connectionString });

try {
  const result = await pool.query(
    `SELECT turn_runs.id, turn_runs.room_id, turn_runs.status, turn_runs.stop_reason,
            turn_runs.build_version, turn_runs.prompt_version, turn_runs.provider, turn_runs.model,
            turn_runs.usage_json, turn_runs.latency_json, turn_runs.trace_json,
            turn_runs.created_at, turn_runs.updated_at,
            COALESCE((
              SELECT jsonb_agg(jsonb_build_object('rating', feedback.rating, 'tags', feedback.tags))
              FROM feedback WHERE feedback.turn_id = turn_runs.id
            ), '[]'::jsonb) AS feedback
     FROM turn_runs
     WHERE ($1::text IS NULL OR turn_runs.room_id = $1)
     ORDER BY turn_runs.created_at DESC
     LIMIT $2`,
    [roomId ?? null, limit],
  );
  for (const row of result.rows) process.stdout.write(`${JSON.stringify(row)}\n`);
} finally {
  await pool.end();
}
