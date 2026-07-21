import type {
  AgentType,
  MemoryCandidateDraft,
  MemoryKind,
  MemoryStatus,
  RelationshipBranch,
  RelationshipEvent,
  RoomState,
  TurnStreamEvent,
  TurnStopReason,
} from '@persona16/engine';

export type RoomStatus = 'active' | 'archived' | 'deleted';
export type TurnRunStatus = 'active' | 'completed' | 'failed';
export type FeedbackRating = 'positive' | 'negative';
export type FeedbackTag = 'too_ai' | 'stereotyped' | 'offensive' | 'repetitive' | 'not_helpful' | 'too_long' | 'too_short';

export interface RoomRecord {
  id: string;
  userId: string;
  state: RoomState;
  version: number;
  status: RoomStatus;
  activeTurnId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemoryRecord extends MemoryCandidateDraft {
  id: string;
  userId: string;
  status: MemoryStatus;
  sourceTurnId: string;
  sourceMessageId?: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RelationshipEventRecord {
  id: string;
  userId: string;
  agent: AgentType;
  characterId: string;
  event: RelationshipEvent;
  sourceMemoryId?: string;
  createdAt: Date;
}

export interface RelationshipBranchRecord {
  userId: string;
  agent: AgentType;
  characterId: string;
  branch: RelationshipBranch;
  version: number;
  updatedAt: Date;
}

export interface RelationshipBranchSummary {
  agent: AgentType;
  version: number;
  climate: RelationshipBranch['recentClimate'];
  eventCount: number;
  boundaryCount: number;
  tensionCount: number;
}

export interface RelationshipSummaryReadOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface FeedbackRecord {
  id: string;
  userId: string;
  roomId: string;
  turnId?: string;
  messageId: string;
  rating: FeedbackRating;
  tags: FeedbackTag[];
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TurnObservability {
  usage: Record<string, unknown>;
  latency: Record<string, unknown>;
  trace: Record<string, unknown>;
}

export interface FailedTurnObservability extends TurnObservability {
  stopReason: TurnStopReason;
}

export type PersistedTurnEvent = TurnStreamEvent | {
  v: 1;
  turnId: string;
  type: 'done';
  room: RoomState;
  roomVersion: number;
  plan?: { scene: string; userEmotion: string };
  loop?: unknown;
  safetyLevel: string;
  modelBudget?: import('@persona16/engine').ModelBudgetSnapshot;
};

export interface CreateRoomInput {
  userId: string;
  state: RoomState;
}

export interface UpdateRoomInput {
  userId: string;
  roomId: string;
  expectedVersion: number;
  state: RoomState;
}

export interface ReserveTurnInput {
  userId: string;
  roomId: string;
  turnId: string;
  roomVersion: number;
  requestHash: string;
  promptVersion: string;
  buildVersion?: string;
  provider?: string;
  model: string;
}

export type LookupTurnInput = Pick<ReserveTurnInput, 'userId' | 'roomId' | 'turnId' | 'requestHash'>;

export type TurnReservation =
  | { kind: 'accepted'; room: RoomRecord }
  | { kind: 'replay'; events: PersistedTurnEvent[]; roomVersion: number }
  | { kind: 'conflict'; code: 'TURN_IN_PROGRESS' | 'ROOM_VERSION_CONFLICT' | 'IDEMPOTENCY_MISMATCH' | 'TURN_FAILED' };

export type TurnLookup = Exclude<TurnReservation, { kind: 'accepted' }> | { kind: 'missing' };

export interface CompleteTurnInput {
  userId: string;
  roomId: string;
  turnId: string;
  state: RoomState;
  stopReason: TurnStopReason;
  events: PersistedTurnEvent[];
  observability?: TurnObservability;
}

export interface CreateMemoryCandidatesInput {
  userId: string;
  sourceTurnId: string;
  candidates: MemoryCandidateDraft[];
}

export interface AppendRelationshipEventInput {
  userId: string;
  agent: AgentType;
  event: RelationshipEvent;
}

export interface UpsertFeedbackInput {
  userId: string;
  roomId: string;
  messageId: string;
  rating: FeedbackRating;
  tags: FeedbackTag[];
  note?: string;
}

export interface PersonaStore {
  createRoom(input: CreateRoomInput): Promise<RoomRecord>;
  getRoom(roomId: string, userId: string): Promise<RoomRecord>;
  updateRoom(input: UpdateRoomInput): Promise<RoomRecord>;
  lookupTurn(input: LookupTurnInput): Promise<TurnLookup>;
  reserveTurn(input: ReserveTurnInput): Promise<TurnReservation>;
  completeTurn(input: CompleteTurnInput): Promise<RoomRecord>;
  failTurn(userId: string, roomId: string, turnId: string, failure?: FailedTurnObservability): Promise<void>;
  createMemoryCandidates(input: CreateMemoryCandidatesInput): Promise<MemoryRecord[]>;
  updateMemoryStatus(userId: string, memoryId: string, status: Exclude<MemoryStatus, 'candidate'>): Promise<MemoryRecord>;
  listConfirmedMemories(userId: string, agents: AgentType[], limitPerAgent?: number): Promise<MemoryRecord[]>;
  listMemories(userId: string, status?: MemoryStatus, roomId?: string): Promise<MemoryRecord[]>;
  listRelationshipEvents(userId: string, agent: AgentType): Promise<RelationshipEventRecord[]>;
  listRelationshipBranches(userId: string, agents: AgentType[]): Promise<RelationshipBranchRecord[]>;
  listRelationshipBranchSummaries(
    userId: string,
    agents: AgentType[],
    options?: RelationshipSummaryReadOptions,
  ): Promise<RelationshipBranchSummary[]>;
  appendRelationshipEvent(input: AppendRelationshipEventInput): Promise<RelationshipEventRecord>;
  forgetRelationshipEvidence(userId: string, agent: AgentType, evidenceId: string): Promise<RelationshipBranchRecord>;
  upsertFeedback(input: UpsertFeedbackInput): Promise<FeedbackRecord>;
  listFeedback(userId: string, roomId: string): Promise<FeedbackRecord[]>;
  consumeRateLimit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

export class StoreError extends Error {
  constructor(
    public readonly code: 'ROOM_NOT_FOUND' | 'MEMORY_NOT_FOUND' | 'MEMORY_STATUS_CONFLICT' | 'RELATIONSHIP_EVENT_CONFLICT' | 'ROOM_VERSION_CONFLICT' | 'TURN_NOT_ACTIVE' | 'MESSAGE_NOT_FOUND',
    message: string,
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export function isMemoryKind(value: string): value is MemoryKind {
  return value === 'preference' || value === 'repeated_pattern' || value === 'boundary';
}
