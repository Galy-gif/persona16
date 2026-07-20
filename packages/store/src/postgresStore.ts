import { randomUUID } from 'node:crypto';
import type { AgentType, MemoryStatus, RoomState } from '@persona16/engine';
import { Pool, type PoolClient } from 'pg';
import type {
  CompleteTurnInput,
  CreateMemoryCandidatesInput,
  CreateRoomInput,
  FeedbackRecord,
  FeedbackTag,
  FailedTurnObservability,
  MemoryRecord,
  LookupTurnInput,
  PersistedTurnEvent,
  PersonaStore,
  ReserveTurnInput,
  RoomRecord,
  TurnReservation,
  TurnLookup,
  UpsertFeedbackInput,
  UpdateRoomInput,
} from './types';
import { StoreError } from './types';

const TURN_LEASE_MS = 180_000;

interface RoomRow {
  id: string;
  user_id: string;
  state_json: RoomState;
  version: number;
  status: RoomRecord['status'];
  active_turn_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface TurnRow {
  id: string;
  room_id: string;
  user_id: string;
  request_hash: string;
  status: 'active' | 'completed' | 'failed';
  result_room_version: number | null;
  base_history_length: number;
  updated_at: Date;
}

interface MemoryRow {
  id: string;
  user_id: string;
  agent_type: AgentType;
  kind: MemoryRecord['kind'];
  content: string;
  status: MemoryStatus;
  source_turn_id: string;
  source_message_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

interface FeedbackRow {
  id: string;
  user_id: string;
  room_id: string;
  turn_id: string | null;
  message_id: string;
  rating: FeedbackRecord['rating'];
  tags: FeedbackTag[];
  note: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRoom(row: RoomRow): RoomRecord {
  return {
    id: row.id, userId: row.user_id, state: row.state_json, version: row.version,
    status: row.status, activeTurnId: row.active_turn_id ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapMemory(row: MemoryRow): MemoryRecord {
  return {
    id: row.id, userId: row.user_id, agent: row.agent_type, kind: row.kind,
    content: row.content, status: row.status, sourceTurnId: row.source_turn_id,
    sourceMessageId: row.source_message_id ?? undefined, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

function mapFeedback(row: FeedbackRow): FeedbackRecord {
  return {
    id: row.id,
    userId: row.user_id,
    roomId: row.room_id,
    turnId: row.turn_id ?? undefined,
    messageId: row.message_id,
    rating: row.rating,
    tags: row.tags,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresPersonaStore implements PersonaStore {
  readonly pool: Pool;

  constructor(connection: string | Pool) {
    this.pool = typeof connection === 'string' ? new Pool({ connectionString: connection }) : connection;
  }

  async createRoom(input: CreateRoomInput): Promise<RoomRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, anonymous_id) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`,
        [input.userId],
      );
      const roomId = randomUUID();
      const result = await client.query<RoomRow>(
        `INSERT INTO rooms (id, user_id, state_json) VALUES ($1, $2, $3::jsonb)
         RETURNING id, user_id, state_json, version, status, active_turn_id, created_at, updated_at`,
        [roomId, input.userId, JSON.stringify(input.state)],
      );
      await client.query('COMMIT');
      return mapRoom(result.rows[0]!);
    } catch (error) {
      return this.rollbackAndRethrow(client, error);
    } finally {
      client.release();
    }
  }

  async getRoom(roomId: string, userId: string): Promise<RoomRecord> {
    const result = await this.pool.query<RoomRow>(
      `SELECT id, user_id, state_json, version, status, active_turn_id, created_at, updated_at
       FROM rooms WHERE id = $1 AND user_id = $2 AND status <> 'deleted'`,
      [roomId, userId],
    );
    if (!result.rows[0]) throw new StoreError('ROOM_NOT_FOUND', '房间不存在');
    return mapRoom(result.rows[0]);
  }

  async updateRoom(input: UpdateRoomInput): Promise<RoomRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.lockRoom(client, input.roomId, input.userId);
      if (current.active_turn_id) throw new StoreError('TURN_NOT_ACTIVE', '房间正在生成');
      if (current.version !== input.expectedVersion) throw new StoreError('ROOM_VERSION_CONFLICT', '房间版本已更新');
      const result = await client.query<RoomRow>(
        `UPDATE rooms SET state_json = $3::jsonb, version = version + 1, updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, state_json, version, status, active_turn_id, created_at, updated_at`,
        [input.roomId, input.userId, JSON.stringify(input.state)],
      );
      await client.query('COMMIT');
      return mapRoom(result.rows[0]!);
    } catch (error) {
      return this.rollbackAndRethrow(client, error);
    } finally {
      client.release();
    }
  }

  async reserveTurn(input: ReserveTurnInput): Promise<TurnReservation> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const room = await this.lockRoom(client, input.roomId, input.userId);
      if (room.active_turn_id) {
        const active = await client.query<{ id: string; updated_at: Date }>(
          `SELECT id, updated_at FROM turn_runs WHERE id = $1 AND status = 'active' FOR UPDATE`,
          [room.active_turn_id],
        );
        const stale = active.rows[0] && Date.now() - active.rows[0].updated_at.getTime() >= TURN_LEASE_MS;
        if (stale) {
          await client.query(`UPDATE turn_runs SET status = 'failed', updated_at = now() WHERE id = $1`, [room.active_turn_id]);
          await client.query(`DELETE FROM memories WHERE source_turn_id = $1 AND status = 'candidate'`, [room.active_turn_id]);
          await client.query(`UPDATE rooms SET active_turn_id = NULL, updated_at = now() WHERE id = $1`, [room.id]);
          room.active_turn_id = null;
        }
      }
      const existingResult = await client.query<TurnRow>(
        `SELECT id, room_id, user_id, request_hash, status, result_room_version, base_history_length, updated_at
         FROM turn_runs WHERE id = $1`,
        [input.turnId],
      );
      const existing = existingResult.rows[0];
      if (existing) {
        if (existing.room_id !== input.roomId || existing.user_id !== input.userId || existing.request_hash !== input.requestHash) {
          await client.query('ROLLBACK');
          return { kind: 'conflict', code: 'IDEMPOTENCY_MISMATCH' };
        }
        if (existing.status === 'completed') {
          const events = await client.query<{ payload_json: PersistedTurnEvent }>(
            'SELECT payload_json FROM turn_events WHERE turn_id = $1 ORDER BY seq',
            [input.turnId],
          );
          await client.query('COMMIT');
          return { kind: 'replay', events: events.rows.map((row) => row.payload_json), roomVersion: existing.result_room_version! };
        }
        await client.query('ROLLBACK');
        return { kind: 'conflict', code: existing.status === 'failed' ? 'TURN_FAILED' : 'TURN_IN_PROGRESS' };
      }
      if (room.version !== input.roomVersion) {
        await client.query('ROLLBACK');
        return { kind: 'conflict', code: 'ROOM_VERSION_CONFLICT' };
      }
      if (room.active_turn_id) {
        await client.query('ROLLBACK');
        return { kind: 'conflict', code: 'TURN_IN_PROGRESS' };
      }
      await client.query(
        `INSERT INTO turn_runs (
           id, room_id, user_id, request_hash, prompt_version, build_version, provider, model,
           base_room_version, base_history_length, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')`,
        [
          input.turnId, input.roomId, input.userId, input.requestHash, input.promptVersion,
          input.buildVersion ?? 'development', input.provider ?? 'unknown', input.model,
          input.roomVersion, room.state_json.history.length,
        ],
      );
      await client.query('UPDATE rooms SET active_turn_id = $2, updated_at = now() WHERE id = $1', [input.roomId, input.turnId]);
      await client.query('COMMIT');
      return { kind: 'accepted', room: mapRoom({ ...room, active_turn_id: input.turnId }) };
    } catch (error) {
      return this.rollbackAndRethrow(client, error);
    } finally {
      client.release();
    }
  }

  async lookupTurn(input: LookupTurnInput): Promise<TurnLookup> {
    const result = await this.pool.query<TurnRow>(
      `SELECT id, room_id, user_id, request_hash, status, result_room_version, base_history_length, updated_at
       FROM turn_runs WHERE id = $1`,
      [input.turnId],
    );
    const existing = result.rows[0];
    if (!existing) return { kind: 'missing' };
    if (existing.room_id !== input.roomId || existing.user_id !== input.userId || existing.request_hash !== input.requestHash) {
      return { kind: 'conflict', code: 'IDEMPOTENCY_MISMATCH' };
    }
    if (existing.status === 'completed') {
      const events = await this.pool.query<{ payload_json: PersistedTurnEvent }>(
        `SELECT payload_json FROM turn_events WHERE turn_id = $1 ORDER BY seq`,
        [input.turnId],
      );
      return { kind: 'replay', events: events.rows.map((row) => row.payload_json), roomVersion: existing.result_room_version! };
    }
    if (existing.status === 'active' && Date.now() - existing.updated_at.getTime() >= TURN_LEASE_MS) {
      return { kind: 'conflict', code: 'TURN_FAILED' };
    }
    return { kind: 'conflict', code: existing.status === 'failed' ? 'TURN_FAILED' : 'TURN_IN_PROGRESS' };
  }

  async completeTurn(input: CompleteTurnInput): Promise<RoomRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const room = await this.lockRoom(client, input.roomId, input.userId);
      const turnResult = await client.query<TurnRow>(
        `SELECT id, room_id, user_id, request_hash, status, result_room_version, base_history_length, updated_at
         FROM turn_runs WHERE id = $1 FOR UPDATE`,
        [input.turnId],
      );
      const turn = turnResult.rows[0];
      if (!turn || turn.status !== 'active' || room.active_turn_id !== input.turnId) {
        throw new StoreError('TURN_NOT_ACTIVE', '回合不在运行中');
      }
      const result = await client.query<RoomRow>(
        `UPDATE rooms SET state_json = $3::jsonb, version = version + 1, active_turn_id = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, state_json, version, status, active_turn_id, created_at, updated_at`,
        [input.roomId, input.userId, JSON.stringify(input.state)],
      );
      const updated = result.rows[0]!;
      const observability = input.observability ?? {
        usage: { status: 'actual_usage_unavailable' }, latency: {}, trace: {},
      };
      await client.query(
        `UPDATE turn_runs SET
           status = 'completed', stop_reason = $2, result_room_version = $3,
           usage_json = $4::jsonb, latency_json = $5::jsonb, trace_json = $6::jsonb, updated_at = now()
         WHERE id = $1`,
        [
          input.turnId, input.stopReason, updated.version,
          JSON.stringify(observability.usage),
          JSON.stringify(observability.latency),
          JSON.stringify(observability.trace),
        ],
      );
      let sourceMessageId: string | undefined;
      const messages: Array<{
        id: string;
        seq: number;
        speaker: string;
        text: string;
        speech_type: string | null;
      }> = [];
      for (let seq = turn.base_history_length; seq < input.state.history.length; seq++) {
        const message = input.state.history[seq]!;
        const messageId = message.id ?? randomUUID();
        if (!sourceMessageId && message.speaker === 'user') sourceMessageId = messageId;
        messages.push({
          id: messageId,
          seq,
          speaker: message.speaker,
          text: message.text,
          speech_type: message.speechType ?? null,
        });
      }
      if (messages.length > 0) {
        await client.query(
          `INSERT INTO messages (id, room_id, turn_id, seq, speaker, text, speech_type)
           SELECT message.id, $1, $2, message.seq, message.speaker, message.text, message.speech_type
           FROM jsonb_to_recordset($3::jsonb) AS message(
             id text, seq integer, speaker text, text text, speech_type text
           )
           ON CONFLICT (room_id, seq) DO NOTHING`,
          [input.roomId, input.turnId, JSON.stringify(messages)],
        );
      }
      if (sourceMessageId) {
        await client.query(
          `UPDATE memories SET source_message_id = $2 WHERE source_turn_id = $1 AND source_message_id IS NULL`,
          [input.turnId, sourceMessageId],
        );
      }
      if (input.events.length > 0) {
        const events = input.events.map((event, seq) => ({
          seq,
          event_type: String(event.type ?? 'unknown'),
          payload_json: event,
        }));
        await client.query(
          `INSERT INTO turn_events (turn_id, seq, event_type, payload_json)
           SELECT $1, event.seq, event.event_type, event.payload_json
           FROM jsonb_to_recordset($2::jsonb) AS event(
             seq integer, event_type text, payload_json jsonb
           )`,
          [input.turnId, JSON.stringify(events)],
        );
      }
      await client.query('COMMIT');
      return mapRoom(updated);
    } catch (error) {
      return this.rollbackAndRethrow(client, error);
    } finally {
      client.release();
    }
  }

  async failTurn(
    userId: string,
    roomId: string,
    turnId: string,
    failure?: FailedTurnObservability,
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.lockRoom(client, roomId, userId);
      const failed = await client.query(
        `UPDATE turn_runs SET status = 'failed', stop_reason = COALESCE($4, stop_reason),
           usage_json = COALESCE($5::jsonb, usage_json), latency_json = COALESCE($6::jsonb, latency_json),
           trace_json = COALESCE($7::jsonb, trace_json), updated_at = now()
         WHERE id = $1 AND room_id = $2 AND user_id = $3 AND status = 'active'`,
        [
          turnId, roomId, userId, failure?.stopReason ?? null,
          failure ? JSON.stringify(failure.usage) : null,
          failure ? JSON.stringify(failure.latency) : null,
          failure ? JSON.stringify(failure.trace) : null,
        ],
      );
      if (failed.rowCount) {
        await client.query(`DELETE FROM memories WHERE source_turn_id = $1 AND status = 'candidate'`, [turnId]);
      }
      await client.query(
        `UPDATE rooms SET active_turn_id = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND active_turn_id = $3`,
        [roomId, userId, turnId],
      );
      await client.query('COMMIT');
    } catch (error) {
      return this.rollbackAndRethrow(client, error);
    } finally {
      client.release();
    }
  }

  async createMemoryCandidates(input: CreateMemoryCandidatesInput): Promise<MemoryRecord[]> {
    const created: MemoryRecord[] = [];
    for (const candidate of input.candidates) {
      const result = await this.pool.query<MemoryRow>(
        `INSERT INTO memories (id, user_id, agent_type, kind, content, status, source_turn_id)
         VALUES ($1, $2, $3, $4, $5, 'candidate', $6)
         RETURNING id, user_id, agent_type, kind, content, status, source_turn_id, source_message_id, version, created_at, updated_at`,
        [randomUUID(), input.userId, candidate.agent, candidate.kind, candidate.content, input.sourceTurnId],
      );
      created.push(mapMemory(result.rows[0]!));
    }
    return created;
  }

  async updateMemoryStatus(
    userId: string,
    memoryId: string,
    status: Exclude<MemoryStatus, 'candidate'>,
  ): Promise<MemoryRecord> {
    const result = await this.pool.query<MemoryRow>(
      `UPDATE memories SET status = $3::memory_status, version = version + 1, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status <> 'deleted'
         AND EXISTS (SELECT 1 FROM turn_runs WHERE turn_runs.id = memories.source_turn_id AND turn_runs.status = 'completed')
         AND (
           status::text = $3
           OR status = 'candidate'
           OR (status IN ('confirmed', 'rejected') AND $3::text = 'deleted')
         )
       RETURNING id, user_id, agent_type, kind, content, status, source_turn_id, source_message_id, version, created_at, updated_at`,
      [memoryId, userId, status],
    );
    if (!result.rows[0]) {
      const existing = await this.pool.query('SELECT 1 FROM memories WHERE id = $1 AND user_id = $2', [memoryId, userId]);
      if (existing.rowCount) throw new StoreError('MEMORY_STATUS_CONFLICT', '记忆状态不能这样变更');
      throw new StoreError('MEMORY_NOT_FOUND', '记忆不存在');
    }
    return mapMemory(result.rows[0]);
  }

  async listConfirmedMemories(userId: string, agents: AgentType[], limitPerAgent = 5): Promise<MemoryRecord[]> {
    if (agents.length === 0) return [];
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, user_id, agent_type, kind, content, status, source_turn_id, source_message_id, version, created_at, updated_at
       FROM (
         SELECT *, row_number() OVER (PARTITION BY agent_type ORDER BY updated_at DESC) AS agent_rank
         FROM memories WHERE user_id = $1 AND status = 'confirmed' AND agent_type = ANY($2::text[])
       ) ranked WHERE agent_rank <= $3 ORDER BY updated_at DESC`,
      [userId, agents, limitPerAgent],
    );
    return result.rows.map(mapMemory);
  }

  async listMemories(userId: string, status?: MemoryStatus, roomId?: string): Promise<MemoryRecord[]> {
    const result = await this.pool.query<MemoryRow>(
      `SELECT id, user_id, agent_type, kind, content, status, source_turn_id, source_message_id, version, created_at, updated_at
       FROM memories
       WHERE user_id = $1
         AND EXISTS (
           SELECT 1 FROM turn_runs
           WHERE turn_runs.id = memories.source_turn_id
             AND turn_runs.status = 'completed'
             AND ($3::text IS NULL OR turn_runs.room_id = $3)
         )
         AND ($2::text IS NULL OR status::text = $2)
       ORDER BY updated_at DESC`,
      [userId, status ?? null, roomId ?? null],
    );
    return result.rows.map(mapMemory);
  }

  async upsertFeedback(input: UpsertFeedbackInput): Promise<FeedbackRecord> {
    const result = await this.pool.query<FeedbackRow>(
      `INSERT INTO feedback (id, user_id, room_id, turn_id, message_id, rating, tags, note)
       SELECT $1, $2, $3, messages.turn_id, messages.id, $5::feedback_rating, $6::text[], $7
       FROM messages
       JOIN rooms ON rooms.id = messages.room_id
       WHERE messages.id = $4 AND messages.room_id = $3 AND rooms.user_id = $2
         AND messages.speaker NOT IN ('user', 'safety')
       ON CONFLICT (user_id, message_id) DO UPDATE SET
         rating = EXCLUDED.rating, tags = EXCLUDED.tags, note = EXCLUDED.note, updated_at = now()
       RETURNING id, user_id, room_id, turn_id, message_id, rating, tags, note, created_at, updated_at`,
      [randomUUID(), input.userId, input.roomId, input.messageId, input.rating, input.tags, input.note ?? null],
    );
    if (!result.rows[0]) throw new StoreError('MESSAGE_NOT_FOUND', '消息不存在');
    return mapFeedback(result.rows[0]);
  }

  async listFeedback(userId: string, roomId: string): Promise<FeedbackRecord[]> {
    const result = await this.pool.query<FeedbackRow>(
      `SELECT feedback.id, feedback.user_id, feedback.room_id, feedback.turn_id, feedback.message_id,
              feedback.rating, feedback.tags, feedback.note, feedback.created_at, feedback.updated_at
       FROM feedback
       JOIN rooms ON rooms.id = feedback.room_id
       WHERE feedback.user_id = $1 AND feedback.room_id = $2 AND rooms.user_id = $1
       ORDER BY feedback.updated_at DESC`,
      [userId, roomId],
    );
    return result.rows.map(mapFeedback);
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    // 每次经索引做有界清理，避免短生命周期实例永远达不到进程内清理计数。
    await this.pool.query(
      `DELETE FROM rate_limits
       WHERE key IN (
         SELECT key FROM rate_limits WHERE updated_at < now() - interval '10 minutes' ORDER BY updated_at LIMIT 1000
       )`,
    );
    const result = await this.pool.query<{ count: number; retry_after_seconds: number }>(
      `INSERT INTO rate_limits (key, window_started_at, count, updated_at)
       VALUES ($1, now(), 1, now())
       ON CONFLICT (key) DO UPDATE SET
         count = CASE
           WHEN rate_limits.window_started_at <= now() - ($2::double precision * interval '1 millisecond') THEN 1
           ELSE rate_limits.count + 1
         END,
         window_started_at = CASE
           WHEN rate_limits.window_started_at <= now() - ($2::double precision * interval '1 millisecond') THEN now()
           ELSE rate_limits.window_started_at
         END,
         updated_at = now()
       RETURNING count,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
           window_started_at + ($2::double precision * interval '1 millisecond') - now()
         )))::integer) AS retry_after_seconds`,
      [key, windowMs],
    );
    const row = result.rows[0]!;
    return { allowed: row.count <= limit, retryAfterSeconds: row.count <= limit ? 0 : row.retry_after_seconds };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private async lockRoom(client: PoolClient, roomId: string, userId: string): Promise<RoomRow> {
    const result = await client.query<RoomRow>(
      `SELECT id, user_id, state_json, version, status, active_turn_id, created_at, updated_at
       FROM rooms WHERE id = $1 AND user_id = $2 AND status <> 'deleted' FOR UPDATE`,
      [roomId, userId],
    );
    if (!result.rows[0]) throw new StoreError('ROOM_NOT_FOUND', '房间不存在');
    return result.rows[0];
  }

  private async rollbackAndRethrow(client: PoolClient, originalError: unknown): Promise<never> {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      if (originalError instanceof Error) {
        Object.defineProperty(originalError, 'rollbackError', { value: rollbackError, enumerable: false });
      }
    }
    throw originalError;
  }
}
