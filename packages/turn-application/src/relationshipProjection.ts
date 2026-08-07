import {
  relationshipBranchToPromptContext,
  type RoomState,
} from '@persona16/engine';
import type { RelationshipBranchRecord } from '@persona16/store';

export const RELATIONSHIP_PROJECTION_READ_TIMEOUT_MS = 100;

export interface RelationshipProjection {
  mode: 'active_projection';
  status: 'loaded' | 'bypassed';
  branches: Array<{
    agent: string;
    version: number;
    climate: string;
    eventCount: number;
    boundaryCount: number;
    tensionCount: number;
  }>;
}

function samePromptEvidence(
  left: NonNullable<RoomState['agents'][number]['relationship']['promptContext']>['evidence'][number],
  right: NonNullable<RoomState['agents'][number]['relationship']['promptContext']>['evidence'][number],
): boolean {
  if (left.id === right.id) return true;
  if (left.traceability === 'traceable'
    && right.traceability === 'traceable'
    && left.sourceEventId
    && left.sourceEventId === right.sourceEventId) return true;
  return left.kind === right.kind && left.content === right.content;
}

/** RelationshipBranch 是生产真相源；确认式 Memory 只作为尚未投影数据的兼容回退。 */
export function applyRelationshipBranchContexts(
  room: RoomState,
  records: readonly RelationshipBranchRecord[],
): void {
  for (const record of records) {
    const relationship = room.agents.find((agent) => agent.type === record.agent)?.relationship;
    if (!relationship) continue;
    const confirmedFallback = relationship.promptContext;
    const projected = relationshipBranchToPromptContext(record.branch, {
      maxEvidence: Number.MAX_SAFE_INTEGER,
    });
    const enrichedProjectedEvidence = projected.evidence.map((existing) => {
      const fallback = confirmedFallback?.evidence.find((candidate) => (
        samePromptEvidence(existing, candidate)
      ));
      if (existing.traceability !== 'traceable' || fallback?.traceability !== 'traceable') {
        return existing;
      }
      return {
        ...existing,
        sourceMessageId: existing.sourceMessageId ?? fallback.sourceMessageId,
        recordedAt: existing.recordedAt ?? fallback.recordedAt,
      };
    });
    relationship.promptContext = {
      ...projected,
      intimacy: confirmedFallback?.intimacy ?? relationship.intimacy,
      evidence: [
        ...enrichedProjectedEvidence,
        ...(confirmedFallback?.evidence ?? []).filter((candidate) => (
          !enrichedProjectedEvidence.some((existing) => samePromptEvidence(existing, candidate))
        )),
      ],
    };
  }
}

export async function observeWithin<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observed = Promise.resolve()
    .then(() => operation(controller.signal))
    .then((value) => ({ ok: true as const, value }))
    .catch(() => ({ ok: false as const }));
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new Error('relationship projection read timed out'));
      resolve({ ok: false });
    }, timeoutMs);
  });
  try {
    return await Promise.race([observed, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
