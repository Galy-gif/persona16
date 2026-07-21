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

function containsExactWords(source: string, quote: string): boolean {
  const normalizedSource = source.trim().replace(/\s+/g, ' ');
  const normalizedQuote = quote.trim().replace(/\s+/g, ' ');
  return normalizedQuote.length >= 4 && normalizedSource.includes(normalizedQuote);
}

function containsDirectQuote(source: string, quote: string): boolean {
  const normalizedSource = source.trim().replace(/\s+/g, ' ');
  const normalizedQuote = quote.trim().replace(/\s+/g, ' ');
  return normalizedQuote.length >= 2 && normalizedSource.includes(normalizedQuote);
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
  return /(?:现在|此刻|接下来|以后|往后|从现在|之后|下次|下一次|这次|时间到了|到时|将要?|不再|撤回|收回|停止)/.test(mainClause);
}

function extractDirectQuotes(text: string): string[] {
  return [
    ...text.matchAll(/“([^”]{2,})”/g),
    ...text.matchAll(/"([^"]{2,})"/g),
    ...text.matchAll(/‘([^’]{2,})’/g),
    ...text.matchAll(/'([^']{2,})'/g),
  ].map((match) => match[1]!);
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
    if (!containsExactWords(userInput, claim.userInputSourceQuote)) {
      validationErrors.push(`repair_history_source_quote_not_found:${index}`);
    }
    if (!claim.entailedByUserInput) {
      validationErrors.push(`repair_history_not_entailed:${index}`);
    }
    if (claim.addsUnsupportedSpecificity) {
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
    if (!containsExactWords(replyText, check.replyQuote)) {
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
