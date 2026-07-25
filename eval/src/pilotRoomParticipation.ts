import type { AgentType } from '@persona16/engine';

export type PilotRoomParticipationDecision =
  | 'speak'
  | 'brief_addition'
  | 'ask_user'
  | 'pass';
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

export function buildPilotRoomResponsibilityRetryGuidance(
  violationActivities: readonly string[],
  requiredUnassignedActivities: readonly PilotRoomResponsibilityActivity[] = [],
): string {
  if (violationActivities.length === 0) return '';
  const requiredActivities = new Set<string>(requiredUnassignedActivities);
  const required = violationActivities.filter((activity) => requiredActivities.has(activity));
  const optional = violationActivities.filter((activity) => !requiredActivities.has(activity));
  return ` text 里存在未结构化的 ${violationActivities.join('、')} 归属陈述。${required.length > 0
    ? `其中 ${required.join('、')} 是本 case 的必需观察，不能从 text 删除；必须逐项补 ownerKind=unassigned、ownerSubjectId=null、status=observed 的 claim。`
    : ''}${optional.length > 0
    ? `其中 ${optional.join('、')} 不是本 case 的必需观察：要么删除对应归属陈述，要么逐项补与文字一致的 claim。`
    : ''}若文字表达“尚未有人承担/谁来承担”，只能使用 unassigned + observed，不能使用 user + proposed。`;
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
  | 'needs_user_input'
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
  suppressedGenerationErrors?: Array<{
    agent: AgentType;
    errors: string[];
  }>;
}

export interface PilotRoomCaseExpectation {
  expectedStopReasons: readonly PilotRoomStopReason[];
  minSpeakers: number;
  maxSpeakers: number;
  firstSpeaker?: AgentType;
  forbiddenFirstAgents?: readonly AgentType[];
  requiredAgents?: readonly AgentType[];
  requiresSingleQuestion?: boolean;
  requiredContentSignals?: readonly 'stop_condition_gap'[];
  requiredDependencyCount: number;
  responsibilityBoundary: {
    claimsAllowed: boolean;
    allowedOwnerKinds?: readonly PilotRoomResponsibilityOwnerKind[];
    allowedStatuses?: readonly PilotRoomResponsibilityStatus[];
    requiredUnassignedActivities?: readonly PilotRoomResponsibilityActivity[];
  };
}

const STOP_CONDITION_EMPTY_ASSERTION = /^(?:(?:现在|目前|眼下))?(?:停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍)?(?:是)?(?:空的|空着|空白)|维护(?:负责)?人(?:和|、)停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍)?(?:是)?(?:空的|空着|空白)|(?:没有维护(?:负责)?人|维护(?:负责)?人(?:没定|未定|没有定)|不仅维护(?:负责)?人(?:没定|未定|没有定)|无人维护)(?:且|而|而且|同时|以及)停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍)?(?:是)?(?:空的|空着|空白))$/u;

function stripDirectQuotes(text: string): string {
  return text.replace(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』|‘[^’]*’/gu, '');
}

