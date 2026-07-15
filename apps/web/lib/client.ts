'use client';

import type {
  AgentType,
  MemoryCandidateEvent,
  RoomAction,
  RoomState,
  TurnStopReason,
} from '@persona16/engine';
import type { FeedbackRating, FeedbackTag } from '@persona16/store';

export interface ServerRoom {
  id: string;
  state: RoomState;
  version: number;
  busy?: boolean;
}

/** localStorage 只保存导航缓存，不再保存可信房间状态。 */
export interface RoomArchive {
  id: string;
  agents: AgentType[];
  version: number;
  updatedAt: number;
}

const KEY = 'persona16.rooms.v2';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ApiError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export function loadRooms(): RoomArchive[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RoomArchive[];
    return parsed.filter((room) => UUID.test(room.id) && Array.isArray(room.agents));
  } catch {
    return [];
  }
}

export function saveRoom(archive: RoomArchive): void {
  const rooms = loadRooms().filter((room) => room.id !== archive.id);
  rooms.unshift({ ...archive, updatedAt: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(rooms.slice(0, 20)));
}

export function deleteRoom(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(loadRooms().filter((room) => room.id !== id)));
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string } } | undefined;
  if (!response.ok) throw new ApiError(
    payload?.error?.code ?? 'REQUEST_FAILED', response.status, payload?.error?.message ?? `请求失败（${response.status}）`,
  );
  return payload as T;
}

export function createServerRoom(agents: AgentType[]): Promise<ServerRoom> {
  return apiJson('/api/rooms', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agents }),
  });
}

export function fetchServerRoom(id: string): Promise<ServerRoom> {
  return apiJson(`/api/rooms/${encodeURIComponent(id)}`);
}

export function setServerAgentPaused(
  roomId: string,
  roomVersion: number,
  agent: AgentType,
  paused: boolean,
): Promise<ServerRoom> {
  return apiJson(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomVersion,
      command: { type: paused ? 'pause_agent' : 'resume_agent', agent },
    }),
  });
}

export function addServerAgent(roomId: string, roomVersion: number, agent: AgentType): Promise<ServerRoom> {
  return apiJson(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomVersion, command: { type: 'invite_agent', agent } }),
  });
}

export function removeServerAgent(
  roomId: string,
  roomVersion: number,
  agent: AgentType,
  confirmed: true,
): Promise<ServerRoom> {
  return apiJson(`/api/rooms/${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomVersion, command: { type: 'remove_agent', agent, confirmed } }),
  });
}

export interface MemoryCandidate extends MemoryCandidateEvent {}

export interface SavedMemory extends MemoryCandidate {
  status: 'candidate' | 'confirmed' | 'rejected' | 'deleted';
}

export type TurnEvent =
  | { v: 1; turnId: string; type: 'turn_start' }
  | { v: 1; turnId: string; type: 'room_action'; action: RoomAction }
  | { v: 1; turnId: string; type: 'speaker_start'; agent: AgentType; speechType: string }
  | { v: 1; turnId: string; type: 'delta'; agent: AgentType; delta: string }
  | { v: 1; turnId: string; type: 'speaker_end'; messageId: string; agent: AgentType; speechType: string; text: string }
  | { v: 1; turnId: string; type: 'safety_notice'; level: 'crisis' | 'blocked'; text: string }
  | { v: 1; turnId: string; type: 'memory_candidate'; candidate: MemoryCandidate }
  | { v: 1; turnId: string; type: 'turn_end'; stopReason: TurnStopReason; roomVersion: number }
  | { v: 1; turnId: string; type: 'done'; room: RoomState; roomVersion: number; safetyLevel: string }
  | { v: 1; turnId: string; type: 'error'; code: string; message: string; recoverable: boolean };

export async function streamTurn(
  body: { roomId: string; turnId: string; roomVersion: number; text: string; calledAgent?: AgentType },
  onEvent: (event: TurnEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: body.roomId,
      turnId: body.turnId,
      roomVersion: body.roomVersion,
      command: { type: 'message', text: body.text, calledAgent: body.calledAgent },
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string } } | undefined;
    try {
      onEvent({
        v: 1,
        turnId: body.turnId,
        type: 'error',
        code: payload?.error?.code ?? 'REQUEST_FAILED',
        message: payload?.error?.message ?? `请求失败（${response.status}）`,
        recoverable: true,
      });
    } catch {
      throw new ApiError('DELIVERY_FAILED', 502, '错误事件处理失败，请刷新房间');
    }
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminalReceived = false;
  const deliverLine = (line: string) => {
    if (!line.trim()) return;
    let event: TurnEvent;
    try {
      event = JSON.parse(line) as TurnEvent;
    } catch {
      // 非法服务端事件不进入投递层；终态检查会阻止静默成功。
      return;
    }
    try {
      onEvent(event);
    } catch {
      throw new ApiError('DELIVERY_FAILED', 502, '回复事件处理失败，请刷新房间');
    }
    if (event.type === 'done' || event.type === 'error') terminalReceived = true;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) deliverLine(line);
    }
    buffer += decoder.decode();
    deliverLine(buffer);
  } catch (error) {
    if (signal?.aborted || (error instanceof ApiError && error.code === 'DELIVERY_FAILED')) throw error;
    throw new ApiError('DELIVERY_FAILED', 502, '回复流中断，请刷新房间查看最终状态');
  }
  if (!terminalReceived) {
    throw new ApiError('DELIVERY_FAILED', 502, '回复流未完整结束，请刷新房间查看最终状态');
  }
}

export function resolveMemory(memoryId: string, action: 'confirm' | 'reject' | 'delete'): Promise<unknown> {
  return apiJson(`/api/memories/${encodeURIComponent(memoryId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
}

export async function fetchMemories(
  status: SavedMemory['status'] = 'confirmed',
  roomId?: string,
): Promise<SavedMemory[]> {
  const query = new URLSearchParams({ status });
  if (roomId) query.set('roomId', roomId);
  const result = await apiJson<{ memories: SavedMemory[] }>(`/api/memories?${query.toString()}`);
  return result.memories;
}

export interface MessageFeedback {
  id: string;
  roomId: string;
  messageId: string;
  rating: FeedbackRating;
  tags: FeedbackTag[];
  note?: string;
}

export function saveMessageFeedback(input: {
  roomId: string;
  messageId: string;
  rating: FeedbackRating;
  tags?: FeedbackTag[];
  note?: string;
}): Promise<{ feedback: MessageFeedback }> {
  return apiJson('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, tags: input.tags ?? [] }),
  });
}

export async function fetchRoomFeedback(roomId: string): Promise<MessageFeedback[]> {
  const result = await apiJson<{ feedback: MessageFeedback[] }>(`/api/feedback?roomId=${encodeURIComponent(roomId)}`);
  return result.feedback;
}
