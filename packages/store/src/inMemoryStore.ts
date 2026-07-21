import { randomUUID } from 'node:crypto';
import {
  applyRelationshipEvent,
  createRelationshipBranch,
  forgetRelationshipEvidence as forgetBranchEvidence,
  type AgentType,
  type MemoryStatus,
} from '@persona16/engine';
import type {
  AppendRelationshipEventInput,
  CompleteTurnInput,
  CreateMemoryCandidatesInput,
  CreateRoomInput,
  FeedbackRecord,
  FailedTurnObservability,
  MemoryRecord,
  RelationshipBranchRecord,
  RelationshipEventRecord,
  LookupTurnInput,
  PersistedTurnEvent,
  PersonaStore,
  ReserveTurnInput,
  RoomRecord,
  TurnReservation,
  TurnLookup,
  TurnObservability,
  UpsertFeedbackInput,
  UpdateRoomInput,
} from './types';
import { StoreError } from './types';
import {
  rebuildRelationshipBranch,
  relationshipCharacterId,
  sameRelationshipEvent,
  relationshipEventFromMemory,
} from './relationshipProjection';

interface StoredTurn {
  id: string;
  roomId: string;
  userId: string;
  requestHash: string;
  status: 'active' | 'completed' | 'failed';
  events: PersistedTurnEvent[];
  roomVersion?: number;
  observability?: TurnObservability;
  updatedAt: number;
}

interface RateBucket { count: number; expiresAt: number }

const TURN_LEASE_MS = 180_000;

export interface InMemoryStoreOptions {
  now?: () => number;
  turnLeaseMs?: number;
}

function cloneRoom(room: RoomRecord): RoomRecord {
  return { ...room, state: structuredClone(room.state), createdAt: new Date(room.createdAt), updatedAt: new Date(room.updatedAt) };
}

function cloneMemory(memory: MemoryRecord): MemoryRecord {
  return { ...memory, createdAt: new Date(memory.createdAt), updatedAt: new Date(memory.updatedAt) };
}

function cloneRelationshipEvent(record: RelationshipEventRecord): RelationshipEventRecord {
  return { ...structuredClone(record), createdAt: new Date(record.createdAt) };
}

function cloneRelationshipBranch(record: RelationshipBranchRecord): RelationshipBranchRecord {
  return { ...record, branch: structuredClone(record.branch), updatedAt: new Date(record.updatedAt) };
}

function cloneFeedback(feedback: FeedbackRecord): FeedbackRecord {
  return {
    ...feedback,
    tags: [...feedback.tags],
    createdAt: new Date(feedback.createdAt),
    updatedAt: new Date(feedback.updatedAt),
  };
}

export class InMemoryPersonaStore implements PersonaStore {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly turns = new Map<string, StoredTurn>();
  private readonly memories = new Map<string, MemoryRecord>();
  private readonly relationshipEvents = new Map<string, RelationshipEventRecord>();
  private readonly relationshipBranches = new Map<string, RelationshipBranchRecord>();
  private readonly feedback = new Map<string, FeedbackRecord>();
  private readonly rateLimits = new Map<string, RateBucket>();
  private readonly now: () => number;
  private readonly turnLeaseMs: number;

  constructor(options: InMemoryStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.turnLeaseMs = options.turnLeaseMs ?? TURN_LEASE_MS;
  }

  async createRoom(input: CreateRoomInput): Promise<RoomRecord> {
    const now = new Date();
    const room: RoomRecord = {
      id: randomUUID(), userId: input.userId, state: structuredClone(input.state), version: 1,
      status: 'active', createdAt: now, updatedAt: now,
    };
    this.rooms.set(room.id, room);
    return cloneRoom(room);
  }

  async getRoom(roomId: string, userId: string): Promise<RoomRecord> {
    const room = this.rooms.get(roomId);
    if (!room || room.userId !== userId || room.status === 'deleted') {
      throw new StoreError('ROOM_NOT_FOUND', '房间不存在');
    }
    return cloneRoom(room);
  }

