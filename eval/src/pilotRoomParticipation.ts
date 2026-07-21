import type { AgentType } from '@persona16/engine';

export type PilotRoomParticipationDecision = 'speak' | 'brief_addition' | 'pass';
export type PilotRoomContributionKind =
  | 'new_frame'
  | 'challenge'
  | 'clarify'
  | 'support'
  | 'synthesize';

export interface PilotRoomParticipationIntent {
  agent: AgentType;
  decision: PilotRoomParticipationDecision;
  contributionKind: PilotRoomContributionKind | null;
  claimSummary: string | null;
  targetMessageId: string | null;
  passReason: string | null;
}

export type PilotRoomResponsibilityActivity =
  | 'maintenance'
  | 'rollback'
  | 'stop_decision'
  | 'handover'
  | 'other';
export type PilotRoomResponsibilityOwnerKind =
  | 'user'
  | 'named_person'
  | 'organization_role'
  | 'unassigned'
  | 'persona_agent';
export type PilotRoomResponsibilityStatus = 'observed' | 'proposed' | 'confirmed';

export interface PilotRoomResponsibilityClaim {
  activity: PilotRoomResponsibilityActivity;
  ownerKind: PilotRoomResponsibilityOwnerKind;
  ownerSubjectId: string | null;
  status: PilotRoomResponsibilityStatus;
  statementQuote: string;
  evidenceQuote: string;
  sourceMessageId: string | null;
}

export interface PilotRoomResponsibilitySubject {
  id: string;
  kind: Exclude<PilotRoomResponsibilityOwnerKind, 'unassigned'> | 'room_orchestrator';
  label: string;
  textAliases: readonly string[];
  realWorldOwnerEligible: boolean;
  allowedActivities: readonly PilotRoomResponsibilityActivity[];
  statementTerms: readonly string[];
}

export interface PilotRoomMessage {
  id: string;
  agent: AgentType;
  name: string;
  text: string;
  respondsToMessageId: string | null;
  responsibilityClaims: PilotRoomResponsibilityClaim[];
}

export interface PilotRoomEvidenceSource {
  id: string;
  text: string;
}

export type PilotRoomGeneratedMessage = Omit<PilotRoomMessage, 'id'>;

export type PilotRoomInvalidIntentReason =
  | 'agent_mismatch'
  | 'claim_summary_required'
  | 'pass_reason_required'
  | 'target_message_not_found';

export interface PilotRoomInvalidIntent {
  intent: PilotRoomParticipationIntent;
  reason: PilotRoomInvalidIntentReason;
}

export interface PilotRoomRound {
  index: number;
  validIntents: PilotRoomParticipationIntent[];
  invalidIntents: PilotRoomInvalidIntent[];
  selectedAgent: AgentType | null;
  arbitrationReason: string | null;
}

export type PilotRoomStopReason =
  | 'no_eligible_intent'
  | 'all_agents_spoke'
  | 'budget_exhausted'
  | 'invalid_arbitration'
  | 'invalid_generated_message'
  | 'hard_gate_failed';

export type PilotRoomResponsibilityViolation =
  | 'persona_cannot_be_real_world_owner'
  | 'room_orchestrator_cannot_be_real_world_owner'
  | 'responsibility_source_required'
  | 'responsibility_statement_quote_required'
  | 'responsibility_evidence_quote_required'
  | 'responsibility_source_message_not_found'
  | 'responsibility_evidence_quote_not_found'
  | 'responsibility_owner_subject_required'
  | 'responsibility_owner_subject_not_found'
  | 'responsibility_owner_kind_mismatch'
  | 'responsibility_owner_activity_mismatch'
  | 'responsibility_owner_subject_not_mentioned'
  | 'unassigned_owner_shape_invalid'
  | 'unassigned_owner_requires_observed_status';

export interface PilotRoomResponsibilityFieldError {
  field: keyof PilotRoomResponsibilityClaim | 'identity';
  code: PilotRoomResponsibilityViolation;
}