function hasPositiveStopConditionEmptySignal(text: string): boolean {
  const units = text
    .split(/[。！；;\n]/u)
    .map((unit) => unit.trim())
    .filter(Boolean);
  const pairedTopics = /谁负责维护[^。！？!?\n；;]{0,32}?什么情况下必须(?:停止|停下来)/u;
  const pairedAssertion = /^[，,\s]*(?:(?:现在|目前|眼下)[，,\s]*)?(?:这两个|这两项|这两件事)(?:都)?(?:没定|未定|没有定|空着|是空的)/u;
  const contradiction = /(?:其实|实际|事实上)?[^。！？!?\n]{0,12}(?:两个|两项|两件事|它们)?(?:都|已经|早已)?(?:明确|定了|已定)|(?:判断|说法|结论)?[^。！？!?\n]{0,8}(?:不成立|并非事实|不是事实|是错的|错误)/u;
  for (const [index, unit] of units.entries()) {
    const topics = unit.match(pairedTopics);
    if (!topics || topics.index === undefined || /[？?"“”「」『』]/u.test(unit)) {
      continue;
    }
    const prefix = unit.slice(0, topics.index);
    const allowedPrefix = prefix.trim().length === 0
      || /(?:回答|明确|确定|解决)(?:这)?两个(?:问题|缺口)[：:]\s*$/u.test(prefix);
    if (!allowedPrefix) continue;
    const inlineCandidate = unit.slice(topics.index + topics[0].length);
    const nextCandidate = units[index + 1] ?? '';
    const candidate = [inlineCandidate, nextCandidate]
      .find((value) => (
        pairedAssertion.test(value)
        && !/[？?"“”「」『』]/u.test(value)
      ));
    if (candidate && !contradiction.test(candidate)) return true;
  }
  return text
    .split(/[。！；;\n]/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => Boolean(sentence) && !/[？?]/u.test(sentence))
    .some((sentence) => {
      if (STOP_CONDITION_EMPTY_ASSERTION.test(sentence)) return true;
      const clauses = sentence.split(/[，,]/u).map((clause) => clause.trim());
      if (
        clauses.length === 2
        && STOP_CONDITION_EMPTY_ASSERTION.test(clauses[0] ?? '')
        && /^这就是(?:个|一张)?空头支票$/u.test(clauses[1] ?? '')
      ) {
        return true;
      }
      const lastClause = clauses.at(-1) ?? '';
      const adversativeAssertion = lastClause.match(/^(?:但是|但|不过|可是|然而)(.+)$/u)?.[1] ?? '';
      return Boolean(
        adversativeAssertion
        && STOP_CONDITION_EMPTY_ASSERTION.test(adversativeAssertion),
      );
    });
}

function hasExplicitStopConditionGap(text: string): boolean {
  return (text.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? []).some((rawUnit) => {
    const unit = rawUnit.trim();
    if (!unit || /[？?]$/u.test(unit) || /[“”"「」『』]/u.test(unit)) return false;
    const assertions = unit
      .replace(/[。！!]$/u, '')
      .split(/[，,；;]|[—–-]{1,2}/u)
      .map((assertion) => assertion
        .trim()
        .replace(/^(?:但|但是|不过|可是|然而)[，,\s]*/u, ''))
      .filter(Boolean);
    return assertions.some((assertion) => (
      /^(?:(?:现在|目前|眼下)[，,\s]*)?(?:尚未|仍未|还未|还没)(?:确定|明确|写明|设定|定)停止条件$/u
        .test(assertion)
      || /^(?:(?:现在|目前|眼下)[，,\s]*)?停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍|又)?(?:还没|还没有|尚未|仍未|未)(?:确定|明确|写明|设定|定)$/u
        .test(assertion)
      || /^(?:(?:现在|目前|眼下)[，,\s]*)?停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍|又)?(?:不明确|没定|未定)$/u
        .test(assertion)
      || /^(?:(?:当前|现行|新|旧)版本(?:的)?)?(?:维护(?:负责)?人)(?:和|、)停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍)?(?:(?:还没|还没有|尚未|仍未|未)(?:确定|明确|写明|设定|定)|(?:没定|未定))$/u
        .test(assertion)
      || /^(?:(?:当前|现行|新|旧)版本(?:的)?)?维护(?:和|、)停止条件(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍)?(?:还|仍|尚)?(?:没人|无人)(?:明确)?(?:认领|负责|确定)$/u
        .test(assertion)
    ));
  });
}

function hasExplicitStopConditionGapFill(text: string): boolean {
  const withoutQuotes = stripDirectQuotes(text);
  return (withoutQuotes.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? []).some((rawUnit) => {
    const unit = rawUnit.trim();
    if (!unit || /[？?]$/u.test(unit)) return false;
    const assertion = unit.replace(/[。！!]$/u, '').trim();
    const fillStart = assertion.search(
      /(?:两个|两项|这些|以下)?缺口(?:现在|目前|眼下|还|都|仍|尚|现在都|目前都)?(?:就)?(?:得填|要填|待填|未填|没填|需要补|尚未补|还没补)[：:]/u,
    );
    if (fillStart < 0) return false;
    const fillAssertion = assertion.slice(fillStart);
    if (/^(?:不|并不|并非|不是|不能|没|没有|无需|不需要)/u.test(fillAssertion)
      || /(?:不需要|不用|不包括|不含|已明确|已经写清|这话是假的|判断不成立|并非如此)/u
        .test(fillAssertion)) {
      return false;
    }
    return /^(?:两个|两项|这些|以下)?缺口(?:现在|目前|眼下|还|都|仍|尚|现在都|目前都)?(?:就)?(?:得填|要填|待填|未填|没填|需要补|尚未补|还没补)[：:][^。！？!?\n]{0,80}(?:停止条件|什么情况下[^。！？!?\n]{0,8}停)[^。！？!?\n]*$/u
      .test(fillAssertion);
  });
}

function hasAffirmativeStopConditionResolution(text: string): boolean {
  const namesStopCondition = /(?:停止条件|停下来的条件|停止线|什么情况下(?:必须)?停)/u.test(text);
  if (!namesStopCondition) return false;
  if (/(?:停止条件|停下来的条件|停止线)(?:应当)?除外/u.test(text)) return true;

  const clauses = text
    .split(/[，,；;：:]/u)
    .map((clause) => clause
      .trim()
      .replace(/^(?:但|但是|不过|可是|然而|后来)[，,\s]*/u, ''))
    .filter(Boolean);
  return clauses.some((clause, index) => {
    const subject = '(?:(?:(?:当前|现行|新)版本(?:的)?)(?:停止条件|停下来的条件|停止线)?|停止条件|停下来的条件|停止线|什么情况下(?:必须)?停|条件)';
    const positivePredicate = '(?:(?:其实|明明|后来)?(?:已经|早已|早就|都已|现已)?(?:明确(?:了|的)?|写清(?:楚)?了|确定(?:了)?|定了|定好(?:了)?|划好(?:了)?|没问题)|(?:其实)?是(?:明确|确定)的)';
    const completePositiveAssertion = new RegExp(
      `^${subject}${positivePredicate}$`,
      'u',
    );
    const completePositiveAnaphor = index > 0 && new RegExp(
      `^(?:(?:但|但是|不过|可是|然而|而且|可)?(?:其实|明明)?)(?:已经|早已|早就|都已|现已)(?:明确(?:了)?|写清(?:楚)?了|确定(?:了)?|定了|定好(?:了)?|划好(?:了)?|没问题)$`,
      'u',
    ).test(clause);
    return completePositiveAssertion.test(clause) || completePositiveAnaphor;
  });
}

function hasCurrentExplicitStopConditionGap(text: string): boolean {
  const withoutQuotes = stripDirectQuotes(text);
  const units = withoutQuotes.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [];
  let gapIsCurrent = false;
  for (const [index, rawUnit] of units.entries()) {
    if (/[？?]$/u.test(rawUnit.trim())) continue;
    const unit = rawUnit.replace(/[。！!]$/u, '').trim();
    const clauses = unit.split(/[，,；;]|[—–-]{1,2}/u).map((clause) => clause.trim()).filter(Boolean);
    let unitSawGap = false;
    let suppressNextGap = false;
    for (const clause of clauses) {
      const gapNegatedByPriorClause = suppressNextGap;
      suppressNextGap = /^(?:不能(?:再)?说|不可说|别(?:再)?说|不要说|我不认为|这不代表|没有证据说明|不能断言|不能认为|(?:我)?(?:并)?不是说|(?:我)?并非说|不是|并非|并不是)$/u
        .test(clause);
      const oldVersionOnly = /旧版本/u.test(clause)
        && !/(?:当前|现行|新版本)/u.test(clause);
      const statesGap = hasExplicitStopConditionGap(clause)
        || hasPositiveStopConditionEmptySignal(clause)
        || hasExplicitStopConditionGapFill(clause);
      if (statesGap && !oldVersionOnly && !gapNegatedByPriorClause) {
        gapIsCurrent = true;
        unitSawGap = true;
      }
      const explicitStopResolution = hasAffirmativeStopConditionResolution(clause);
      const anaphoricResolution = gapIsCurrent
        && /^(?:(?:但|但是|不过|可是|然而|而且|可|后来)[，,\s]*)?(?:(?:其实|实际(?:上)?|事实上)?(?:已经|早已|早就|都已|现已)(?:明确(?:了)?|写清(?:楚)?(?:了)?|确定(?:了)?|定好(?:了)?)|(?:(?:(?:这个|该)(?:判断|说法|结论|情况)|这(?:句)?话)(?:并)?|并)?(?:不成立|不属实|不是事实|不是这样)|(?:后来)?证明(?:(?:这个|该)(?:判断|说法|结论)(?:是)?(?:错的|说错了|判断错了)|(?:他|她|对方)?(?:是)?(?:说错了|判断错了))|前面(?:关于停止条件)?说的不算)$/u
          .test(clause);
      const sameClauseRetraction = statesGap
        && /(?:后来)?证明[^。！？!?\n]{0,16}(?:说错了?|判断错了?)/u.test(clause);
      if (!oldVersionOnly
        && (explicitStopResolution || anaphoricResolution || sameClauseRetraction)) {
        gapIsCurrent = false;
      }
    }
    if (!unitSawGap
      && !hasAffirmativeStopConditionResolution(unit)
      && (
      hasExplicitStopConditionGapFill(unit)
      || hasPositiveStopConditionEmptySignal(
        [rawUnit, units[index + 1] ?? ''].filter(Boolean).join(''),
      )
      )) {
      gapIsCurrent = true;
    }
  }
  return gapIsCurrent;
}

export function validatePilotRoomCaseExpectations(
  expectation: PilotRoomCaseExpectation,
  participation: PilotRoomParticipationResult,
): string[] {
  const errors: string[] = [];
  const speakers = participation.transcript.map(({ agent }) => agent);
  if (!expectation.expectedStopReasons.includes(participation.stopReason)) {
    errors.push(`unexpected_stop_reason:${participation.stopReason}`);
  }
  if (speakers.length < expectation.minSpeakers || speakers.length > expectation.maxSpeakers) {
    errors.push(`unexpected_speaking_count:${speakers.length}`);
  }
  if (expectation.firstSpeaker && speakers[0] !== expectation.firstSpeaker) {
    errors.push(`unexpected_first_speaker:${speakers[0] ?? 'none'}`);
  }
  if (speakers[0] && expectation.forbiddenFirstAgents?.includes(speakers[0])) {
    errors.push(`forbidden_first_speaker:${speakers[0]}`);
  }
  for (const required of expectation.requiredAgents ?? []) {
    if (!speakers.includes(required)) errors.push(`missing_required_agent:${required}`);
  }
  if (expectation.requiresSingleQuestion) {
    const [message] = participation.transcript;
    const questionCount = message?.text.match(/[？?]/gu)?.length ?? 0;
    if (participation.transcript.length !== 1
      || questionCount !== 1
      || !/[？?]\s*$/u.test(message?.text ?? '')) {
      errors.push('single_question_required');
    }
  }
  for (const signal of expectation.requiredContentSignals ?? []) {
    const transcriptText = participation.transcript.map(({ text }) => text).join('\n');
    if (signal === 'stop_condition_gap'
      && !hasCurrentExplicitStopConditionGap(transcriptText)) {
      errors.push('missing_required_content:stop_condition_gap');
    }
  }
  const dependencyCount = participation.transcript.filter(({ respondsToMessageId }) => (
    respondsToMessageId !== null
  )).length;
  if (dependencyCount < expectation.requiredDependencyCount) {
    errors.push(`missing_required_dependencies:${dependencyCount}/${expectation.requiredDependencyCount}`);
  }
  const claims = participation.transcript.flatMap(({ responsibilityClaims }) => responsibilityClaims);
  if (!expectation.responsibilityBoundary.claimsAllowed && claims.length > 0) {
    errors.push('responsibility_claims_not_allowed');
  }
  for (const claim of claims) {
    const allowedOwnerKinds = expectation.responsibilityBoundary.allowedOwnerKinds;
    if (allowedOwnerKinds && !allowedOwnerKinds.includes(claim.ownerKind)) {
      errors.push(`responsibility_owner_kind_not_allowed:${claim.ownerKind}`);
    }
    const allowedStatuses = expectation.responsibilityBoundary.allowedStatuses;
    if (allowedStatuses && !allowedStatuses.includes(claim.status)) {
      errors.push(`responsibility_status_not_allowed:${claim.status}`);
    }
  }
  for (const activity of expectation.responsibilityBoundary.requiredUnassignedActivities ?? []) {
    if (!claims.some((claim) => (
      claim.activity === activity
      && claim.ownerKind === 'unassigned'
      && claim.status === 'observed'
      && isPureUnassignedOwnerStatement(claim.statementQuote, claim.activity)
    ))) {
      errors.push(`missing_unassigned_responsibility:${activity}`);
    }
  }
  return errors;
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
  options: {
    naturalStopReasons?: readonly PilotRoomStopReason[];
    requireSharedCanon?: boolean;
  } = {},
): boolean {
  const naturalStopReasons = options.naturalStopReasons
    ?? ['no_eligible_intent', 'all_agents_spoke'];
  const naturalStop = naturalStopReasons.includes(participation.stopReason);
  const firstSpeakerGatePassed = participation.transcript.length === 0
    ? verdict.firstSpeakerUseful === null
    : verdict.firstSpeakerUseful === true;
  const sharedCanonGatePassed = options.requireSharedCanon === false
    || participation.transcript.length === 0
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
    pattern: /(?:(?:谁|没人|无人|有人|负责人|责任人)[^。！？；，,、\n]{0,10}(?:(?:负责|认领|接手)[^。！？；，,、\n]{0,6}(?:维护|值班|故障响应|报警|故障)|(?:维护(?!者)|值班|故障响应|报警|故障))|(?:指定|安排|确认)[^。！？；，,、\n]{0,8}(?:维护负责人|值班负责人|故障响应人|报警响应人)|(?:指定|安排|确认|让|由|交给|默认)[^。！？；，,、\n]{0,8}(?:人|成员|负责人|责任人|你|你们)[^。！？；，,、\n]{0,6}(?:负责)?(?:维护|值班|故障响应|报警|故障)|(?:维护|值班|故障响应|报警|故障)[^。！？；，,、\n]{0,10}(?:谁|没人|无人|有人|负责人|责任人|空着|未分配|没定|没有定|交给|由|让|安排给)|(?:维护|值班|故障响应|报警|故障)(?:事项|责任)?[、，,][^。！？；，,、\n]{0,10}(?:没人|无人)(?:(?:负责|认领|接手)(?!\s*(?:来|去)?\s*(?:叫停|停止决策|回滚|撤回上线|恢复旧版本|交接|移交))|(?:维护|值班|故障响应|报警|故障)))/,
  },
  {
    activity: 'rollback',
    pattern: /(?:(?:谁|没人|无人|指定|默认|负责人|有权|有权限)[^。！？；，,、\n]{0,12}(?:回滚|撤回上线|恢复旧版本)|(?:回滚|撤回上线|恢复旧版本)[^。！？；，,、\n]{0,12}(?:谁|没人|无人|指定|默认|负责人|有权|有权限))/,
  },
  {
    activity: 'stop_decision',
    pattern: /(?:(?:谁|没人|无人|指定|默认|负责人|决策人|有权|有权限)[^。！？；，,、\n]{0,12}(?:停止决策|叫停|必须停|自动下线)|(?:停止决策|叫停|必须停|自动下线)[^。！？；，,、\n]{0,12}(?:谁|没人|无人|指定|默认|负责人|决策人|有权|有权限)|(?:停止阈值|停止条件)[^。！？；，,、\n]{0,8}(?:(?:决策权|权限)[^。！？；，,、\n]{0,8}(?:归|属于|由|交给|是|为|谁|没人|无人|未定|没定)|(?:由谁拍板|谁来决定|谁说了算))|谁有[^。！？；，,、\n]{0,6}(?:最终)?(?:停止权|叫停权))/,
  },
  {
    activity: 'handover',
    pattern: /(?:(?:谁|没人|无人|指定|默认|负责人|负责)[^。！？；，,、\n]{0,12}(?:交接|移交|接手)|(?:交接|移交|接手)[^。！？；，,、\n]{0,12}(?:谁|没人|无人|指定|默认|负责人|负责))/,
  },
];