  async updateRoom(input: UpdateRoomInput): Promise<RoomRecord> {
    const room = this.requireRoom(input.roomId, input.userId);
    if (room.activeTurnId) throw new StoreError('TURN_NOT_ACTIVE', '房间正在生成');
    if (room.version !== input.expectedVersion) {
      throw new StoreError('ROOM_VERSION_CONFLICT', '房间版本已更新');
    }
    room.state = structuredClone(input.state);
    room.version += 1;
    room.updatedAt = new Date();
    return cloneRoom(room);
  }

  async reserveTurn(input: ReserveTurnInput): Promise<TurnReservation> {
    const room = this.requireRoom(input.roomId, input.userId);
    if (room.activeTurnId) {
      const active = this.turns.get(room.activeTurnId);
      if (active && this.now() - active.updatedAt >= this.turnLeaseMs) {
        active.status = 'failed';
        room.activeTurnId = undefined;
        this.deleteCandidateMemories(active.id);
      }
    }
    const existing = this.turns.get(input.turnId);
    if (existing) {
      if (existing.roomId !== input.roomId || existing.userId !== input.userId || existing.requestHash !== input.requestHash) {
        return { kind: 'conflict', code: 'IDEMPOTENCY_MISMATCH' };
      }
      if (existing.status === 'completed') {
        return { kind: 'replay', events: structuredClone(existing.events), roomVersion: existing.roomVersion! };
      }
      return { kind: 'conflict', code: existing.status === 'failed' ? 'TURN_FAILED' : 'TURN_IN_PROGRESS' };
    }
    if (room.version !== input.roomVersion) return { kind: 'conflict', code: 'ROOM_VERSION_CONFLICT' };
    if (room.activeTurnId) return { kind: 'conflict', code: 'TURN_IN_PROGRESS' };
    room.activeTurnId = input.turnId;
    room.updatedAt = new Date();
    this.turns.set(input.turnId, {
      id: input.turnId, roomId: input.roomId, userId: input.userId,
      requestHash: input.requestHash, status: 'active', events: [],
      updatedAt: this.now(),
    });
    return { kind: 'accepted', room: cloneRoom(room) };
  }

  async lookupTurn(input: LookupTurnInput): Promise<TurnLookup> {
    const existing = this.turns.get(input.turnId);
    if (!existing) return { kind: 'missing' };
    if (existing.roomId !== input.roomId || existing.userId !== input.userId || existing.requestHash !== input.requestHash) {
      return { kind: 'conflict', code: 'IDEMPOTENCY_MISMATCH' };
    }
    if (existing.status === 'completed') {
      return { kind: 'replay', events: structuredClone(existing.events), roomVersion: existing.roomVersion! };
    }
    if (existing.status === 'active' && this.now() - existing.updatedAt >= this.turnLeaseMs) {
      return { kind: 'conflict', code: 'TURN_FAILED' };
    }
    return { kind: 'conflict', code: existing.status === 'failed' ? 'TURN_FAILED' : 'TURN_IN_PROGRESS' };
  }

  async completeTurn(input: CompleteTurnInput): Promise<RoomRecord> {
    const room = this.requireRoom(input.roomId, input.userId);
    const turn = this.turns.get(input.turnId);
    if (!turn || turn.status !== 'active' || room.activeTurnId !== input.turnId) {
      throw new StoreError('TURN_NOT_ACTIVE', '回合不在运行中');
    }
    room.state = structuredClone(input.state);
    room.version += 1;
    room.activeTurnId = undefined;
    room.updatedAt = new Date();
    turn.status = 'completed';
    turn.events = structuredClone(input.events);
    turn.observability = structuredClone(input.observability);
    turn.roomVersion = room.version;
    turn.updatedAt = this.now();
    return cloneRoom(room);
  }