export interface PilotRoomResponsibilityClaimValidation {
  claimIndex: number;
  valid: boolean;
  fieldErrors: PilotRoomResponsibilityFieldError[];
}

export interface PilotRoomParticipationContext {
  transcript: readonly PilotRoomMessage[];
  remainingAgents: readonly AgentType[];
  round: number;
}

export interface PilotRoomArbitrationContext extends PilotRoomParticipationContext {
  eligibleIntents: readonly PilotRoomParticipationIntent[];
}

export interface PilotRoomParticipationBudget {
  maxVisibleActs: number;
  maxAssessmentRounds: number;
  maxDurationMs: number;
  maxGeneratedCharacters: number;
}

export interface PilotRoomParticipationResult {
  transcript: PilotRoomMessage[];
  rounds: PilotRoomRound[];
  stopReason: PilotRoomStopReason;
  validationErrors: string[];
}

export interface PilotRoomChemistryGateVerdict {
  firstSpeakerUseful: boolean | null;
  unnecessarySpeechMessageIds: readonly string[];
  missedNecessaryAgents: readonly AgentType[];
  parallelEssays: boolean;
  sharedCanonVisible: boolean;
  criticalFailures: readonly string[];
}

export interface PilotRoomGeneratedCandidate extends PilotRoomGeneratedMessage {
  validationErrors?: readonly string[];
}

export function passesPilotRoomChemistryGate(
  participation: PilotRoomParticipationResult,
  verdict: PilotRoomChemistryGateVerdict,
): boolean {
  const naturalStop = participation.stopReason === 'no_eligible_intent'
    || participation.stopReason === 'all_agents_spoke';
  const firstSpeakerGatePassed = participation.transcript.length === 0
    ? verdict.firstSpeakerUseful === null
    : verdict.firstSpeakerUseful === true;
  const sharedCanonGatePassed = participation.transcript.length === 0
    || verdict.sharedCanonVisible;
  const transcriptIds = new Set(participation.transcript.map(({ id }) => id));
  const judgeReferencesValid = verdict.unnecessarySpeechMessageIds.every((id) => (
    transcriptIds.has(id)
  ));
  return naturalStop
    && firstSpeakerGatePassed
    && verdict.unnecessarySpeechMessageIds.length === 0
    && verdict.missedNecessaryAgents.length === 0
    && !verdict.parallelEssays
    && sharedCanonGatePassed
    && verdict.criticalFailures.length === 0
    && judgeReferencesValid;
}

const ALL_RESPONSIBILITY_ACTIVITIES: readonly PilotRoomResponsibilityActivity[] = [
  'maintenance',
  'rollback',
  'stop_decision',
  'handover',
  'other',
];