const USER_OWNERSHIP_ACTIVITY_PATTERNS: Readonly<Record<
  Exclude<PilotRoomResponsibilityActivity, 'other'>,
  RegExp
>> = {
  maintenance: /(?:(?:由|归|交给)?你(?:本人|自己|们)?(?:来|去|直接)?(?:负责|承担|认领|接手|维护|值班|扛|管|接).{0,12}(?:维护|值班|故障响应|报警|故障)|(?:维护|值班|故障响应|报警|故障).{0,12}(?:(?:由|归|交给)你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|扛|管|接|盯)?|你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|扛|管|接|盯))|你(?:本人|自己|们)?(?:是|当|作为).{0,12}(?:维护|值班|故障响应|报警).{0,4}(?:负责人|责任人|响应人))/u,
  rollback: /(?:(?:由|归|交给)?你(?:本人|自己|们)?(?:来|去|直接)?(?:负责|承担|认领|接手|执行|决定|拍板|做).{0,12}(?:回滚|撤回上线|恢复旧版本)|(?:回滚|撤回上线|恢复旧版本).{0,12}(?:(?:由|归|交给)你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|执行|决定|拍板|做)?|你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|执行|决定|拍板|做))|你(?:本人|自己|们)?有权.{0,12}(?:回滚|撤回上线|恢复旧版本))/u,
  stop_decision: /(?:(?:由|归|交给)?你(?:本人|自己|们)?(?:来|去|直接)?(?:负责|承担|认领|接手|执行|决定|拍板).{0,12}(?:停止决策|叫停|停下|停止|下线)|(?:停止决策|叫停|停下|停止|下线).{0,12}(?:(?:由|归|交给)你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|执行|决定|拍板)?|你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|执行|决定|拍板|说了算))|你(?:本人|自己|们)?有权.{0,12}(?:停止决策|叫停|停下|停止|下线))/u,
  handover: /(?:(?:由|归|交给)?你(?:本人|自己|们)?(?:来|去|直接)?(?:负责|承担|认领|接手|执行|做|接).{0,12}(?:交接|移交)|(?:交接|移交).{0,12}(?:(?:由|归|交给)你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|执行|做|接)?|你(?:本人|自己|们)?(?:来)?(?:负责|承担|认领|接手|执行|做|接)))/u,
};
const USER_OWNER_META_TASK = /你(?:本人|自己|们)?.{0,8}(?:(?:负责|承担).{0,6})?(?:找|寻找|确认|指定|挑选|选出|安排|物色|写下).{0,12}(?:负责人|责任人|决策人|人选|谁)/u;
const UNASSIGNED_OWNER_SIGNAL = /(?:(?:谁|哪(?:个|位|一方)).{0,24}(?:负责|认领|接手|承担|维护|值班|收尾|回滚|叫停|停止决策|交接|移交|接(?:报警|故障|凌晨))|(?:没人|无人|尚未|还没|没有|未).{0,24}(?:负责|认领|接手|承担|维护|值班|收尾|回滚|叫停|停止决策|交接|移交)|(?:维护|值班|故障响应|报警).{0,10}谁(?:来)?(?:做|负责|接手|认领|承担)|(?:维护|值班|故障响应|报警|回滚|叫停|停止决策|交接|移交).{0,10}(?:没人|无人)(?:负责|认领|接手|承担)?|(?:维护(?:负责)?人|维护责任|值班人|收尾人|回滚负责人|叫停人|停止决策人|交接人).{0,10}(?:还是)?(?:空着|空的|未定|没定|没有定|尚未确定|还没确定|还没有确定|没有确定))/u;
const RESPONSIBILITY_ACTIVITY_SPECS: Readonly<Record<
  PilotRoomResponsibilityActivity,
  {
    term: string;
    ownerTitle: string;
    directPredicate: string;
  }