  async failTurn(userId: string, roomId: string, turnId: string, failure?: FailedTurnObservability): Promise<void> {
    const room = this.requireRoom(roomId, userId);
    const turn = this.turns.get(turnId);
    const transitioned = turn?.status === 'active';
    if (transitioned && turn) {
      turn.status = 'failed';
      turn.observability = failure ? structuredClone(failure) : undefined;
    }
    if (room.activeTurnId === turnId) room.activeTurnId = undefined;
    room.updatedAt = new Date();
    if (transitioned) this.deleteCandidateMemories(turnId);
  }

  async createMemoryCandidates(input: CreateMemoryCandidatesInput): Promise<MemoryRecord[]> {
    const sourceTurn = this.turns.get(input.sourceTurnId);
    if (!sourceTurn || sourceTurn.userId !== input.userId || sourceTurn.status === 'failed') {
      throw new StoreError('MEMORY_STATUS_CONFLICT', '记忆候选必须来自该用户的有效回合');
    }
    const now = new Date();
    return input.candidates.map((candidate) => {
      const memory: MemoryRecord = {
        id: randomUUID(), userId: input.userId, sourceTurnId: input.sourceTurnId,
        status: 'candidate', version: 1, ...candidate, createdAt: now, updatedAt: now,
      };
      this.memories.set(memory.id, memory);
      return cloneMemory(memory);
    });
  }

  async updateMemoryStatus(
    userId: string,
    memoryId: string,
    status: Exclude<MemoryStatus, 'candidate'>,
  ): Promise<MemoryRecord> {
    const memory = this.memories.get(memoryId);
    if (!memory || memory.userId !== userId || memory.status === 'deleted') {
      throw new StoreError('MEMORY_NOT_FOUND', '记忆不存在');
    }
    const sourceTurn = this.turns.get(memory.sourceTurnId);
    if (sourceTurn?.userId !== userId || sourceTurn.status !== 'completed') {
      throw new StoreError('MEMORY_STATUS_CONFLICT', '来源回合尚未完成');
    }
    const allowed = memory.status === status
      || memory.status === 'candidate'
      || ((memory.status === 'confirmed' || memory.status === 'rejected') && status === 'deleted');
    if (!allowed) throw new StoreError('MEMORY_STATUS_CONFLICT', '记忆状态不能这样变更');
    const previousStatus = memory.status;
    memory.status = status;
    memory.version += 1;
    memory.updatedAt = new Date();
    if (status === 'confirmed') this.projectConfirmedMemory(memory);
    if (status === 'deleted' && previousStatus === 'confirmed') {
      for (const [eventId, record] of this.relationshipEvents) {
        if (record.sourceMemoryId === memory.id) this.relationshipEvents.delete(eventId);
      }
      this.rebuildBranch(memory.userId, memory.agent);
    }
    return cloneMemory(memory);
  }

  async listConfirmedMemories(userId: string, agents: AgentType[], limitPerAgent = 5): Promise<MemoryRecord[]> {
    const allowed = new Set(agents);
    const counts = new Map<AgentType, number>();
    return [...this.memories.values()]
      .filter((memory) => memory.userId === userId && memory.status === 'confirmed' && allowed.has(memory.agent))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .filter((memory) => {
        const count = counts.get(memory.agent) ?? 0;
        if (count >= limitPerAgent) return false;
        counts.set(memory.agent, count + 1);
        return true;
      })
      .map(cloneMemory);
  }

  async listMemories(userId: string, status?: MemoryStatus, roomId?: string): Promise<MemoryRecord[]> {
    return [...this.memories.values()]
      .filter((memory) => memory.userId === userId
        && this.turns.get(memory.sourceTurnId)?.status === 'completed'
        && (!roomId || this.turns.get(memory.sourceTurnId)?.roomId === roomId)
        && (!status || memory.status === status))
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map(cloneMemory);
  }

  async listRelationshipEvents(userId: string, agent: AgentType): Promise<RelationshipEventRecord[]> {
    return [...this.relationshipEvents.values()]
      .filter((record) => record.userId === userId && record.agent === agent)
      .sort((left, right) => (
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
      ))
      .map(cloneRelationshipEvent);
  }

