export type RelationshipClimate =
  | 'unfamiliar'
  | 'steady'
  | 'warm'
  | 'tense'
  | 'repairing';

export interface RelationshipEvidence {
  id: string;
  content: string;
  sourceEventId: string;
  sourceTurnId: string;
}

export interface RelationshipBoundary extends RelationshipEvidence {
  status: 'active';
}

export interface RelationshipTension extends RelationshipEvidence {
  status: 'unresolved' | 'repairing' | 'resolved';
  resolvedByEventId?: string;
}

export interface RelationshipTurningPoint extends RelationshipEvidence {
  kind: 'trust' | 'rupture' | 'repair' | 'shared_language';
}

interface RelationshipEventBase {
  id: string;
  sourceTurnId: string;
  content: string;
}

export type RelationshipEvent =
  | (RelationshipEventBase & { type: 'context_shared' })
  | (RelationshipEventBase & { type: 'preference_stated' })
  | (RelationshipEventBase & { type: 'boundary_set' })
  | (RelationshipEventBase & { type: 'boundary_revised'; boundaryId: string })
  | (RelationshipEventBase & { type: 'misread_corrected' })
  | (RelationshipEventBase & { type: 'meaningful_disagreement' })
  | (RelationshipEventBase & { type: 'repair_attempted'; tensionId: string })
  | (RelationshipEventBase & { type: 'repair_accepted'; tensionId: string })
  | (RelationshipEventBase & { type: 'repair_declined'; tensionId: string })
  | (RelationshipEventBase & { type: 'shared_success' })
  | (RelationshipEventBase & { type: 'shared_language_adopted' });

export interface RelationshipBranch {
  version: 1;
  characterId: string;
  memoryEnabled: boolean;
  sharedContext: RelationshipEvidence[];
  interactionStyle: RelationshipEvidence[];
  boundaries: RelationshipBoundary[];
  tensions: RelationshipTension[];
  turningPoints: RelationshipTurningPoint[];
  trust: {
    reliability: 'unknown' | 'fragile' | 'established' | 'strained';
    disclosure: 'guarded' | 'selective' | 'open';
  };
  recentClimate: RelationshipClimate;
  eventLog: RelationshipEvent[];
}

export function createRelationshipBranch(characterId: string): RelationshipBranch {
  if (!characterId.trim()) throw new Error('关系分支必须绑定正典人物');
  return {
    version: 1,
    characterId,
    memoryEnabled: true,
    sharedContext: [],
    interactionStyle: [],
    boundaries: [],
    tensions: [],
    turningPoints: [],
    trust: { reliability: 'unknown', disclosure: 'guarded' },
    recentClimate: 'unfamiliar',
    eventLog: [],
  };
}

function evidence(prefix: string, event: RelationshipEvent): RelationshipEvidence {
  return {
    id: `${prefix}:${event.id}`,
    content: event.content,
    sourceEventId: event.id,
    sourceTurnId: event.sourceTurnId,
  };
}

function turningPoint(
  event: RelationshipEvent,
  kind: RelationshipTurningPoint['kind'],
): RelationshipTurningPoint {
  return { ...evidence('turning-point', event), kind };
}

function updateTension(
  branch: RelationshipBranch,
  tensionId: string,
  allowedStatuses: RelationshipTension['status'][],
  invalidTransitionMessage: string,
  update: (tension: RelationshipTension) => RelationshipTension,
): RelationshipTension[] {
  const target = branch.tensions.find((tension) => tension.id === tensionId);
  if (!target) {
    throw new Error(`找不到待处理的关系张力：${tensionId}`);
  }
  if (!allowedStatuses.includes(target.status)) throw new Error(invalidTransitionMessage);
  return branch.tensions.map((tension) => tension.id === tensionId ? update(tension) : tension);
}

