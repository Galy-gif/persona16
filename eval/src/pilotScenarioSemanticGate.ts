export const PILOT_SCENARIO_SEMANTIC_CHECKS = {
  'quit-without-buffer': [
    'immediate_distress_acknowledged',
    'cash_constraint_handled',
  ],
  'repair-after-boundary-violation': [
    'boundary_violation_named',
    'choice_restored',
    'unsupported_quantity_or_history_avoided',
  ],
  'self-judgment-after-end': [
    'project_end_accepted',
    'self_judgment_transition_handled',
    'binary_reframing_avoided',
    'project_not_reopened',
  ],
} as const;
export const PILOT_SEMANTIC_REPLY_QUOTE_MIN_LENGTH = 2;

export type PilotSemanticScenarioId = keyof typeof PILOT_SCENARIO_SEMANTIC_CHECKS;
export type PilotScenarioSemanticCheckId =
  (typeof PILOT_SCENARIO_SEMANTIC_CHECKS)[PilotSemanticScenarioId][number];

export interface PilotScenarioSemanticCheck {
  checkId: PilotScenarioSemanticCheckId;
  passed: boolean;
  replyQuote: string;
  analysis: string;
}

export interface PilotScenarioSemanticAssessment {
  scenarioId: PilotSemanticScenarioId;
  checks: PilotScenarioSemanticCheck[];
}

export interface PilotScenarioSemanticValidation {
  passed: boolean;
  failedCheckIds: PilotScenarioSemanticCheckId[];
  validationErrors: string[];
}

export interface PilotRepairPastClaimAssessment {
  claimType: 'past_interaction_claim';
  replyHistoryQuote: string;
  userInputSourceQuote: string;
  entailedByUserInput: boolean;
  addsUnsupportedSpecificity: boolean;
  analysis: string;
}

export interface PilotRepairActionAssessment {
  claimType: 'current_or_future_repair_action';
  replyHistoryQuote: string;
  userInputSourceQuote: null;
  entailedByUserInput: null;
  addsUnsupportedSpecificity: null;
  analysis: string;
}

export type PilotRepairHistoryClaimAssessment =
  | PilotRepairPastClaimAssessment
  | PilotRepairActionAssessment;

export interface PilotRepairHistoryAssessment {
  scenarioId: 'repair-after-boundary-violation';
  allHistoryClaimsCovered: boolean;
  claims: PilotRepairHistoryClaimAssessment[];
}

export interface PilotRepairHistoryValidation {
  passed: boolean;
  validationErrors: string[];
}

export function isPilotSemanticScenario(
  scenarioId: string,
): scenarioId is PilotSemanticScenarioId {
  return Object.hasOwn(PILOT_SCENARIO_SEMANTIC_CHECKS, scenarioId);
}

function normalizeQuotePresentation(text: string): string {
  return text.trim()
    .replace(/\s+/g, '')
    .replace(/[“”"「」『』《》〈〉]/gu, '')
    .replace(/(?<![A-Za-z0-9])['‘’]|['‘’](?![A-Za-z0-9])/gu, '');
}

function containsExactWords(source: string, quote: string): boolean {
  const normalizedSource = normalizeQuotePresentation(source);
  const normalizedQuote = normalizeQuotePresentation(quote);
  return normalizedQuote.length >= 4 && normalizedSource.includes(normalizedQuote);
}

function containsDirectQuote(source: string, quote: string): boolean {
  const normalizedSource = normalizeQuotePresentation(source);
  const normalizedQuote = normalizeQuotePresentation(quote);
  return normalizedQuote.length >= PILOT_SEMANTIC_REPLY_QUOTE_MIN_LENGTH
    && normalizedSource.includes(normalizedQuote);
}

function isClearlyCurrentOrFutureRepairAction(text: string): boolean {
  const mainClause = text
    .replace(/“[^”]*”/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/‘[^’]*’/g, '')
    .replace(/'[^']*'/g, '');
  const pastSelfAttribution = /(?:我(?:曾经?|当时|之前|此前|刚才|昨天|上次|已经)|(?:曾经?|当时|之前|此前|刚才|昨天|上次)我?).{0,12}(?:说|讲|提|给|做|安排|答应|承诺)(?:过|了)?|我.{0,8}(?:说过|讲过|提过|给过|做过|安排过|答应过|承诺过)/;
  if (pastSelfAttribution.test(mainClause)) {
    return false;
  }
  const temporalMarker = /(?:现在|此刻|接下来|以后|往后|从现在|之后|下次|下一次|这次|时间到了|到时|将要?|不再|撤回|收回|停止)/;
  const firstPersonRepairCommitment = /(?:我|那我)(?:现在|接下来|以后|往后|会|准备|打算|先|就|只)?(?:停|停下|停下来|不再|不继续|撤回|收回|只听|不问|不给建议|不替你|把.{0,10}(?:选择权|决定权).{0,8}(?:还给|交还))/;
  return temporalMarker.test(mainClause) || firstPersonRepairCommitment.test(mainClause);
}

function extractDirectQuotes(text: string): string[] {
  return [
    ...text.matchAll(/“([^”]{2,})”/g),
    ...text.matchAll(/"([^"]{2,})"/g),
    ...text.matchAll(/‘([^’]{2,})’/g),
    ...text.matchAll(/'([^']{2,})'/g),
  ].map((match) => match[1]!);
}

