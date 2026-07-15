import type { RoomState } from '@persona16/engine';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const roomStatus = pgEnum('room_status', ['active', 'archived', 'deleted']);
export const turnStatus = pgEnum('turn_status', ['active', 'completed', 'failed']);
export const memoryStatus = pgEnum('memory_status', ['candidate', 'confirmed', 'rejected', 'deleted']);
export const memoryKind = pgEnum('memory_kind', ['preference', 'repeated_pattern', 'boundary']);
export const feedbackRating = pgEnum('feedback_rating', ['positive', 'negative']);

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  anonymousId: text('anonymous_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rooms = pgTable('rooms', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  version: integer('version').notNull().default(1),
  status: roomStatus('status').notNull().default('active'),
  activeTurnId: text('active_turn_id'),
  state: jsonb('state_json').$type<RoomState>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('rooms_user_updated_idx').on(table.userId, table.updatedAt)]);

export const roomAgents = pgTable('room_agents', {
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  agentType: text('agent_type').notNull(),
  paused: boolean('paused').notNull().default(false),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  state: jsonb('state_json').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [primaryKey({ columns: [table.roomId, table.agentType] })]);

export const turnRuns = pgTable('turn_runs', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id),
  requestHash: text('request_hash').notNull(),
  promptVersion: text('prompt_version').notNull(),
  buildVersion: text('build_version').notNull().default('development'),
  provider: text('provider').notNull().default('unknown'),
  model: text('model').notNull(),
  baseRoomVersion: integer('base_room_version').notNull(),
  baseHistoryLength: integer('base_history_length').notNull(),
  resultRoomVersion: integer('result_room_version'),
  status: turnStatus('status').notNull(),
  stopReason: text('stop_reason'),
  usage: jsonb('usage_json').$type<Record<string, unknown>>(),
  latency: jsonb('latency_json').$type<Record<string, unknown>>(),
  trace: jsonb('trace_json').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('turn_runs_room_created_idx').on(table.roomId, table.createdAt)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull().defaultNow(),
  count: integer('count').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('rate_limits_updated_idx').on(table.updatedAt)]);

export const messages = pgTable('messages', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  turnId: text('turn_id').references(() => turnRuns.id, { onDelete: 'set null' }),
  seq: integer('seq').notNull(),
  speaker: text('speaker').notNull(),
  text: text('text').notNull(),
  speechType: text('speech_type'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('messages_room_seq_unique').on(table.roomId, table.seq)]);

export const turnEvents = pgTable('turn_events', {
  turnId: text('turn_id').notNull().references(() => turnRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  eventType: text('event_type').notNull(),
  payload: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
}, (table) => [primaryKey({ columns: [table.turnId, table.seq] })]);

export const memories = pgTable('memories', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentType: text('agent_type').notNull(),
  kind: memoryKind('kind').notNull(),
  content: text('content').notNull(),
  status: memoryStatus('status').notNull().default('candidate'),
  sourceTurnId: text('source_turn_id').notNull().references(() => turnRuns.id, { onDelete: 'cascade' }),
  sourceMessageId: text('source_message_id').references(() => messages.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('memories_user_agent_status_idx').on(table.userId, table.agentType, table.status, table.updatedAt)]);

export const feedback = pgTable('feedback', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  roomId: text('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  turnId: text('turn_id').references(() => turnRuns.id, { onDelete: 'set null' }),
  messageId: text('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  rating: feedbackRating('rating').notNull(),
  tags: text('tags').array().notNull().default([]),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('feedback_user_message_unique').on(table.userId, table.messageId),
  index('feedback_room_updated_idx').on(table.roomId, table.updatedAt),
]);