function sameEvent(left: RelationshipEvent, right: RelationshipEvent): boolean {
  const leftTarget = 'tensionId' in left
    ? left.tensionId
    : 'boundaryId' in left ? left.boundaryId : undefined;
  const rightTarget = 'tensionId' in right
    ? right.tensionId
    : 'boundaryId' in right ? right.boundaryId : undefined;
  return left.type === right.type
    && left.sourceTurnId === right.sourceTurnId
    && left.content === right.content
    && leftTarget === rightTarget;
}

function recordEvent(branch: RelationshipBranch, event: RelationshipEvent): RelationshipEvent[] {
  return [...branch.eventLog, { ...event }];
}

function activeTensionClimate(
  tensions: readonly RelationshipTension[],
): 'tense' | 'repairing' | undefined {
  if (tensions.some((tension) => tension.status === 'unresolved')) return 'tense';
  if (tensions.some((tension) => tension.status === 'repairing')) return 'repairing';
  return undefined;
}

export function applyRelationshipEvent(
  branch: RelationshipBranch,
  event: RelationshipEvent,
): RelationshipBranch {
  const recorded = branch.eventLog.find((candidate) => candidate.id === event.id);
  if (recorded) {
    if (sameEvent(recorded, event)) return branch;
    throw new Error(`关系事件 id 冲突：${event.id}`);
  }
  if (!event.id.trim() || !event.sourceTurnId.trim() || !event.content.trim()) {
    throw new Error('关系事件必须包含可追溯的 id、sourceTurnId 与 content');
  }
  if (!branch.memoryEnabled) throw new Error('关系记忆已关闭，不能写入新的关系事件');

  if (event.type === 'boundary_set') {
    return {
      ...branch,
      boundaries: [
        ...branch.boundaries,
        { ...evidence('boundary', event), status: 'active' },
      ],
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'boundary_revised') {
    if (!branch.boundaries.some((boundary) => boundary.id === event.boundaryId)) {
      throw new Error(`找不到待修正的关系边界：${event.boundaryId}`);
    }
    return {
      ...branch,
      boundaries: branch.boundaries.map((boundary) => boundary.id === event.boundaryId
        ? {
            ...boundary,
            content: event.content,
            sourceEventId: event.id,
            sourceTurnId: event.sourceTurnId,
          }
        : boundary),
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'context_shared') {
    return {
      ...branch,
      sharedContext: [...branch.sharedContext, evidence('context', event)],
      trust: {
        ...branch.trust,
        disclosure: branch.trust.disclosure === 'guarded' ? 'selective' : branch.trust.disclosure,
      },
      recentClimate: branch.recentClimate === 'unfamiliar' ? 'steady' : branch.recentClimate,
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'preference_stated' || event.type === 'misread_corrected') {
    return {
      ...branch,
      interactionStyle: [...branch.interactionStyle, evidence('style', event)],
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'meaningful_disagreement') {
    return {
      ...branch,
      tensions: [
        ...branch.tensions,
        { ...evidence('tension', event), status: 'unresolved' },
      ],
      turningPoints: [...branch.turningPoints, turningPoint(event, 'rupture')],
      trust: { ...branch.trust, reliability: 'strained' },
      recentClimate: 'tense',
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'repair_attempted') {
    const tensions = updateTension(
      branch,
      event.tensionId,
      ['unresolved'],
      '只能对尚未解决的关系张力发起修复',
      (tension) => ({
        ...tension,
        status: 'repairing',
      }),
    );
    return {
      ...branch,
      tensions,
      recentClimate: activeTensionClimate(tensions) ?? 'steady',
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'repair_accepted') {
    const tensions = updateTension(
      branch,
      event.tensionId,
      ['repairing'],
      '只能接受正在修复的关系张力',
      (tension) => ({
        ...tension,
        status: 'resolved',
        resolvedByEventId: event.id,
      }),
    );
    const tensionClimate = activeTensionClimate(tensions);
    return {
      ...branch,
      tensions,
      turningPoints: [...branch.turningPoints, turningPoint(event, 'repair')],
      trust: {
        ...branch.trust,
        reliability: tensionClimate
          ? 'strained'
          : branch.trust.reliability === 'established' ? 'established' : 'fragile',
      },
      recentClimate: tensionClimate ?? 'steady',
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'repair_declined') {
    return {
      ...branch,
      tensions: updateTension(
        branch,
        event.tensionId,
        ['repairing'],
        '只能拒绝正在修复的关系张力',
        (tension) => ({
          ...tension,
          status: 'unresolved',
        }),
      ),
      trust: { ...branch.trust, reliability: 'strained' },
      recentClimate: 'tense',
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'shared_success') {
    const tensionClimate = activeTensionClimate(branch.tensions);
    return {
      ...branch,
      turningPoints: [...branch.turningPoints, turningPoint(event, 'trust')],
      trust: {
        reliability: tensionClimate ? 'strained' : 'established',
        disclosure: branch.trust.disclosure,
      },
      recentClimate: tensionClimate ?? 'warm',
      eventLog: recordEvent(branch, event),
    };
  }

  if (event.type === 'shared_language_adopted') {
    const tensionClimate = activeTensionClimate(branch.tensions);
    return {
      ...branch,
      interactionStyle: [...branch.interactionStyle, evidence('style', event)],
      turningPoints: [...branch.turningPoints, turningPoint(event, 'shared_language')],
      recentClimate: tensionClimate ?? 'warm',
      eventLog: recordEvent(branch, event),
    };
  }

  throw new Error(`不支持的关系事件：${(event as { type: string }).type}`);
}

export function setRelationshipMemoryEnabled(
  branch: RelationshipBranch,
  enabled: boolean,
): RelationshipBranch {
  return branch.memoryEnabled === enabled ? branch : { ...branch, memoryEnabled: enabled };
}

export function resetRelationshipBranch(branch: RelationshipBranch): RelationshipBranch {
  return {
    ...createRelationshipBranch(branch.characterId),
    memoryEnabled: branch.memoryEnabled,
  };
}

function replayRelationshipEvents(
  characterId: string,
  memoryEnabled: boolean,
  events: readonly RelationshipEvent[],
): RelationshipBranch {
  const rebuilt = events.reduce(
    (current, event) => applyRelationshipEvent(current, event),
    createRelationshipBranch(characterId),
  );
  return memoryEnabled ? rebuilt : setRelationshipMemoryEnabled(rebuilt, false);
}

export function forgetRelationshipEvidence(
  branch: RelationshipBranch,
  evidenceId: string,
): RelationshipBranch {
  const allEvidence: RelationshipEvidence[] = [
    ...branch.sharedContext,
    ...branch.interactionStyle,
    ...branch.boundaries,
    ...branch.tensions,
    ...branch.turningPoints,
  ];
  const target = allEvidence.find((item) => item.id === evidenceId);
  if (!target) throw new Error(`找不到要遗忘的关系依据：${evidenceId}`);

  const relatedEventIds = new Set([target.sourceEventId]);
  const sourceEvent = branch.eventLog.find((event) => event.id === target.sourceEventId);
  const relatedTensionId = evidenceId.startsWith('tension:')
    ? evidenceId
    : sourceEvent?.type === 'meaningful_disagreement'
      ? `tension:${sourceEvent.id}`
      : undefined;
  const relatedBoundaryId = evidenceId.startsWith('boundary:') ? evidenceId : undefined;
  if (relatedBoundaryId) relatedEventIds.add(relatedBoundaryId.slice('boundary:'.length));
  for (const event of branch.eventLog) {
    if (relatedTensionId && 'tensionId' in event && event.tensionId === relatedTensionId) {
      relatedEventIds.add(event.id);
    }
    if (relatedBoundaryId && 'boundaryId' in event && event.boundaryId === relatedBoundaryId) {
      relatedEventIds.add(event.id);
    }
  }

  return replayRelationshipEvents(
    branch.characterId,
    branch.memoryEnabled,
    branch.eventLog.filter((event) => !relatedEventIds.has(event.id)),
  );
}