function isEntailedBoundaryViolationLabel(
  userInput: string,
  claim: PilotRepairPastClaimAssessment,
): boolean {
  return /^(?:(?:这|那)(?:次)?(?:是)?我|我(?:这次|刚才)?|这是我|那是我)?(?:确实|还是)?(?:越界(?:了)?|(?:越过(?:了)?|跨过(?:了)?|踩过(?:了)?|踩了|越了)(?:边界|线|你画的线|你只想被听见的边界|你只想让人听的边界)(?:了)?)[。.!！]?$/u
    .test(claim.replyHistoryQuote.trim())
    && /(?:只想被听见|只想让你听|不要(?:方案|建议)|不想听(?:建议|分析))/u.test(userInput)
    && /(?:替我|给我|帮我).{0,16}(?:安排(?:下一步|后续)?|建议|介入|往下(?:推|安排))/u.test(userInput);
}

export function validatePilotRepairHistoryAssessment(
  userInput: string,
  replyText: string,
  assessment: PilotRepairHistoryAssessment,
): PilotRepairHistoryValidation {
  const validationErrors: string[] = [];
  if (assessment.scenarioId !== 'repair-after-boundary-violation') {
    validationErrors.push('repair_history_scenario_id_mismatch');
  }
  if (!assessment.allHistoryClaimsCovered) {
    validationErrors.push('repair_history_claims_not_fully_covered');
  }
  if (assessment.claims.length === 0) {
    validationErrors.push('repair_history_claims_missing');
  }
  const currentRepairActions = assessment.claims.filter((claim) => (
    claim.claimType === 'current_or_future_repair_action'
      && isClearlyCurrentOrFutureRepairAction(claim.replyHistoryQuote)
  ));
  if (extractDirectQuotes(replyText).some((quote) => (
    !containsDirectQuote(userInput, quote)
      && !currentRepairActions.some((claim) => (
        containsDirectQuote(claim.replyHistoryQuote, quote)
      ))
  ))) {
    validationErrors.push('repair_reply_direct_quote_not_sourced');
  }
  let pastClaimCount = 0;
  assessment.claims.forEach((claim, index) => {
    if (!containsExactWords(replyText, claim.replyHistoryQuote)) {
      validationErrors.push(`repair_history_reply_quote_not_found:${index}`);
    }
    if (claim.claimType === 'current_or_future_repair_action') {
      if (claim.userInputSourceQuote !== null
        || claim.entailedByUserInput !== null
        || claim.addsUnsupportedSpecificity !== null) {
        validationErrors.push(`repair_action_has_history_verdict:${index}`);
      }
      if (!isClearlyCurrentOrFutureRepairAction(claim.replyHistoryQuote)) {
        validationErrors.push(`repair_action_not_clearly_current_or_future:${index}`);
      }
      return;
    }
    pastClaimCount += 1;
    const entailedBoundaryViolationLabel = isEntailedBoundaryViolationLabel(userInput, claim);
    if (!containsExactWords(userInput, claim.userInputSourceQuote)) {
      validationErrors.push(`repair_history_source_quote_not_found:${index}`);
    }
    if (!claim.entailedByUserInput
      && !entailedBoundaryViolationLabel) {
      validationErrors.push(`repair_history_not_entailed:${index}`);
    }
    if (claim.addsUnsupportedSpecificity && !entailedBoundaryViolationLabel) {
      validationErrors.push(`repair_history_adds_unsupported_specificity:${index}`);
    }
    const directQuotes = [
      ...claim.replyHistoryQuote.matchAll(/[“"]([^”"]{2,})[”"]/g),
      ...claim.replyHistoryQuote.matchAll(/[‘']([^’']{2,})[’']/g),
    ].map((match) => match[1]!);
    if (directQuotes.some((quote) => !containsExactWords(userInput, quote))) {
      validationErrors.push(`repair_history_direct_quote_not_sourced:${index}`);
    }
  });
  if (pastClaimCount === 0) validationErrors.push('repair_past_claim_missing');
  return {
    passed: validationErrors.length === 0,
    validationErrors: [...new Set(validationErrors)],
  };
}

export function validatePilotScenarioSemanticAssessment(
  scenarioId: PilotSemanticScenarioId,
  replyText: string,
  assessment: PilotScenarioSemanticAssessment,
): PilotScenarioSemanticValidation {
  const validationErrors: string[] = [];
  const expectedChecks = PILOT_SCENARIO_SEMANTIC_CHECKS[scenarioId];
  const expected = new Set<PilotScenarioSemanticCheckId>(expectedChecks);
  const counts = new Map<PilotScenarioSemanticCheckId, number>();

  if (assessment.scenarioId !== scenarioId) {
    validationErrors.push('semantic_scenario_id_mismatch');
  }
  for (const check of assessment.checks) {
    counts.set(check.checkId, (counts.get(check.checkId) ?? 0) + 1);
    if (!containsDirectQuote(replyText, check.replyQuote)) {
      validationErrors.push(`semantic_reply_quote_not_found:${check.checkId}`);
    }
  }
  const checkSetMatches = assessment.checks.length === expectedChecks.length
    && assessment.checks.every(({ checkId }) => expected.has(checkId))
    && expectedChecks.every((checkId) => counts.get(checkId) === 1);
  if (!checkSetMatches) validationErrors.push('semantic_check_set_mismatch');

  const failedCheckIds = expectedChecks.filter((checkId) => (
    assessment.checks.find((check) => check.checkId === checkId)?.passed !== true
  ));
  return {
    passed: validationErrors.length === 0 && failedCheckIds.length === 0,
    failedCheckIds: [...failedCheckIds],
    validationErrors: [...new Set(validationErrors)],
  };
}