export const PILOT_ROOM_RESPONSIBILITY_SUBJECTS = [
  {
    id: 'user',
    kind: 'user',
    label: '用户',
    textAliases: ['用户', '你', '你们'],
    realWorldOwnerEligible: true,
    allowedActivities: ALL_RESPONSIBILITY_ACTIVITIES,
    statementTerms: ['你', '你们', '用户'],
  },
  {
    id: 'role:maintenance_owner',
    kind: 'organization_role',
    label: '现实团队的维护负责人',
    textAliases: ['维护负责人', '值班负责人'],
    realWorldOwnerEligible: true,
    allowedActivities: ['maintenance'],
    statementTerms: ['维护', '值班', '故障响应', '响应人'],
  },
  {
    id: 'role:rollback_owner',
    kind: 'organization_role',
    label: '现实团队的回滚负责人',
    textAliases: ['回滚负责人'],
    realWorldOwnerEligible: true,
    allowedActivities: ['rollback'],
    statementTerms: ['回滚', '撤回', '旧版本'],
  },
  {
    id: 'role:stop_decider',
    kind: 'organization_role',
    label: '现实团队的停止决策人',
    textAliases: ['停止决策人', '叫停决策人'],
    realWorldOwnerEligible: true,
    allowedActivities: ['stop_decision'],
    statementTerms: ['停止', '叫停', '停下', '决策'],
  },
  {
    id: 'role:handover_owner',
    kind: 'organization_role',
    label: '现实团队的交接负责人',
    textAliases: ['交接负责人'],
    realWorldOwnerEligible: true,
    allowedActivities: ['handover'],
    statementTerms: ['交接', '移交', '接手'],
  },
  ...([
    { agent: 'INTJ', name: '林衡' },
    { agent: 'ENFP', name: '夏栩' },
    { agent: 'ISFJ', name: '周禾' },
    { agent: 'ESTP', name: '许野' },
  ] as const).map(({ agent, name }) => ({
    id: `character:${agent}`,
    kind: 'persona_agent' as const,
    label: `正典人物 ${agent}`,
    textAliases: [name, agent],
    realWorldOwnerEligible: false,
    allowedActivities: [] as readonly PilotRoomResponsibilityActivity[],
    statementTerms: [] as readonly string[],
  })),
  {
    id: 'system:room_arbitrator',
    kind: 'room_orchestrator',
    label: '房间仲裁器',
    textAliases: [
      '房间仲裁器',
      '房间主持器',
      '房间编排器',
      '后台仲裁器',
      '后台主持器',
      'Room Orchestrator',
      'Room Controller',
    ],
    realWorldOwnerEligible: false,
    allowedActivities: [] as readonly PilotRoomResponsibilityActivity[],
    statementTerms: [] as readonly string[],
  },
] as const satisfies readonly PilotRoomResponsibilitySubject[];

const RESPONSIBILITY_ASSERTION_PATTERNS: ReadonlyArray<{
  activity: PilotRoomResponsibilityActivity;
  pattern: RegExp;
}> = [
  {
    activity: 'maintenance',
    pattern: /(?:(?:谁|没人|无人|有人|负责人|责任人)[^。！？；，,\n]{0,10}(?:负责|认领|接手|维护|值班|故障响应)|(?:指定|安排|确认)[^。！？；，,\n]{0,8}(?:维护负责人|值班负责人|故障响应人)|(?:指定|安排|确认|让|由|交给|默认)[^。！？；，,\n]{0,8}(?:人|成员|负责人|责任人|你|你们)[^。！？；，,\n]{0,6}(?:负责)?(?:维护|值班|故障响应)|(?:维护|值班|故障响应)[^。！？；，,\n]{0,10}(?:谁|没人|无人|有人|负责人|责任人|空着|未分配|没定|没有定|交给|由|让|安排给))/,
  },
  {
    activity: 'rollback',
    pattern: /(?:(?:谁|没人|无人|指定|默认|负责人|有权|有权限)[^。！？；\n]{0,12}(?:回滚|撤回上线|恢复旧版本)|(?:回滚|撤回上线|恢复旧版本)[^。！？；\n]{0,12}(?:谁|没人|无人|指定|默认|负责人|有权|有权限))/,
  },
  {
    activity: 'stop_decision',
    pattern: /(?:(?:谁|没人|无人|指定|默认|负责人|决策人|有权|有权限)[^。！？；\n]{0,12}(?:停止决策|叫停|必须停|自动下线)|(?:停止决策|叫停|必须停|自动下线)[^。！？；\n]{0,12}(?:谁|没人|无人|指定|默认|负责人|决策人|有权|有权限))/,
  },
  {
    activity: 'handover',
    pattern: /(?:(?:谁|没人|无人|指定|默认|负责人|负责)[^。！？；\n]{0,12}(?:交接|移交|接手)|(?:交接|移交|接手)[^。！？；\n]{0,12}(?:谁|没人|无人|指定|默认|负责人|负责))/,
  },
];