  async listRelationshipBranches(userId: string, agents: AgentType[]): Promise<RelationshipBranchRecord[]> {
    const allowed = new Set(agents);
    return [...this.relationshipBranches.values()]
      .filter((record) => record.userId === userId && allowed.has(record.agent))
      .map(cloneRelationshipBranch);
  }

  async appendRelationshipEvent(input: AppendRelationshipEventInput): Promise<RelationshipEventRecord> {
    if (input.event.id.startsWith('memory:')) {
      throw new StoreError('RELATIONSHIP_EVENT_CONFLICT', 'memory: 前缀仅供已确认 Memory 投影使用');
    }
    const sourceTurn = this.turns.get(input.event.sourceTurnId);
    if (!sourceTurn || sourceTurn.userId !== input.userId || sourceTurn.status !== 'completed') {
      throw new StoreError('RELATIONSHIP_EVENT_CONFLICT', '关系事件必须来自该用户已完成的回合');
    }
    const existing = this.relationshipEvents.get(input.event.id);
    if (existing) {
      if (
        existing.userId === input.userId
        && existing.agent === input.agent
        && sameRelationshipEvent(existing.event, input.event)
      ) return cloneRelationshipEvent(existing);
      throw new StoreError('RELATIONSHIP_EVENT_CONFLICT', '关系事件 id 已被其他内容占用');
    }

    const key = `${input.userId}:${input.agent}`;
    const previous = this.relationshipBranches.get(key);
    const characterId = previous?.characterId ?? relationshipCharacterId(input.agent);
    const branch = applyRelationshipEvent(
      previous?.branch ?? createRelationshipBranch(characterId),
      input.event,
    );
    const record: RelationshipEventRecord = {
      id: input.event.id,
      userId: input.userId,
      agent: input.agent,
      characterId,
      event: structuredClone(input.event),
      createdAt: new Date(this.now()),
    };
    this.relationshipEvents.set(record.id, record);
    this.relationshipBranches.set(key, {
      userId: input.userId,
      agent: input.agent,
      characterId,
      branch,
      version: (previous?.version ?? 0) + 1,
      updatedAt: new Date(this.now()),
    });
    return cloneRelationshipEvent(record);
  }

  async forgetRelationshipEvidence(
    userId: string,
    agent: AgentType,
    evidenceId: string,
  ): Promise<RelationshipBranchRecord> {
    const key = `${userId}:${agent}`;
    const previous = this.relationshipBranches.get(key);
    if (!previous) throw new StoreError('RELATIONSHIP_EVENT_CONFLICT', '关系分支不存在');
    let branch;
    try {
      branch = forgetBranchEvidence(previous.branch, evidenceId);
    } catch {
      throw new StoreError('RELATIONSHIP_EVENT_CONFLICT', '找不到要遗忘的关系依据');
    }
    const retainedEventIds = new Set(branch.eventLog.map((event) => event.id));
    for (const [eventId, record] of this.relationshipEvents) {
      if (record.userId !== userId || record.agent !== agent || retainedEventIds.has(eventId)) continue;
      this.relationshipEvents.delete(eventId);
      if (record.sourceMemoryId) {
        const memory = this.memories.get(record.sourceMemoryId);
        if (memory) {
          memory.status = 'deleted';
          memory.version += 1;
          memory.updatedAt = new Date(this.now());
        }
      }
    }
    const next: RelationshipBranchRecord = {
      ...previous,
      branch,
      version: previous.version + 1,
      updatedAt: new Date(this.now()),
    };
    this.relationshipBranches.set(key, next);
    return cloneRelationshipBranch(next);
  }

