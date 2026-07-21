import {
  applyRelationshipEvent,
  createRelationshipBranch,
  getPilotCharacter,
  type AgentType,
  type RelationshipBranch,
  type RelationshipEvent,
} from '@persona16/engine';
import type { MemoryRecord, RelationshipEventRecord } from './types';

export function relationshipCharacterId(agent: AgentType): string {
  return getPilotCharacter(agent)?.id ?? `legacy-${agent.toLowerCase()}`;
}

export function relationshipEventTarget(event: RelationshipEvent): string | null {
  return 'boundaryId' in event
    ? event.boundaryId
    : 'tensionId' in event ? event.tensionId : null;
}

export function sameRelationshipEvent(left: RelationshipEvent, right: RelationshipEvent): boolean {
  return left.id === right.id
    && left.type === right.type
    && left.sourceTurnId === right.sourceTurnId
    && left.content === right.content
    && relationshipEventTarget(left) === relationshipEventTarget(right);
}

export function relationshipEventFromMemory(memory: MemoryRecord): RelationshipEventRecord {
  const eventBase = {
    id: `memory:${memory.id}`,
    sourceTurnId: memory.sourceTurnId,
    content: memory.content,
  };
  const event: RelationshipEvent = memory.kind === 'preference'
    ? { ...eventBase, type: 'preference_stated' }
    : memory.kind === 'boundary'
      ? { ...eventBase, type: 'boundary_set' }
      : { ...eventBase, type: 'pattern_confirmed' };

  return {
    id: event.id,
    userId: memory.userId,
    agent: memory.agent,
    characterId: relationshipCharacterId(memory.agent),
    event,
    sourceMemoryId: memory.id,
    createdAt: new Date(memory.updatedAt),
  };
}

export function rebuildRelationshipBranch(
  characterId: string,
  records: readonly RelationshipEventRecord[],
): RelationshipBranch {
  return [...records]
    .sort((left, right) => (
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
    ))
    .reduce(
      (branch, record) => applyRelationshipEvent(branch, record.event),
      createRelationshipBranch(characterId),
    );
}