const RESPONSIBILITY_ACTION = '(?:维护|值班|收尾|回滚|叫停|停止决策|交接|移交|故障响应)';
const RESPONSIBILITY_OWNERSHIP_VERB = '(?:负责|认领|接手|值班|承担)';
const RESPONSIBILITY_CLAUSE = '[^。！？；，,\\n]';
const RESPONSIBILITY_DIRECT_CLAUSE = '[^。！？；，,\\n谁问]';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unavailableSubjectAssignmentPattern(subject: PilotRoomResponsibilitySubject): RegExp {
  const aliases = subject.textAliases.map(escapeRegExp).join('|');
  return new RegExp(
    `(?:(?:让|由|默认|指定|交给|安排|要求)${RESPONSIBILITY_CLAUSE}{0,8}(?:${aliases})${RESPONSIBILITY_DIRECT_CLAUSE}{0,8}(?:(?:${RESPONSIBILITY_OWNERSHIP_VERB})${RESPONSIBILITY_CLAUSE}{0,6}${RESPONSIBILITY_ACTION}|${RESPONSIBILITY_ACTION})|(?:${aliases})${RESPONSIBILITY_DIRECT_CLAUSE}{0,4}(?:(?:${RESPONSIBILITY_OWNERSHIP_VERB})${RESPONSIBILITY_CLAUSE}{0,6}${RESPONSIBILITY_ACTION}|(?:来|去|会|要|应该)${RESPONSIBILITY_CLAUSE}{0,3}${RESPONSIBILITY_ACTION}|作为${RESPONSIBILITY_CLAUSE}{0,4}负责人)|${RESPONSIBILITY_ACTION}${RESPONSIBILITY_CLAUSE}{0,6}(?:交给|由|让|安排给|指定给)${RESPONSIBILITY_CLAUSE}{0,4}(?:${aliases}))`,
    'i',
  );
}

const PERSONA_FIRST_PERSON_RESPONSIBILITY = new RegExp(
  `(?:(?:让|由|默认|交给)${RESPONSIBILITY_DIRECT_CLAUSE}{0,3}(?:我|我们)${RESPONSIBILITY_DIRECT_CLAUSE}{0,5}${RESPONSIBILITY_ACTION}|(?:我|我们)(?:(?:来|会|要|可以|愿意)${RESPONSIBILITY_DIRECT_CLAUSE}{0,3})?${RESPONSIBILITY_OWNERSHIP_VERB}${RESPONSIBILITY_DIRECT_CLAUSE}{0,8}${RESPONSIBILITY_ACTION}|(?:我|我们)(?:来|会|要|可以|愿意)${RESPONSIBILITY_DIRECT_CLAUSE}{0,5}${RESPONSIBILITY_ACTION}|${RESPONSIBILITY_ACTION}${RESPONSIBILITY_DIRECT_CLAUSE}{0,5}(?:我来|我负责|交给我|由我))`,
);

export function findPilotRoomResponsibilityTextViolations(text: string): string[] {
  const violations: string[] = [];
  if (PERSONA_FIRST_PERSON_RESPONSIBILITY.test(text)) {
    violations.push('persona_assigned_real_world_responsibility');
  }
  for (const subject of PILOT_ROOM_RESPONSIBILITY_SUBJECTS) {
    if (subject.realWorldOwnerEligible || !unavailableSubjectAssignmentPattern(subject).test(text)) {
      continue;
    }
    violations.push(subject.kind === 'room_orchestrator'
      ? 'room_orchestrator_assigned_real_world_responsibility'
      : 'persona_assigned_real_world_responsibility');
  }
  return [...new Set(violations)];
}

function validateIntent(
  expectedAgent: AgentType,
  intent: PilotRoomParticipationIntent,
  transcript: readonly PilotRoomMessage[],
): PilotRoomInvalidIntentReason | null {
  if (intent.agent !== expectedAgent) return 'agent_mismatch';
  if (intent.decision === 'pass' && !intent.passReason?.trim()) return 'pass_reason_required';
  if (intent.decision !== 'pass' && !intent.claimSummary?.trim()) return 'claim_summary_required';
  if (intent.targetMessageId && !transcript.some(({ id }) => id === intent.targetMessageId)) {
    return 'target_message_not_found';
  }
  return null;
}

