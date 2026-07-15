import type { AgentType, RoomState } from '../types';

export type MemoryKind = 'preference' | 'repeated_pattern' | 'boundary';
export type MemoryStatus = 'candidate' | 'confirmed' | 'rejected' | 'deleted';

export interface MemoryCandidateDraft {
  agent: AgentType;
  kind: MemoryKind;
  content: string;
}

export interface InjectableMemory extends MemoryCandidateDraft {
  status: MemoryStatus;
}

const SENSITIVE_DATA = [
  /身份证|护照|银行卡|信用卡|密码|验证码|住址|家庭地址/iu,
  /\b1[3-9]\d{9}\b/u,
  /\b\d{15,18}[0-9Xx]\b/u,
];

const MEMORY_PATTERNS: { kind: MemoryKind; pattern: RegExp }[] = [
  { kind: 'boundary', pattern: /我不喜欢|以后(?:别|不要)|不要再|请别|我的底线/iu },
  { kind: 'repeated_pattern', pattern: /我总是|我经常|每次都|我老是|反复会/iu },
  { kind: 'preference', pattern: /我(?:更)?喜欢|我的偏好|我希望你|请记住/iu },
];

export function extractMemoryCandidate(message: string, agent: AgentType): MemoryCandidateDraft | undefined {
  const content = message.trim();
  if (content.length < 6 || content.length > 240) return undefined;
  if (SENSITIVE_DATA.some((pattern) => pattern.test(content))) return undefined;
  const match = MEMORY_PATTERNS.find(({ pattern }) => pattern.test(content));
  return match ? { agent, kind: match.kind, content } : undefined;
}

export function applyConfirmedMemories(room: RoomState, memories: InjectableMemory[]): void {
  clearInjectedMemories(room);
  for (const memory of memories) {
    if (memory.status !== 'confirmed') continue;
    const relationship = room.agents.find((agent) => agent.type === memory.agent)?.relationship;
    if (!relationship) continue;
    const target = memory.kind === 'preference'
      ? relationship.userPrefers
      : memory.kind === 'repeated_pattern'
        ? relationship.repeatedPatterns
        : relationship.knownBoundaries;
    if (!target.includes(memory.content)) target.push(memory.content);
  }
}

/** 记忆 Store 是唯一真相源；Prompt 临时注入后不把内容复制回 rooms.state_json。 */
export function clearInjectedMemories(room: RoomState): void {
  for (const agent of room.agents) {
    agent.relationship.userPrefers = [];
    agent.relationship.repeatedPatterns = [];
    agent.relationship.knownBoundaries = [];
  }
}