>> = {
  maintenance: {
    term: '(?:维护|值班|故障响应|报警|故障)',
    ownerTitle: '(?:维护负责人|维护责任人|值班负责人|值班责任人|故障响应人|报警响应人)',
    directPredicate: '(?:值班|当班|轮值|接报警|接故障|做维护|盯(?:着)?)',
  },
  rollback: {
    term: '(?:回滚|撤回上线|恢复旧版本)',
    ownerTitle: '(?:回滚负责人|回滚责任人)',
    directPredicate: '(?:回滚|做回滚|执行回滚)',
  },
  stop_decision: {
    term: '(?:停止决策|叫停|停止|下线)',
    ownerTitle: '(?:停止决策人|停止负责人|叫停负责人|叫停决策人|下线决策人)',
    directPredicate: '(?:叫停|决定停止|执行下线)',
  },
  handover: {
    term: '(?:交接|移交)',
    ownerTitle: '(?:交接负责人|交接责任人|移交负责人|移交责任人)',
    directPredicate: '(?:交接|做交接|执行移交)',
  },
  other: {
    term: '(?:责任|负责人)',
    ownerTitle: '(?:负责人|责任人)',
    directPredicate: '(?:负责)',
  },
};

function unquotedResponsibilityClauses(
  text: string,
  includeQuestions = false,
  splitColon = false,
): string[] {
  const withoutQuotes = stripDirectQuotes(text);
  const clauseDelimiter = splitColon ? /[，,；;：:]/u : /[，,；;]/u;
  return (withoutQuotes.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [])
    .filter((unit) => includeQuestions || !/[？?]\s*$/u.test(unit))
    .flatMap((unit) => unit.replace(/[。！!]\s*$/u, '').split(clauseDelimiter))
    .map((clause) => clause.trim().replace(/[？?]$/u, ''))
    .filter(Boolean);
}