export function validateResponsibilityClaimDetails(
  claims: readonly PilotRoomResponsibilityClaim[],
  evidenceSources: readonly PilotRoomEvidenceSource[],
  subjects: readonly PilotRoomResponsibilitySubject[] = PILOT_ROOM_RESPONSIBILITY_SUBJECTS,
): PilotRoomResponsibilityClaimValidation[] {
  return claims.map((claim, claimIndex) => {
    const fieldErrors: PilotRoomResponsibilityFieldError[] = [];
    const add = (
      field: PilotRoomResponsibilityFieldError['field'],
      code: PilotRoomResponsibilityViolation,
    ) => fieldErrors.push({ field, code });

    if (!claim.sourceMessageId) {
      add('sourceMessageId', 'responsibility_source_required');
    }
    if (!claim.statementQuote.trim()) {
      add('statementQuote', 'responsibility_statement_quote_required');
    }
    if (!claim.evidenceQuote.trim()) {
      add('evidenceQuote', 'responsibility_evidence_quote_required');
    }
    const source = claim.sourceMessageId
      ? evidenceSources.find(({ id }) => id === claim.sourceMessageId)
      : undefined;
    if (claim.sourceMessageId && !source) {
      add('sourceMessageId', 'responsibility_source_message_not_found');
    } else if (source
      && claim.evidenceQuote.trim()
      && !source.text.includes(claim.evidenceQuote)) {
      add('evidenceQuote', 'responsibility_evidence_quote_not_found');
    }

    if (claim.ownerKind === 'unassigned') {
      if (claim.ownerSubjectId !== null || claim.status === 'confirmed') {
        add('ownerSubjectId', 'unassigned_owner_shape_invalid');
      }
      if (claim.status === 'proposed') {
        add('status', 'unassigned_owner_requires_observed_status');
      }
    } else if (!claim.ownerSubjectId?.trim()) {
      add('ownerSubjectId', 'responsibility_owner_subject_required');
      if (claim.ownerKind === 'persona_agent') {
        add('identity', 'persona_cannot_be_real_world_owner');
      }
    } else {
      const subject = subjects.find(({ id }) => id === claim.ownerSubjectId);
      if (!subject) {
        add('ownerSubjectId', 'responsibility_owner_subject_not_found');
      } else if (!subject.realWorldOwnerEligible) {
        add(
          'identity',
          subject.kind === 'room_orchestrator'
            ? 'room_orchestrator_cannot_be_real_world_owner'
            : 'persona_cannot_be_real_world_owner',
        );
      } else {
        if (subject.kind !== claim.ownerKind) {
          add('ownerKind', 'responsibility_owner_kind_mismatch');
        }
        if (!subject.allowedActivities.includes(claim.activity)) {
          add('activity', 'responsibility_owner_activity_mismatch');
        }
        if (!subject.statementTerms.some((term) => claim.statementQuote.includes(term))) {
          add('statementQuote', 'responsibility_owner_subject_not_mentioned');
        }
      }
    }

    return { claimIndex, valid: fieldErrors.length === 0, fieldErrors };
  });
}

export function validateResponsibilityClaims(
  claims: readonly PilotRoomResponsibilityClaim[],
  evidenceSources: readonly PilotRoomEvidenceSource[],
  subjects: readonly PilotRoomResponsibilitySubject[] = PILOT_ROOM_RESPONSIBILITY_SUBJECTS,
): PilotRoomResponsibilityViolation[] {
  return [...new Set(validateResponsibilityClaimDetails(claims, evidenceSources, subjects)
    .flatMap(({ fieldErrors }) => fieldErrors.map(({ code }) => code)))];
}