  async upsertFeedback(input: UpsertFeedbackInput): Promise<FeedbackRecord> {
    const room = this.requireRoom(input.roomId, input.userId);
    const message = room.state.history.find((candidate) => candidate.id === input.messageId);
    if (!message || message.speaker === 'user' || message.speaker === 'safety') {
      throw new StoreError('MESSAGE_NOT_FOUND', '消息不存在');
    }
    const key = `${input.userId}:${input.messageId}`;
    const existing = this.feedback.get(key);
    const now = new Date(this.now());
    const turnId = [...this.turns.values()].find((turn) => turn.events.some(
      (event) => event.type === 'speaker_end' && event.messageId === input.messageId,
    ))?.id;
    const record: FeedbackRecord = existing ? {
      ...existing,
      rating: input.rating,
      tags: [...input.tags],
      note: input.note,
      updatedAt: now,
    } : {
      id: randomUUID(),
      userId: input.userId,
      roomId: input.roomId,
      turnId,
      messageId: input.messageId,
      rating: input.rating,
      tags: [...input.tags],
      note: input.note,
      createdAt: now,
      updatedAt: now,
    };
    this.feedback.set(key, record);
    return cloneFeedback(record);
  }

  private projectConfirmedMemory(memory: MemoryRecord): void {
    const record = relationshipEventFromMemory(memory);
    const existing = this.relationshipEvents.get(record.id);
    if (existing) {
      if (
        existing.userId === record.userId
        && existing.agent === record.agent
        && existing.characterId === record.characterId
        && existing.sourceMemoryId === record.sourceMemoryId
        && sameRelationshipEvent(existing.event, record.event)
      ) return;
      throw new StoreError('RELATIONSHIP_EVENT_CONFLICT', 'Memory 对应的关系事件已被其他内容占用');
    }
    this.relationshipEvents.set(record.id, record);
    this.rebuildBranch(memory.userId, memory.agent);
  }

  private rebuildBranch(userId: string, agent: AgentType): void {
    const records = [...this.relationshipEvents.values()]
      .filter((record) => record.userId === userId && record.agent === agent);
    const key = `${userId}:${agent}`;
    const previous = this.relationshipBranches.get(key);
    const characterId = previous?.characterId
      ?? records[0]?.characterId
      ?? relationshipCharacterId(agent);
    this.relationshipBranches.set(key, {
      userId,
      agent,
      characterId,
      branch: rebuildRelationshipBranch(characterId, records),
      version: (previous?.version ?? 0) + 1,
      updatedAt: new Date(this.now()),
    });
  }

  async listFeedback(userId: string, roomId: string): Promise<FeedbackRecord[]> {
    this.requireRoom(roomId, userId);
    return [...this.feedback.values()]
      .filter((record) => record.userId === userId && record.roomId === roomId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .map(cloneFeedback);
  }

  async consumeRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const now = this.now();
    if (this.rateLimits.size >= 1_000) {
      for (const [candidateKey, candidate] of this.rateLimits) {
        if (now >= candidate.expiresAt) this.rateLimits.delete(candidateKey);
      }
      while (this.rateLimits.size >= 10_000) {
        const oldest = this.rateLimits.keys().next().value as string | undefined;
        if (!oldest) break;
        this.rateLimits.delete(oldest);
      }
    }
    const bucket = this.rateLimits.get(key);
    if (!bucket || now >= bucket.expiresAt) {
      this.rateLimits.set(key, { count: 1, expiresAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    bucket.count += 1;
    return {
      allowed: bucket.count <= limit,
      retryAfterSeconds: bucket.count <= limit ? 0 : Math.max(1, Math.ceil((bucket.expiresAt - now) / 1000)),
    };
  }

  private deleteCandidateMemories(turnId: string): void {
    for (const [id, memory] of this.memories) {
      if (memory.sourceTurnId === turnId && memory.status === 'candidate') this.memories.delete(id);
    }
  }

  private requireRoom(roomId: string, userId: string): RoomRecord {
    const room = this.rooms.get(roomId);
    if (!room || room.userId !== userId || room.status === 'deleted') {
      throw new StoreError('ROOM_NOT_FOUND', '房间不存在');
    }
    return room;
  }
}