function hasPositiveOwnerAssignment(
  text: string,
  activity: PilotRoomResponsibilityActivity,
): boolean {
  const {
    term: activityTerm,
    ownerTitle: ownerTitleTerm,
    directPredicate: directPredicateTerm,
  } = RESPONSIBILITY_ACTIVITY_SPECS[activity];
  const assignment = new RegExp(
    `(?:(?:交给|让|安排(?:给)?|指定(?:给)?|由)[^。！？!?，,；;\\n]{1,28}(?:(?:负责|承担|认领|接手|顶|维护|值班|管|扛|接|来做)[^。！？!?，,；;\\n]{0,10}${activityTerm}|${activityTerm})|${activityTerm}[^。！？!?，,；;\\n]{0,12}(?:交给|让|安排(?:给)?|指定(?:给)?|由)[^。！？!?，,；;\\n]{1,28}(?:负责|承担|认领|接手|顶|管|扛|接|来做)?|${ownerTitleTerm}(?:现在|目前)?(?:已经)?(?:是|为|：|:)[^。！？!?，,；;\\n]{1,20}|[^。！？!?，,；;\\n]{1,16}(?:已经|后来|现在|其实)(?:负责|承担|认领|接手|顶|维护|值班|管|扛|接|来做)[^。！？!?，,；;\\n]{0,10}${activityTerm}?)`,
    'u',
  );
  const isObjectiveStopMechanism = (clause: string): boolean => {
    if (activity !== 'stop_decision') return false;
    const mechanism = clause.match(
      /^(?:这个|该)?(?:停止阈值|停止条件)由([^。！？!?，,；;\n]{1,28})(?:决定|触发)$/u,
    );
    if (!mechanism) return false;
    const decidingSubject = (mechanism[1] ?? '').trim();
    const explicitActor = /^(?:我|我们|你|你们|他|她|他们|她们|用户|客户|产品|项目组|林衡|夏栩|周禾|许野|小[\p{sc=Han}])$/u
      .test(decidingSubject)
      || /^(?:[\p{sc=Han}A-Za-z0-9·]{0,12})?(?:负责人|责任人|决策人|经理|主管|老板|领导|代表|团队|小组|部门|组织|公司|委员会|管理层|项目方|甲方|乙方|运营|运维|研发|法务|财务)$/u
        .test(decidingSubject);
    return !explicitActor;
  };
  return unquotedResponsibilityClauses(text)
    .some((clause) => (
      !/^(?:不|并不|并非|不是|不能|没|没有|无人|没人|未|尚未|还没|谁|哪)/u.test(clause)
      && !/(?:(?:并非|不是|不能|不可|不该|不应|没有|没).{0,10}(?:由|交给|让|安排|指定|负责|接手|认领|承担))/u
        .test(clause)
      && !/(?:(?:由|交给|让|安排|指定).{0,16}(?:不可能|拒绝|不同意)|(?:拒绝|不同意).{0,8}(?:负责|承担|接手|认领)|(?:不可能|不成立)\s*$)/u
        .test(clause)
      && !/(?:交给|让|安排(?:给)?|指定(?:给)?|由)谁/u.test(clause)
      && !/(?:指定|安排|明确|设定)(?:一个|这条|该)?停止条件/u.test(clause)
      && !/^(?:(?:以及|并且|还有|和|同时)[，,\s]*)?(?:什么|何种|哪种)情况下(?:(?:就|才|会|要|应|应该|应当|必须|需要|可以|自动|立即|直接|触发|执行)\s*){0,3}(?:回滚|撤回上线|恢复旧版本|叫停|停止|下线)$/u
        .test(clause)
      && !isObjectiveStopMechanism(clause)
      && (
        assignment.test(clause)
        || new RegExp(
          `(?:^[^。！？!?，,；;\\n谁哪不没无未]{1,16}(?:负责|承担|认领|接手|维护|值班|管|扛|接|来做)[^。！？!?，,；;\\n]{0,10}${activityTerm}$|^[^。！？!?，,；;\\n谁哪不没无未]{1,16}(?:来|去)?${directPredicateTerm}$|^${activityTerm}(?:由)?[^。！？!?，,；;\\n谁哪不没无未]{1,12}(?:来|去)?(?:做|接|负责|承担|盯(?:着)?)$|^${activityTerm}(?:责任)?(?:归|属于)[^。！？!?，,；;\\n]{1,16}$)`,
          'u',
        ).test(clause)
      )
    ));
}