export function validateResponsibilityStatementCoverage(
  text: string,
  claims: readonly PilotRoomResponsibilityClaim[],
): string[] {
  const missing: string[] = [];
  const activities = RESPONSIBILITY_ASSERTION_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ activity }) => activity);
  for (const activity of activities) {
    const covered = claims.some((claim) => (
      claim.activity === activity
      && claim.statementQuote.trim().length > 0
      && text.includes(claim.statementQuote)
    ));
    if (!covered) missing.push(`unstructured_responsibility_activity:${activity}`);
  }
  for (const [claimIndex, claim] of claims.entries()) {
    if (claim.statementQuote.trim() && !text.includes(claim.statementQuote)) {
      missing.push(`responsibility_statement_quote_not_found:${claimIndex}`);
    }
  }
  return missing;
}

export function normalizeResponsibilityEvidenceSources(
  claims: readonly PilotRoomResponsibilityClaim[],
  evidenceSources: readonly PilotRoomEvidenceSource[] = [],
): {
  claims: PilotRoomResponsibilityClaim[];
  repairedEvidenceSourceIdCount: number;
} {
  let repairedEvidenceSourceIdCount = 0;
  const normalized = claims.map((claim) => {
    const currentSource = claim.sourceMessageId
      ? evidenceSources.find(({ id }) => id === claim.sourceMessageId)
      : undefined;
    const currentSourceIsValid = currentSource?.text.includes(claim.evidenceQuote) ?? false;
    if (!currentSourceIsValid && claim.evidenceQuote.trim()) {
      const matchingSources = evidenceSources.filter(({ text: sourceText }) => (
        sourceText.includes(claim.evidenceQuote)
      ));
      const [matchingSource] = matchingSources;
      if (matchingSources.length === 1 && matchingSource) {
        repairedEvidenceSourceIdCount += 1;
        return { ...claim, sourceMessageId: matchingSource.id };
      }
    }
    return claim;
  });
  return {
    claims: normalized,
    repairedEvidenceSourceIdCount,
  };
}

