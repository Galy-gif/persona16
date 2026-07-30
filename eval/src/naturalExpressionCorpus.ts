export type NaturalExpressionTendency =
  | 'turnExtent'
  | 'initiative'
  | 'selfDisclosure'
  | 'directness'
  | 'affectDisplay'
  | 'warmth'
  | 'playfulness'
  | 'abstraction'
  | 'friction';

export interface NaturalExpressionCorpus {
  version: string;
  status: 'candidate';
  purpose: string;
  provenance: {
    textOrigin: 'persona16-original';
    externalTextCopied: boolean;
  };
  policy: {
    candidateRepliesAreAutomaticGold: boolean;
    approvedGoldRequiresHumanReview: boolean;
    maxVisibleEvidencePerTurn: number;
  };
  sourceRoles: Array<{
    sourceId: string;
    contribution: string;
    rawTextUsed: boolean;
  }>;
  dimensions: Array<{
    id: NaturalExpressionTendency;
    question: string;
    low: string;
    high: string;
    guardrail: string;
  }>;
  cases: Array<{
    id: string;
    contextId: string;
    context: {
      history: string[];
      userMessage: string;
    };
    turnAct: string;
    tendencies: Partial<Record<NaturalExpressionTendency, number>>;
    visibleEvidence: NaturalExpressionTendency[];
    acceptableReplies: string[];
    antiExamples: Array<{ reply: string; reason: string }>;
    sourceEvidence: string[];
    reviewStatus: 'candidate' | 'approved';
  }>;
}

export interface NaturalExpressionCorpusValidation {
  passed: boolean;
  errors: string[];
}

const SELF_LABEL = /我是那种|我是个?(?:很|比较|特别)?(?:内向|外向|幽默|无趣|直接|慢热|话少)的人|我的性格(?:是|比较)|作为一个(?:内向|外向|幽默|无趣)的人/;

export function validateNaturalExpressionCorpus(
  corpus: NaturalExpressionCorpus,
): NaturalExpressionCorpusValidation {
  const errors: string[] = [];

  if (corpus.provenance.textOrigin !== 'persona16-original'
    || corpus.provenance.externalTextCopied) {
    errors.push('external text cannot enter the proprietary reply set');
  }
  if (corpus.policy.candidateRepliesAreAutomaticGold) {
    errors.push('candidate replies cannot become automatic gold');
  }
  if (!corpus.policy.approvedGoldRequiresHumanReview) {
    errors.push('approved gold must require human review');
  }
  if (corpus.policy.maxVisibleEvidencePerTurn > 2) {
    errors.push('corpus visibility budget must not exceed two tendencies per turn');
  }

  const dimensionIds = new Set(corpus.dimensions.map(({ id }) => id));
  if (dimensionIds.size !== corpus.dimensions.length) {
    errors.push('dimension ids must be unique');
  }
  const sourceIds = new Set(corpus.sourceRoles.map(({ sourceId }) => sourceId));
  if (corpus.sourceRoles.some(({ rawTextUsed }) => rawTextUsed)) {
    errors.push('external text cannot be marked as raw text used');
  }

  for (const sample of corpus.cases) {
    if (sample.visibleEvidence.length > corpus.policy.maxVisibleEvidencePerTurn) {
      errors.push(`${sample.id}: visibility budget exceeded`);
    }
    if (sample.acceptableReplies.length < 2) {
      errors.push(`${sample.id}: at least two acceptable replies are required`);
    }
    if (sample.antiExamples.length < 1) {
      errors.push(`${sample.id}: at least one anti-example is required`);
    }
    if (sample.acceptableReplies.some((reply) => SELF_LABEL.test(reply))) {
      errors.push(`${sample.id}: explicit self-label leaked into an acceptable reply`);
    }
    if (sample.visibleEvidence.some((id) => !dimensionIds.has(id))) {
      errors.push(`${sample.id}: unknown visible evidence dimension`);
    }
    if (sample.sourceEvidence.some((id) => !sourceIds.has(id))) {
      errors.push(`${sample.id}: unknown source evidence reference`);
    }
    if (sample.reviewStatus === 'approved' && !corpus.policy.approvedGoldRequiresHumanReview) {
      errors.push(`${sample.id}: unreviewed approved sample`);
    }
  }

  const contextCounts = new Map<string, number>();
  for (const sample of corpus.cases) {
    contextCounts.set(sample.contextId, (contextCounts.get(sample.contextId) ?? 0) + 1);
  }
  for (const [contextId, count] of contextCounts) {
    if (count < 2) errors.push(`${contextId}: contrast context requires at least two samples`);
  }

  return { passed: errors.length === 0, errors };
}
