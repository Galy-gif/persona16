import type { RelationshipBranch, RelationshipClimate } from './relationshipBranch';

export type RelationshipContextEvidenceKind =
  | 'shared_context'
  | 'interaction_style'
  | 'boundary'
  | 'tension'
  | 'turning_point'
  | 'preference'
  | 'repeated_pattern';

interface RelationshipContextEvidenceBase {
  id: string;
  kind: RelationshipContextEvidenceKind;
  content: string;
}

export type RelationshipContextEvidence = RelationshipContextEvidenceBase & (
  | {
      traceability: 'traceable';
      sourceTurnId: string;
      sourceEventId?: string;
    }
  | {
      traceability: 'legacy_untraceable';
    }
);

export type RelationshipContextFocus =
  | 'ordinary'
  | 'decision'
  | 'support'
  | 'conflict'
  | 'repair'
  | 'explicit_end'
  | 'room';

export interface RelationshipContextSelection {
  focus?: RelationshipContextFocus;
  maxEvidence?: number;
}

export interface RelationshipPromptContext {
  memoryEnabled: boolean;
  intimacy?: number;
  climate?: RelationshipClimate;
  trust?: RelationshipBranch['trust'];
  evidence: RelationshipContextEvidence[];
}

const CLIMATE_INSTRUCTIONS: Record<RelationshipClimate, string> = {
  unfamiliar: '关系仍陌生：保持边界和少量试探，不假装已有默契或亲密。',
  steady: '关系当前稳定：可以使用已确认的共同语境，但不要把稳定等同于永远赞同。',
  warm: '关系当前温暖：允许更自然的默契与坦率，仍保留人物判断和用户边界。',
  tense: '关系当前紧张：不要跳过尚未解决的张力，也不要用撤回关心惩罚用户。',
  repairing: '关系正在修复：优先承担具体影响和恢复选择权，不要求用户立即原谅。',
};

const EVIDENCE_LABELS: Record<RelationshipContextEvidenceKind, string> = {
  shared_context: '共同语境',
  interaction_style: '已确认的互动方式',
  boundary: '有效边界',
  tension: '尚未解决的张力',
  turning_point: '已经历的转折（只作历史，不等于当前仍冲突）',
  preference: '用户已确认偏好',
  repeated_pattern: '用户已确认的重复模式',
};

const DECISION_AUTONOMY_BOUNDARY = /(?:不要|不能|请别|别).{0,12}(?:替(?:我|用户)|帮我).{0,8}(?:决定|选择|拍板)|(?:决定权|选择权).{0,12}(?:归我|归用户|我自己|用户自己)/u;

export function relationshipEvidenceProtectsDecisionAutonomy(
  evidence: readonly RelationshipContextEvidence[],
): boolean {
  return evidence.some((item) => (
    item.kind === 'boundary' && DECISION_AUTONOMY_BOUNDARY.test(item.content)
  ));
}

function sourceLabel(item: RelationshipContextEvidence): string {
  if (item.traceability === 'legacy_untraceable') {
    return '旧版已确认记录，不可追溯';
  }
  const sources = [
    item.sourceEventId ? `关系事件 ${item.sourceEventId}` : `记忆 ${item.id}`,
    `对话轮次 ${item.sourceTurnId}`,
  ];
  return sources.join('；');
}

const FOCUS_PRIORITY: Record<RelationshipContextFocus, readonly RelationshipContextEvidenceKind[]> = {
  ordinary: ['interaction_style', 'shared_context', 'boundary', 'tension', 'turning_point', 'preference', 'repeated_pattern'],
  decision: ['boundary', 'preference', 'shared_context', 'interaction_style', 'tension', 'repeated_pattern', 'turning_point'],
  support: ['boundary', 'interaction_style', 'tension', 'shared_context', 'preference', 'repeated_pattern', 'turning_point'],
  conflict: ['boundary', 'tension', 'interaction_style', 'turning_point', 'shared_context', 'preference', 'repeated_pattern'],
  repair: ['boundary', 'tension', 'turning_point', 'interaction_style', 'shared_context', 'preference', 'repeated_pattern'],
  explicit_end: ['boundary', 'interaction_style', 'preference', 'tension', 'shared_context', 'repeated_pattern', 'turning_point'],
  room: ['boundary', 'tension', 'shared_context', 'interaction_style', 'preference', 'repeated_pattern', 'turning_point'],
};