function isPureUnassignedOwnerStatement(
  statementQuote: string,
  activity: PilotRoomResponsibilityActivity,
): boolean {
  const quote = statementQuote.trim().replace(/[。！？!?]$/u, '');
  if (!quote
    || /[，,；;\n。！？!?]|[“”"「」『』]/u.test(quote)
    || !UNASSIGNED_OWNER_SIGNAL.test(quote)
    || !new RegExp(RESPONSIBILITY_ACTIVITY_SPECS[activity].term, 'u').test(quote)
    || /(?:(?:已经|早已|早就|后来|其实).{0,20}(?:明确|确定|定了|接手|负责|认领|承担)|(?:负责人|责任人)(?:现在|目前)?(?:已经)?(?:是|为|：|:))/u
      .test(quote)) {
    return false;
  }
  const activityGap: Record<PilotRoomResponsibilityActivity, RegExp> = {
    maintenance: /^(?:(?:新版本)?(?:现在|目前|眼下)?(?:还|仍|尚)?(?:没人|无人)(?:明确)?(?:负责|认领|接手|承担)?(?:上线后的)?(?:维护|值班|故障响应|报警)|(?:新版本)?(?:现在|目前|眼下)?(?:维护(?:负责)?人|维护责任|值班人|故障响应人)(?:现在|目前|眼下)?(?:也|都|还是|仍然|仍)?(?:是)?(?:空着的?|空的|未定|没定|没有定|尚未确定|还没确定|还没有确定|没有确定)|(?:新版本)?(?:现在|目前|眼下)?谁.{0,20}(?:负责|维护|值班|接.{0,16}(?:报警|故障|凌晨))|(?:新版本)?(?:维护|值班|故障响应|报警).{0,16}(?:谁(?:来)?(?:做|负责|接手|认领|承担)|没人负责|无人负责|没人认领|无人认领|未分配|空着|没定))$/u,
    rollback: /^(?:(?:现在|目前|眼下)?(?:还|仍|尚)?(?:没人|无人)(?:负责|认领|接手|承担)?(?:回滚|撤回上线|恢复旧版本)|(?:回滚|撤回上线|恢复旧版本).{0,16}(?:谁负责|没人负责|无人负责|未分配|空着|没定))$/u,
    stop_decision: /^(?:(?:现在|目前|眼下)?(?:还|仍|尚)?(?:没人|无人)(?:负责|认领|接手|承担)?(?:停止决策|叫停|停止|下线)|(?:现在|目前|眼下)?谁.{0,20}(?:有权)?(?:叫停|决定停止|执行下线)|(?:停止决策|叫停|停止|下线).{0,16}(?:谁负责|没人负责|无人负责|未分配|空着|没定))$/u,
    handover: /^(?:(?:现在|目前|眼下)?(?:还|仍|尚)?(?:没人|无人)(?:负责|认领|接手|承担)?(?:交接|移交)|(?:交接|移交).{0,16}(?:谁负责|没人负责|无人负责|未分配|空着|没定))$/u,
    other: /^(?:(?:现在|目前|眼下)?(?:还|仍|尚)?(?:没人|无人)(?:负责|认领|接手|承担)?责任|责任.{0,16}(?:没人负责|无人负责|未分配|空着|没定))$/u,
  };
  return activityGap[activity].test(quote);
}

function ownerQuestionIsOnlyHistorical(prefix: string): boolean {
  if (/(?:现在|目前|眼下|当前|这次|今天)[^。！？!?\n]{0,16}(?:继续|仍要|还要|再|又)?(?:问|确认)|(?:继续|仍要|还要|再|又)(?:问|确认)/u
    .test(prefix)) {
    return false;
  }
  return /(?:上周|之前|当时|会上|会议上|旧问题|旧提问|原话|引用|转述)[^。！？!?\n]{0,20}(?:问的是|问题是|提的是|说的是|引用(?:一下)?(?:旧问题)?|转述(?:一下)?)?$/u
    .test(prefix);
}

const COMMON_CHINESE_SURNAME = '赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏窦章云苏潘葛范彭鲁韦马苗方俞任袁柳史唐费薛雷贺倪汤滕殷罗毕郝安常于傅齐康伍余顾孟黄穆萧尹姚邵汪毛米贝戴谈宋庞熊纪舒屈项祝董梁杜阮蓝席季贾路江童颜郭梅盛林钟徐邱高夏蔡田樊胡霍虞万柯卢莫解宗丁邓洪包左石崔吉龚程邢裴陆荣翁惠甄曲封储靳段富焦巴侯全秋仲伊宫宁仇甘厉祖武符刘景詹龙叶幸黎白蒲鄂赖卓蔺屠蒙池乔谭申冉雍桑桂牛边尚温庄晏柴瞿阎慕连艾向古易戈廖耿弘国文寇广东欧利蔚越师聂辛饶曾沙关查后游权';
const STANDALONE_CHINESE_OWNER = new RegExp(
  `^(?:小|老)[${COMMON_CHINESE_SURNAME}]$`,
  'u',
);

function looksLikeStandaloneOwnerIdentity(answer: string): boolean {
  return STANDALONE_CHINESE_OWNER.test(answer)
    || /^(?:@[A-Za-z][A-Za-z0-9_-]{1,15}|[A-Z][A-Za-z0-9_-]{1,15}|[\p{sc=Han}A-Za-z0-9_-]{1,12}(?:组|团队|部门|小组))$/u
      .test(answer);
}

function immediateAnswerResolvesOwner(answer: string): boolean {
  const normalized = answer.trim().replace(/[。！？!?]+$/u, '');
  const directAnswer = normalized.replace(/^(?:其实|后来|现在|目前)[，,\s]*/u, '');
  if (!directAnswer) return false;
  if (/(?:(?:不|并不|不会|不愿意?|不想|没(?:有)?|尚未|还没|拒绝)(?:来|去)?(?:负责|接手|认领|承担|来做|做|接)|(?:负责|接手|认领|承担|来做)(?:不了|不成))/u
    .test(directAnswer)) {
    return false;
  }
  return /^(?!你(?:要|来|去|负责找))[^。！？!?，,；;\n谁哪不没无未]{1,16}(?:(?:来|会|将|已经)?(?:负责|接手|认领|承担|来做)|来管|管|值班|维护|盯(?:着)?)(?:这块|这件事|维护|值班|故障响应)?$/u
    .test(directAnswer)
    || /^(?:这块|这件事|维护|值班|故障响应)(?:已经)?(?:归|归属|交给|由)[^。！？!?，,；;\n谁哪不没无未]{1,16}(?:负责)?$/u
      .test(directAnswer)
    || /^(?:这块|这件事|维护|值班|故障响应)?(?:已经)?定下来了[，,][^。！？!?，,；;\n谁哪不没无未]{1,16}$/u
      .test(directAnswer)
    || /^(?:(?:维护|值班|故障响应)?(?:负责人|责任人|答案)(?:是|为|：:)|(?:已经)?确定(?:是|为))(?!(?:谁|没人|无人|没有|还没|未定|不清楚|不知道))[\p{L}\p{N}_·]{1,16}$/u
      .test(directAnswer)
    || /^是(?!谁|没人|无人|没有|还没|未定|不清楚|不知道|暂时没有)[\p{L}\p{N}_·]{1,16}$/u
      .test(directAnswer)
    || looksLikeStandaloneOwnerIdentity(directAnswer);
}

function hasSupportedUnassignedOwnerStatement(
  text: string,
  statementQuote: string,
  activity: PilotRoomResponsibilityActivity,
): boolean {
  if (!isPureUnassignedOwnerStatement(statementQuote, activity)) return false;
  const withoutQuotes = stripDirectQuotes(text);
  const rawQuote = statementQuote.trim();
  const quoteWithoutTerminal = rawQuote.replace(/[。！？!?]+$/u, '');
  const needles = rawQuote === quoteWithoutTerminal
    ? [rawQuote]
    : [rawQuote, quoteWithoutTerminal];
  const occurrences = new Map<number, number>();
  for (const needle of needles) {
    if (!needle) continue;
    let searchFrom = 0;
    while (searchFrom < withoutQuotes.length) {
      const index = withoutQuotes.indexOf(needle, searchFrom);
      if (index < 0) break;
      occurrences.set(index, Math.max(occurrences.get(index) ?? 0, needle.length));
      searchFrom = index + Math.max(needle.length, 1);
    }
  }
  if (occurrences.size === 0) return false;

  return [...occurrences.entries()].some(([quoteIndex, matchedLength]) => {
    const prefix = withoutQuotes.slice(0, quoteIndex);
    const localPrefix = prefix
      .slice(Math.max(
        prefix.lastIndexOf('。'),
        prefix.lastIndexOf('！'),
        prefix.lastIndexOf('!'),
        prefix.lastIndexOf('？'),
        prefix.lastIndexOf('?'),
        prefix.lastIndexOf('\n'),
      ) + 1)
      .replace(/[，,：:；;\s]+$/u, '');
    if (/(?:不能(?:再)?说|不可说|别(?:再)?说|不是|并非|并不是|不能认为|不能说明)\s*$/u
      .test(localPrefix)
      || ownerQuestionIsOnlyHistorical(localPrefix)) {
      return false;
    }

    const suffix = withoutQuotes.slice(quoteIndex + matchedLength);
    const immediateAnswer = suffix
      .replace(/^[。！？!?，,；;：:\s]+/u, '')
      .match(/^[^。！？!?\n]+/u)?.[0]
      ?.trim();
    if (immediateAnswer && immediateAnswerResolvesOwner(immediateAnswer)) {
      return false;
    }
    if (/(?:事实|判断|说法|情况)(?:并)?(?:不是这样|不成立|不属实)|并非如此|已经有人(?:负责|接手|认领)|(?:负责人|责任人)已经(?:明确|确定)/u
      .test(suffix)) {
      return false;
    }

    const claimScope = quoteWithoutTerminal.match(/(?:新版本|旧版本)/u)?.[0];
    const activityTerm = RESPONSIBILITY_ACTIVITY_SPECS[activity].term;
    const contradictoryAssignment = unquotedResponsibilityClauses(suffix).some((clause) => {
      const assignmentClause = clause.replace(
        /^(?:但|但是|不过|可是|其实)[，,\s]*/u,
        '',
      );
      const explicitOwnerResolution = new RegExp(
        `(?:${activityTerm})(?:权|责任)?(?:现在|目前|已经|现已)?(?:归|归属|交给|由|是|为)[^。！？!?，,；;\\n]{1,20}`,
        'u',
      ).test(assignmentClause);
      if (!explicitOwnerResolution
        && !hasPositiveOwnerAssignment(assignmentClause, activity)) return false;
      if (explicitUserOwnershipClauses(assignmentClause, activity).length > 0) return false;
      if (!claimScope) return true;
      const clauseScopes = [...assignmentClause.matchAll(/(?:新版本|旧版本)/gu)]
        .map(([scope]) => scope);
      return clauseScopes.length === 0 || clauseScopes.includes(claimScope);
    });
    return !contradictoryAssignment;
  });
}

export function inferUnassignedResponsibilityClaims(
  text: string,
  sourceMessageId: string,
  existingClaims: readonly PilotRoomResponsibilityClaim[] = [],
): {
  claims: PilotRoomResponsibilityClaim[];
  addedClaimCount: number;
} {
  const claims = [...existingClaims];
  let addedClaimCount = 0;
  const clauses = unquotedResponsibilityClauses(text, true, true);
  for (const activity of [
    'maintenance',
    'rollback',
    'stop_decision',
    'handover',
  ] as const) {
    const statementQuote = clauses.find((clause) => (
      hasSupportedUnassignedOwnerStatement(text, clause, activity)
    ));
    if (!statementQuote || claims.some((claim) => (
      claim.activity === activity
      && claim.statementQuote.trim() === statementQuote
    ))) {
      continue;
    }
    claims.push({
      activity,
      ownerKind: 'unassigned',
      ownerSubjectId: null,
      status: 'observed',
      statementQuote,
      evidenceQuote: statementQuote,
      sourceMessageId,
    });
    addedClaimCount += 1;
  }
  return { claims, addedClaimCount };
}

function explicitUserOwnershipClauses(
  text: string,
  activity: PilotRoomResponsibilityActivity,
): string[] {
  if (activity === 'other') return [];
  return text
    .split(/[。！？；;\n]/u)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .filter((clause) => (
      !USER_OWNER_META_TASK.test(clause)
      && USER_OWNERSHIP_ACTIVITY_PATTERNS[activity].test(clause)
    ));
}

function hasExplicitUserOwnership(
  text: string,
  activity: PilotRoomResponsibilityActivity,
): boolean {
  return explicitUserOwnershipClauses(text, activity).length > 0;
}

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
  const unquotedText = stripDirectQuotes(text);
  const activities = [...new Set([
    ...RESPONSIBILITY_ASSERTION_PATTERNS
    .filter(({ pattern }) => pattern.test(unquotedText))
      .map(({ activity }) => activity),
    ...Object.keys(USER_OWNERSHIP_ACTIVITY_PATTERNS)
      .filter((activity) => hasExplicitUserOwnership(
        unquotedText,
        activity as Exclude<PilotRoomResponsibilityActivity, 'other'>,
      )) as PilotRoomResponsibilityActivity[],
  ])];
  for (const activity of activities) {
    const covered = claims.some((claim) => (
      claim.activity === activity
      && claim.statementQuote.trim().length > 0
      && text.includes(claim.statementQuote)
    ));
    if (!covered) missing.push(`unstructured_responsibility_activity:${activity}`);
  }
  if (findPilotRoomResponsibilityTextViolations(text).length === 0) {
    for (const activity of ['maintenance', 'rollback', 'stop_decision', 'handover'] as const) {
      if (!hasPositiveOwnerAssignment(unquotedText, activity)) continue;
      const assignmentCovered = claims.some((claim) => (
        claim.activity === activity
        && claim.ownerKind !== 'unassigned'
        && claim.statementQuote.trim().length > 0
        && text.includes(claim.statementQuote)
      ));
      if (!assignmentCovered) missing.push(`unstructured_responsibility_activity:${activity}`);
    }
  }
  for (const [claimIndex, claim] of claims.entries()) {
    if (claim.statementQuote.trim() && !text.includes(claim.statementQuote)) {
      missing.push(`responsibility_statement_quote_not_found:${claimIndex}`);
    }
  }
  return [...new Set(missing)];
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

export function filterUnsupportedProposedUserClaims(
  claims: readonly PilotRoomResponsibilityClaim[],
  text: string,
): {
  claims: PilotRoomResponsibilityClaim[];
  droppedClaimCount: number;
} {
  const userClaimFiltered = claims.filter((claim) => {
    if (claim.status !== 'proposed'
      || claim.ownerKind !== 'user'
      || claim.ownerSubjectId !== 'user') return true;
    const quote = claim.statementQuote.trim().replace(/[。！？；;]+$/u, '');
    return Boolean(quote) && explicitUserOwnershipClauses(text, claim.activity)
      .some((clause) => clause.includes(quote) || quote.includes(clause));
  });
  const filtered = userClaimFiltered.filter((claim) => {
    if (claim.ownerKind === 'unassigned'
      && claim.status === 'observed'
      && !hasSupportedUnassignedOwnerStatement(text, claim.statementQuote, claim.activity)) {
      return false;
    }
    return true;
  });
  return {
    claims: filtered,
    droppedClaimCount: claims.length - filtered.length,
  };
}

export async function runPilotRoomParticipation(input: {
  agents: readonly AgentType[];
  budget?: Partial<PilotRoomParticipationBudget>;
  suppressRejectedOptionalMessages?: boolean;
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
  const suppressedGenerationErrors: NonNullable<
    PilotRoomParticipationResult['suppressedGenerationErrors']
  > = [];
  const remainingAgents = [...input.agents];
  let generatedCharacters = 0;
  const finish = (stopReason: PilotRoomStopReason): PilotRoomParticipationResult => ({
    transcript,
    rounds,
    stopReason,
    validationErrors,
    ...(suppressedGenerationErrors.length > 0
      ? { suppressedGenerationErrors }
      : {}),
  });

  while (remainingAgents.length > 0) {
    if (transcript.length >= budget.maxVisibleActs
      || rounds.length >= budget.maxAssessmentRounds
      || now() - startedAt >= budget.maxDurationMs
      || generatedCharacters >= budget.maxGeneratedCharacters) {
      return finish('budget_exhausted');
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
      return finish('no_eligible_intent');
    }

    const arbitration = await input.arbitrate({ ...context, eligibleIntents });
    const selectedIntent = eligibleIntents.find(({ agent }) => agent === arbitration.selectedAgent);
    round.selectedAgent = arbitration.selectedAgent;
    round.arbitrationReason = arbitration.reason;
    if (!selectedIntent) {
      validationErrors.push('selected_agent_not_eligible');
      return finish('invalid_arbitration');
    }

    if (now() - startedAt >= budget.maxDurationMs) {
      return finish('budget_exhausted');
    }

    const generated = await input.generate(arbitration.selectedAgent, selectedIntent, context);
    if (now() - startedAt >= budget.maxDurationMs
      || generatedCharacters + generated.text.length > budget.maxGeneratedCharacters) {
      return finish('budget_exhausted');
    }
    if (generated.validationErrors?.length) {
      if (input.suppressRejectedOptionalMessages
        && transcript.length > 0
        && selectedIntent.decision !== 'ask_user') {
        suppressedGenerationErrors.push({
          agent: arbitration.selectedAgent,
          errors: [...generated.validationErrors],
        });
        remainingAgents.splice(
          remainingAgents.indexOf(arbitration.selectedAgent),
          1,
        );
        if (remainingAgents.length === 0) return finish('no_eligible_intent');
        continue;
      }
      validationErrors.push(...generated.validationErrors);
      return finish('hard_gate_failed');
    }
    if (generated.agent !== arbitration.selectedAgent) {
      validationErrors.push('generated_agent_mismatch');
      return finish('invalid_generated_message');
    }
    if (generated.respondsToMessageId !== selectedIntent.targetMessageId) {
      validationErrors.push('generated_target_mismatch');
      return finish('invalid_generated_message');
    }
    if (generated.respondsToMessageId
      && !transcript.some(({ id }) => id === generated.respondsToMessageId)) {
      validationErrors.push('generated_target_message_not_found');
      return finish('invalid_generated_message');
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
      return finish('invalid_generated_message');
    }
    transcript.push(message);
    generatedCharacters += message.text.length;
    remainingAgents.splice(remainingAgents.indexOf(arbitration.selectedAgent), 1);
    if (selectedIntent.decision === 'ask_user') {
      return finish('needs_user_input');
    }
  }

  return finish('all_agents_spoke');
}