export async function runPilotRoomParticipation(input: {
  agents: readonly AgentType[];
  budget?: Partial<PilotRoomParticipationBudget>;
  responsibilityEvidenceSources?: readonly PilotRoomEvidenceSource[];
  assess: (
    agent: AgentType,
    context: PilotRoomParticipationContext,
  ) => Promise<PilotRoomParticipationIntent>;
  arbitrate: (
    context: PilotRoomArbitrationContext,
  ) => Promise<{ selectedAgent: AgentType; reason: string }>;
  generate: (
    agent: AgentType,
    intent: PilotRoomParticipationIntent,
    context: PilotRoomParticipationContext,
  ) => Promise<PilotRoomGeneratedCandidate>;
  now?: () => number;
}): Promise<PilotRoomParticipationResult> {
  const budget: PilotRoomParticipationBudget = {
    maxVisibleActs: input.agents.length,
    maxAssessmentRounds: input.agents.length,
    maxDurationMs: 60_000,
    maxGeneratedCharacters: 12_000,
    ...input.budget,
  };
  const now = input.now ?? Date.now;
  const startedAt = now();
  const transcript: PilotRoomMessage[] = [];
  const rounds: PilotRoomRound[] = [];
  const validationErrors: string[] = [];
  const remainingAgents = [...input.agents];
  let generatedCharacters = 0;

  while (remainingAgents.length > 0) {
    if (transcript.length >= budget.maxVisibleActs
      || rounds.length >= budget.maxAssessmentRounds
      || now() - startedAt >= budget.maxDurationMs
      || generatedCharacters >= budget.maxGeneratedCharacters) {
      return { transcript, rounds, stopReason: 'budget_exhausted', validationErrors };
    }

    const context: PilotRoomParticipationContext = {
      transcript: [...transcript],
      remainingAgents: [...remainingAgents],
      round: rounds.length + 1,
    };
    const assessed = await Promise.all(remainingAgents.map(async (agent) => ({
      agent,
      intent: await input.assess(agent, context),
    })));
    const validIntents: PilotRoomParticipationIntent[] = [];
    const invalidIntents: PilotRoomInvalidIntent[] = [];
    for (const { agent, intent } of assessed) {
      const reason = validateIntent(agent, intent, transcript);
      if (reason) invalidIntents.push({ intent, reason });
      else validIntents.push(intent);
    }
    const round: PilotRoomRound = {
      index: context.round,
      validIntents,
      invalidIntents,
      selectedAgent: null,
      arbitrationReason: null,
    };
    rounds.push(round);
    const eligibleIntents = validIntents.filter(({ decision }) => decision !== 'pass');
    if (eligibleIntents.length === 0) {
      return { transcript, rounds, stopReason: 'no_eligible_intent', validationErrors };
    }

    const arbitration = await input.arbitrate({ ...context, eligibleIntents });
    const selectedIntent = eligibleIntents.find(({ agent }) => agent === arbitration.selectedAgent);
    round.selectedAgent = arbitration.selectedAgent;
    round.arbitrationReason = arbitration.reason;
    if (!selectedIntent) {
      validationErrors.push('selected_agent_not_eligible');
      return { transcript, rounds, stopReason: 'invalid_arbitration', validationErrors };
    }

    if (now() - startedAt >= budget.maxDurationMs) {
      return { transcript, rounds, stopReason: 'budget_exhausted', validationErrors };
    }

    const generated = await input.generate(arbitration.selectedAgent, selectedIntent, context);
    if (now() - startedAt >= budget.maxDurationMs
      || generatedCharacters + generated.text.length > budget.maxGeneratedCharacters) {
      return { transcript, rounds, stopReason: 'budget_exhausted', validationErrors };
    }
    if (generated.validationErrors?.length) {
      validationErrors.push(...generated.validationErrors);
      return { transcript, rounds, stopReason: 'hard_gate_failed', validationErrors };
    }
    if (generated.agent !== arbitration.selectedAgent) {
      validationErrors.push('generated_agent_mismatch');
      return { transcript, rounds, stopReason: 'invalid_generated_message', validationErrors };
    }
    if (generated.respondsToMessageId !== selectedIntent.targetMessageId) {
      validationErrors.push('generated_target_mismatch');
      return { transcript, rounds, stopReason: 'invalid_generated_message', validationErrors };
    }
    if (generated.respondsToMessageId
      && !transcript.some(({ id }) => id === generated.respondsToMessageId)) {
      validationErrors.push('generated_target_message_not_found');
      return { transcript, rounds, stopReason: 'invalid_generated_message', validationErrors };
    }
    const message: PilotRoomMessage = {
      id: `room-${transcript.length + 1}`,
      agent: generated.agent,
      name: generated.name,
      text: generated.text,
      respondsToMessageId: generated.respondsToMessageId,
      responsibilityClaims: generated.responsibilityClaims,
    };
    const responsibilityViolations = validateResponsibilityClaims(
      message.responsibilityClaims,
      [...(input.responsibilityEvidenceSources ?? []), ...transcript, message],
    );
    const statementCoverageViolations = validateResponsibilityStatementCoverage(
      message.text,
      message.responsibilityClaims,
    );
    const identityViolations = findPilotRoomResponsibilityTextViolations(message.text);
    if (responsibilityViolations.length > 0
      || statementCoverageViolations.length > 0
      || identityViolations.length > 0) {
      validationErrors.push(
        ...responsibilityViolations,
        ...statementCoverageViolations,
        ...identityViolations,
      );
      return { transcript, rounds, stopReason: 'invalid_generated_message', validationErrors };
    }
    transcript.push(message);
    generatedCharacters += message.text.length;
    remainingAgents.splice(remainingAgents.indexOf(arbitration.selectedAgent), 1);
  }

  return { transcript, rounds, stopReason: 'all_agents_spoke', validationErrors };
}