export function selectRelationshipEvidence(
  evidence: readonly RelationshipContextEvidence[],
  selection: RelationshipContextSelection = {},
): RelationshipContextEvidence[] {
  const focus = selection.focus ?? 'ordinary';
  const maxEvidence = selection.maxEvidence ?? 4;
  const priority = FOCUS_PRIORITY[focus];
  return [...evidence]
    .sort((left, right) => priority.indexOf(left.kind) - priority.indexOf(right.kind))
    .slice(0, Math.max(0, maxEvidence));
}

export function relationshipBranchToPromptContext(
  branch: RelationshipBranch,
  selection: RelationshipContextSelection = {},
): RelationshipPromptContext {
  const evidence: RelationshipContextEvidence[] = [];
  const sourceEvents = new Map(branch.eventLog.map((event) => [event.id, event]));
  const append = (
    kind: RelationshipContextEvidenceKind,
    values: RelationshipBranch['sharedContext'],
  ) => {
    for (const value of [...values].reverse()) {
      const sourceType = sourceEvents.get(value.sourceEventId)?.type;
      const projectedKind = sourceType === 'pattern_confirmed'
        ? 'repeated_pattern'
        : sourceType === 'preference_stated' ? 'preference' : kind;
      evidence.push({
        id: value.id,
        kind: projectedKind,
        content: value.content,
        traceability: 'traceable',
        sourceEventId: value.sourceEventId,
        sourceTurnId: value.sourceTurnId,
      });
    }
  };

  append('shared_context', branch.sharedContext);
  append('interaction_style', branch.interactionStyle);
  append('boundary', branch.boundaries);
  append('tension', branch.tensions.filter((tension) => tension.status !== 'resolved'));
  append('turning_point', branch.turningPoints);

  return {
    memoryEnabled: branch.memoryEnabled,
    climate: branch.recentClimate,
    trust: { ...branch.trust },
    evidence: selectRelationshipEvidence(evidence, selection),
  };
}

export function renderRelationshipPromptContext(
  context: RelationshipPromptContext,
  selection: RelationshipContextSelection = {},
): string {
  if (!context.memoryEnabled) {
    return '关系记忆已由用户关闭；不要使用既有关系数据推断或个性化。';
  }

  const selectedEvidence = selectRelationshipEvidence(context.evidence, selection);
  const sections: string[] = [
    '来源编号只用于内部校验，不得向用户朗读。没有列出的过去，不得自行补写。',
  ];
  if (selectedEvidence.some((item) => item.kind === 'boundary')) {
    sections.push([
      '【已确认边界：本轮硬约束】',
      '已确认边界是本轮硬约束，优先级高于人格语气、用户偏好、主持器切入角度和直接给判断的冲动。',
      '若边界与偏好冲突，先守边界，再在边界内满足偏好；不能把“先给结论”理解为可以越过用户的决定权。',
      relationshipEvidenceProtectsDecisionAutonomy(selectedEvidence)
        ? [
            '这条边界保护用户的选择权：可以指出关键变量、比较标准、条件性后果或提出一个问题；不得直接说“选 X”“就选 X”或“你应该选 X”。',
            '尊重用户提出问题的方式：不要以“你问错了”或“你问反了”否定用户的问题，可以直接指出问题里真正需要权衡的部分。',
            '本轮不能停在重新定义问题：必须给出一个用户本轮就能使用的比较方法，说明至少一个关键变量、阈值或可逆实验该怎么帮助判断；不能只改写问题或只描述长期代价。',
          ].join('\n')
        : '',
    ].filter(Boolean).join('\n'));
  }
  if (context.climate) sections.push(CLIMATE_INSTRUCTIONS[context.climate]);
  if (context.trust) {
    sections.push(`信任结构：可靠性 ${context.trust.reliability}｜自我披露 ${context.trust.disclosure}`);
  }
  if (context.intimacy !== undefined) {
    sections.push(`旧版亲密度：${context.intimacy}/5；它只能调整表达距离，不能证明发生过任何共同经历。`);
  }

  for (const kind of Object.keys(EVIDENCE_LABELS) as RelationshipContextEvidenceKind[]) {
    const values = selectedEvidence.filter((item) => item.kind === kind);
    if (values.length === 0) continue;
    sections.push(`${EVIDENCE_LABELS[kind]}：\n${values
      .map((item) => `- ${item.content}（${sourceLabel(item)}）`)
      .join('\n')}`);
  }
  return sections.join('\n\n');
}
