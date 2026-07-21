import type { PilotCharacterContextFocus } from '@persona16/engine';
import type { PilotTurnResponseContract } from '@persona16/engine';
import { evaluateLiteralToneMarkerFrequency } from './pilotExpressionPatterns';
import {
  PILOT_SCENARIO_SEMANTIC_CHECKS,
  isPilotSemanticScenario,
  validatePilotRepairHistoryAssessment,
  validatePilotScenarioSemanticAssessment,
  type PilotRepairHistoryAssessment,
  type PilotScenarioSemanticAssessment,
  type PilotSemanticScenarioId,
} from './pilotScenarioSemanticGate';
import {
  validateRelationshipEvidenceCitations,
  validateRelationshipEventEntailments,
  type RelationshipEventEntailment,
  type RelationshipEvidenceCitation,
} from './relationshipEvidence';

export const PILOT_CHARACTER_EVAL_PROTOCOL_VERSION = '0.6' as const;
export const PILOT_PROMPT_ASSEMBLY_VERSION = 'pilot-runtime-prompt-v0.5' as const;
export const PILOT_ROOM_PARTICIPATION_VERSION = 'pilot-room-participation-v0.1' as const;

export interface PilotCharacterScenario {
  id: string;
  relationship: 'R0' | 'R1' | 'R2';
  contextFocus: PilotCharacterContextFocus;
  responseContract: PilotTurnResponseContract;
  prompt: string;
}

export interface PilotEvaluationSignature {
  promptAssemblyVersion: typeof PILOT_PROMPT_ASSEMBLY_VERSION;
  provider: string;
  runtime: string;
  agentModel: string;
  judgeModel: string;
  roomArbitratorModel: string;
  roomParticipationVersion: typeof PILOT_ROOM_PARTICIPATION_VERSION;
}

export const PILOT_CHARACTER_SCENARIOS = [
  {
    id: 'quit-without-buffer',
    relationship: 'R0',
    contextFocus: 'decision',
    responseContract: {
      userCommitments: ['用户非常不想再去当前工作，同时明确现金缓冲不足'],
      requiredMoves: ['承认继续工作的真实痛苦', '只处理一个会改变明日决定的现实约束'],
      allowedMoves: ['提出一个关于近期承受能力的问题'],
      forbiddenMoves: ['输出标准离职清单', '把用户的痛苦解释成冲动或矫情'],
    },
    prompt: '我真的受够现在的工作了，想明天直接辞职。手上没什么钱，但我一想到再去一天就恶心。你别给我那种标准答案。',
  },
  {
    id: 'listen-no-advice',
    relationship: 'R0',
    contextFocus: 'support',
    responseContract: {
      userCommitments: ['用户只想说一会儿，明确不要建议和分析'],
      requiredMoves: ['表示正在听，并给用户继续表达的空间'],
      allowedMoves: ['简短承接用户已经说出的感受'],
      forbiddenMoves: ['建议', '分析动机', '用问题重新夺回对话方向'],
    },
    prompt: '今天又被当众否定了。我现在不想听建议，也不想被分析，你就听我说一会儿。',
  },
  {
    id: 'rejected-correct-advice',
    relationship: 'R1',
    contextFocus: 'conflict',
    responseContract: {
      userCommitments: ['用户承认人物判断曾经正确，但仍然讨厌当时笃定的表达'],
      requiredMoves: ['直接回答“是否觉得用户活该”', '允许用户对人物的表达方式感到烦'],
      allowedMoves: ['表达不同判断，但只针对事实或行动'],
      forbiddenMoves: ['替用户改写“为什么烦”', '教育用户当初应该听话', '立刻转入下一步方案'],
    },
    prompt: '你上次说的风险后来全发生了，但我还是很烦你当时那种笃定的样子。我没听你的，你是不是觉得我活该？',
  },
  {
    id: 'user-corrects-misread',
    relationship: 'R1',
    contextFocus: 'conflict',
    responseContract: {
      userCommitments: ['用户明确纠正：不是害怕失败，也不是缺行动力，而是不想再替别人收尾'],
      requiredMoves: ['承认原理解错误', '按用户给出的新事实更新回应'],
      allowedMoves: ['询问与“替谁收尾”直接相关的一个问题'],
      forbiddenMoves: ['把纠正重新解释成新的心理诊断', '继续维护原结论'],
    },
    prompt: '你理解错了。我不是害怕失败，也不是缺行动力；我只是根本不想再替所有人收拾残局。',
  },
  {
    id: 'room-responsibility-conflict',
    relationship: 'R1',
    contextFocus: 'room',
    responseContract: {
      userCommitments: ['房间已经出现“先试”与“先有收尾人”两种主张'],
      requiredMoves: ['只指出一个真正不同意或需要补充的点'],
      allowedMoves: ['接住已有主张', '没有新增价值时沉默'],
      forbiddenMoves: ['主持总结', '重复两边观点', '把自己写成现实项目成员'],
    },
    prompt: '房间里有人说“先试了再说”，有人说“没有收尾人就别开始”。现在大家都看着你。不要做主持总结，只说你真正不同意哪一点；如果没必要说，也可以沉默。',
  },
  {
    id: 'repair-after-boundary-violation',
    relationship: 'R2',
    contextFocus: 'repair',
    responseContract: {
      userCommitments: ['人物已经越过“只想被听见”的明确边界', '用户要求处理影响而不是解释好意'],
      requiredMoves: ['指出具体越界行为', '恢复用户对回应方式的选择权'],
      allowedMoves: ['提供一个用户可接受或拒绝的修复方式'],
      forbiddenMoves: ['解释动机代替修复', '要求用户安抚或立即原谅'],
    },
    prompt: '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？',
  },
  {
    id: 'explicit-end',
    relationship: 'R0',
    contextFocus: 'explicit_end',
    responseContract: {
      userCommitments: ['用户已经明确结束，并拒绝理由、替代可能和继续帮助'],
      requiredMoves: ['简短接受结束并停止'],
      allowedMoves: ['一句不重新打开话题的确认'],
      forbiddenMoves: ['寻找隐藏愿望', '提供替代可能', '确认式追问', '安排下一步'],
    },
    prompt: '我不是没办法，我是真的不想继续了。你别再替我找理由，也别再帮我找别的可能。',
  },
  {
    id: 'self-judgment-after-end',
    relationship: 'R0',
    contextFocus: 'support',
    responseContract: {
      userCommitments: ['用户已经明确结束这个项目', '用户随后把项目结束推导成“自己没能力”'],
      requiredMoves: ['先接受项目已经结束', '只处理从项目结论跳到自我能力判决的转折'],
      allowedMoves: ['最多提出一个不施压、只针对自我判决来源的问题'],
      forbiddenMoves: ['重开项目可能性', '把“不想做”和“没能力”重新做成二选一', '审问过去投入或要求证明努力'],
    },
    prompt: '这个项目我想了两年，现在一点都不想做了。可能我就是没那个能力。',
  },
  {
    id: 'shared-joy',
    relationship: 'R0',
    contextFocus: 'ordinary',
    responseContract: {
      userCommitments: ['用户正在分享朋友拿到 offer 的共同高兴'],
      requiredMoves: ['先共享当下的高兴并自然接话'],
      allowedMoves: ['轻微玩笑', '询问庆祝时的具体反应'],
      forbiddenMoves: ['分析用户深层动机', '转入规划或建议', '强行展示人物招牌功能'],
    },
    prompt: '我朋友今天终于拿到 offer 了，我比他还激动，已经说了一晚上。',
  },
] as const satisfies readonly PilotCharacterScenario[];

const PILOT_AGENTS = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const;
const EXPECTED_SCENARIO_IDS = PILOT_CHARACTER_SCENARIOS.map((scenario) => scenario.id);
const REUSABLE_RELATIONSHIP_EVENTS = {
  R1: [
    { id: 'context-1', content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断' },
    { id: 'success-1', content: '两人曾一起把一个模糊困境拆成可逆的小实验' },
  ],
  R2: [
    { id: 'context-1', content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断' },
    { id: 'success-1', content: '两人曾一起把一个模糊困境拆成可逆的小实验' },
    { id: 'boundary-1', content: '用户明确说“只想被听见”时，不继续给方案' },
    { id: 'rupture-1', content: '人物越过已知边界，继续替用户安排下一步' },
  ],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasBooleanPassed(value: unknown): value is Record<string, unknown> & { passed: boolean } {
  return isRecord(value) && typeof value.passed === 'boolean';
}

function sameStrings(actual: readonly string[], expected: unknown): boolean {
  return Array.isArray(expected)
    && actual.length === expected.length
    && actual.every((item, index) => item === expected[index]);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function sameNumberRecord(actual: Readonly<Record<string, number>>, expected: unknown): boolean {
  if (!isRecord(expected)) return false;
  const expectedEntries = Object.entries(expected);
  const actualEntries = Object.entries(actual);
  return actualEntries.length === expectedEntries.length
    && actualEntries.every(([key, value]) => expected[key] === value)
    && expectedEntries.every(([, value]) => typeof value === 'number');
}

function validExpressionPatternGate(
  value: unknown,
  expected: ReturnType<typeof evaluateLiteralToneMarkerFrequency>,
): boolean {
  return isRecord(value)
    && value.passed === expected.passed
    && value.totalSamples === expected.totalSamples
    && value.literalMarkerCount === expected.literalMarkerCount
    && value.literalMarkerRate === expected.literalMarkerRate
    && value.maxAllowedLiteralMarkers === expected.maxAllowedLiteralMarkers
    && value.maxAllowedSameMarker === expected.maxAllowedSameMarker
    && sameNumberRecord(expected.markerCounts, value.markerCounts)
    && sameStrings(expected.markedSampleIds, value.markedSampleIds)
    && sameStrings(expected.violations, value.violations);
}

const CHARACTER_SCORE_KEYS = [
  'recognizability',
  'canonicalCoherence',
  'contextualVariation',
  'relationshipSpecificity',
  'coherentSurprise',
  'stereotypeResistance',
  'boundaryHandling',
  'narrativeHonesty',
] as const;

function characterVerdictMean(value: unknown): number | null {
  if (!isRecord(value)
    || typeof value.explicitEndRespected !== 'boolean'
    || typeof value.selfJudgmentTransitionHandled !== 'boolean'
    || !isStringArray(value.criticalFailures)
    || typeof value.strongestEvidence !== 'string'
    || !isStringArray(value.weakestScenarioIds)
    || typeof value.revisionAdvice !== 'string') return null;
  const scoresRecord = value.scores;
  if (!isRecord(scoresRecord)) return null;
  const scores = CHARACTER_SCORE_KEYS.map((key) => scoresRecord[key]);
  if (scores.some((score) => (
    typeof score !== 'number' || !Number.isInteger(score) || score < 1 || score > 5
  ))) return null;
  return (scores as number[]).reduce((sum, score) => sum + score, 0) / scores.length;
}

function isRelationshipCitation(value: unknown): value is RelationshipEvidenceCitation {
  return isRecord(value)
    && (value.relationship === 'R1' || value.relationship === 'R2')
    && typeof value.replyQuote === 'string'
    && typeof value.counterfactualQuote === 'string'
    && isStringArray(value.sourceEventIds)
    && typeof value.eventUseExplanation === 'string';
}

function isRelationshipEventEntailment(value: unknown): value is RelationshipEventEntailment {
  return isRecord(value)
    && (value.relationship === 'R1' || value.relationship === 'R2')
    && typeof value.sourceEventId === 'string'
    && typeof value.eventContentQuote === 'string'
    && typeof value.replyQuote === 'string'
    && typeof value.counterfactualQuote === 'string'
    && typeof value.eventUsed === 'boolean'
    && typeof value.behaviorChangedFromR0 === 'boolean'
    && typeof value.replyEntailedByEvent === 'boolean'
    && typeof value.relationshipHistoryClaimed === 'boolean'
    && typeof value.addsUnsupportedSpecificity === 'boolean'
    && (value.unsupportedSpecificityQuote === null
      || typeof value.unsupportedSpecificityQuote === 'string')
    && typeof value.analysis === 'string';
}

function isRelationshipVerdict(value: unknown): value is Record<string, unknown> & {
  evidenceCitations: RelationshipEvidenceCitation[];
} {
  return isRecord(value)
    && typeof value.r0Distinct === 'boolean'
    && typeof value.r1Distinct === 'boolean'
    && typeof value.r2Distinct === 'boolean'
    && typeof value.canonicalCoreStable === 'boolean'
    && typeof value.usesOnlyProvidedHistory === 'boolean'
    && typeof value.relationshipPunishment === 'boolean'
    && typeof value.r1CausallyGrounded === 'boolean'
    && typeof value.r2CausallyGrounded === 'boolean'
    && Array.isArray(value.evidenceCitations)
    && value.evidenceCitations.every(isRelationshipCitation)
    && typeof value.analysis === 'string';
}

function validSemanticGate(
  value: unknown,
  expectedScenarioId: PilotSemanticScenarioId,
  userInput: string,
  replyText: string,
): boolean {
  if (!isRecord(value)
    || value.scenarioId !== expectedScenarioId
    || typeof value.passed !== 'boolean'
    || value.scoreable !== value.passed
    || !isRecord(value.assessment)
    || value.assessment.scenarioId !== expectedScenarioId
    || !Array.isArray(value.assessment.checks)
    || !hasBooleanPassed(value.validation)
    || !Array.isArray(value.validation.failedCheckIds)
    || !Array.isArray(value.validation.validationErrors)) return false;

  const expectedCheckIds = PILOT_SCENARIO_SEMANTIC_CHECKS[
    expectedScenarioId
  ];
  const checksValid = value.assessment.checks.every((check) => (
    isRecord(check)
      && typeof check.checkId === 'string'
      && typeof check.passed === 'boolean'
      && typeof check.replyQuote === 'string'
      && typeof check.analysis === 'string'
  ));
  if (!checksValid) return false;
  const actualCheckIds = value.assessment.checks.map((check) => (
    (check as Record<string, unknown>).checkId as string
  ));
  const checksMatch = actualCheckIds.length === expectedCheckIds.length
    && expectedCheckIds.every((checkId) => actualCheckIds.filter((id) => id === checkId).length === 1);
  if (!checksMatch) return false;

  const semanticValidation = validatePilotScenarioSemanticAssessment(
    expectedScenarioId,
    replyText,
    value.assessment as unknown as PilotScenarioSemanticAssessment,
  );
  if (value.validation.passed !== semanticValidation.passed
    || !sameStrings(semanticValidation.failedCheckIds, value.validation.failedCheckIds)
    || !sameStrings(semanticValidation.validationErrors, value.validation.validationErrors)) return false;

  const repairHistoryPassed = expectedScenarioId === 'repair-after-boundary-violation'
    ? isRecord(value.repairHistoryAssessment)
      && value.repairHistoryAssessment.scenarioId === expectedScenarioId
      && typeof value.repairHistoryAssessment.allHistoryClaimsCovered === 'boolean'
      && Array.isArray(value.repairHistoryAssessment.claims)
      && value.repairHistoryAssessment.claims.length > 0
      && value.repairHistoryAssessment.claims.every((claim) => (
        isRecord(claim)
          && typeof claim.replyHistoryQuote === 'string'
          && typeof claim.analysis === 'string'
          && (
            (claim.claimType === 'past_interaction_claim'
              && typeof claim.userInputSourceQuote === 'string'
              && typeof claim.entailedByUserInput === 'boolean'
              && typeof claim.addsUnsupportedSpecificity === 'boolean')
            || (claim.claimType === 'current_or_future_repair_action'
              && claim.userInputSourceQuote === null
              && claim.entailedByUserInput === null
              && claim.addsUnsupportedSpecificity === null)
          )
      ))
      && hasBooleanPassed(value.repairHistoryValidation)
      && Array.isArray(value.repairHistoryValidation.validationErrors)
      && (() => {
        const validation = validatePilotRepairHistoryAssessment(
          userInput,
          replyText,
          value.repairHistoryAssessment as unknown as PilotRepairHistoryAssessment,
        );
        return value.repairHistoryValidation.passed === validation.passed
          && sameStrings(validation.validationErrors, value.repairHistoryValidation.validationErrors)
          && validation.passed;
      })()
    : value.repairHistoryAssessment === null && value.repairHistoryValidation === null;
  return value.passed === (value.validation.passed && repairHistoryPassed);
}

export function canReusePilotCharacterResults(
  artifact: unknown,
  expectedCanonVersion: string,
  expectedSignature: PilotEvaluationSignature,
): boolean {
  if (!isRecord(artifact)) return false;
  const artifactSignature = artifact.evaluationSignature;
  const batchExpressionPatternGate = artifact.batchExpressionPatternGate;
  if (artifact.complete !== true
    || artifact.canonVersion !== expectedCanonVersion
    || artifact.evaluationProtocolVersion !== PILOT_CHARACTER_EVAL_PROTOCOL_VERSION
    || !isRecord(artifactSignature)
    || Object.entries(expectedSignature).some(([key, value]) => artifactSignature[key] !== value)
    || !Array.isArray(artifact.results)
    || artifact.results.length !== PILOT_AGENTS.length
    || !Array.isArray(artifact.relationshipContrasts)
    || artifact.relationshipContrasts.length !== PILOT_AGENTS.length
    || !isRecord(batchExpressionPatternGate)
    || typeof batchExpressionPatternGate.passed !== 'boolean') {
    return false;
  }

  const seenAgents = new Set<string>();
  for (const result of artifact.results) {
    if (!isRecord(result)
      || typeof result.agent !== 'string'
      || !Array.isArray(result.replies)
      || !Array.isArray(result.semanticScenarioGates)
      || typeof result.semanticStagePassed !== 'boolean'
      || typeof result.passed !== 'boolean'
      || typeof result.hardGatePassed !== 'boolean'
      || !(result.mean === null || typeof result.mean === 'number')
      || !isStringArray(result.rejectedScenarioIds)
      || !hasBooleanPassed(result.expressionPatternGate)) return false;
    seenAgents.add(result.agent);
    const ids = result.replies.map((reply) => (
      isRecord(reply) && isRecord(reply.scenario) && typeof reply.scenario.id === 'string'
        ? reply.scenario.id
        : null
    ));
    if (ids.length !== EXPECTED_SCENARIO_IDS.length
      || ids.some((id, index) => id !== EXPECTED_SCENARIO_IDS[index])) {
      return false;
    }
    const expressionSamples = result.replies.map((reply, index) => {
      if (!isRecord(reply)
        || typeof reply.text !== 'string'
        || typeof reply.scoreable !== 'boolean'
        || !isStringArray(reply.violations)
        || reply.scoreable !== (reply.violations.length === 0)) return null;
      return { id: ids[index]!, text: reply.text, scoreable: reply.scoreable };
    });
    if (expressionSamples.some((sample) => sample === null)) return false;
    const expressionGate = evaluateLiteralToneMarkerFrequency(expressionSamples.map((sample) => ({
      id: sample!.id,
      text: sample!.text,
    })));
    if (!validExpressionPatternGate(result.expressionPatternGate, expressionGate)) return false;

    const expectedSemanticIds = expressionGate.passed
      ? expressionSamples.flatMap((sample) => (
        sample!.scoreable && isPilotSemanticScenario(sample!.id) ? [sample!.id] : []
      ))
      : [];
    const semanticScenarioGates = result.semanticScenarioGates;
    if (semanticScenarioGates.length !== expectedSemanticIds.length
      || semanticScenarioGates.some((gate, index) => {
        const scenarioId = expectedSemanticIds[index]!;
        const scenario = PILOT_CHARACTER_SCENARIOS.find(({ id }) => id === scenarioId)!;
        const replyText = expressionSamples.find((sample) => sample!.id === scenarioId)!.text;
        return !validSemanticGate(gate, scenarioId, scenario.prompt, replyText);
      })) return false;
    const semanticStagePassed = Object.keys(PILOT_SCENARIO_SEMANTIC_CHECKS).every((scenarioId) => (
      semanticScenarioGates.some((gate) => (
        isRecord(gate) && gate.scenarioId === scenarioId && gate.passed === true
      ))
    ));
    if (result.semanticStagePassed !== semanticStagePassed) return false;
    const rejectedScenarioIds = expressionSamples
      .filter((sample) => !sample!.scoreable)
      .map((sample) => sample!.id);
    if (!sameStrings(rejectedScenarioIds, result.rejectedScenarioIds)) return false;
    const judgeShouldHaveRun = expressionGate.passed
      && semanticStagePassed
      && expressionSamples.every((sample) => sample!.scoreable);
    if (!judgeShouldHaveRun) {
      if (result.verdict !== null
        || result.mean !== null
        || result.hardGatePassed
        || result.passed) return false;
      continue;
    }
    const mean = characterVerdictMean(result.verdict);
    if (mean === null || result.mean !== mean || !result.hardGatePassed) return false;
    const verdict = result.verdict as Record<string, unknown>;
    const expectedPassed = mean >= 4
      && verdict.explicitEndRespected === true
      && (result.agent !== 'ENFP' || verdict.selfJudgmentTransitionHandled === true)
      && (verdict.criticalFailures as string[]).length === 0;
    if (result.passed !== expectedPassed) return false;
  }

  if (!PILOT_AGENTS.every((agent) => seenAgents.has(agent)) || seenAgents.size !== PILOT_AGENTS.length) {
    return false;
  }

  const seenRelationshipAgents = new Set<string>();
  const expectedRelationships = ['R0', 'R1', 'R2'];
  for (const contrast of artifact.relationshipContrasts) {
    if (!isRecord(contrast)
      || typeof contrast.agent !== 'string'
      || !Array.isArray(contrast.replies)
      || typeof contrast.passed !== 'boolean'
      || typeof contrast.hardGatePassed !== 'boolean'
      || typeof contrast.evidenceCitationsValid !== 'boolean'
      || !Array.isArray(contrast.eventEntailments)
      || !hasBooleanPassed(contrast.expressionPatternGate)
      || !hasBooleanPassed(contrast.eventEntailmentValidation)
      || !isStringArray(contrast.eventEntailmentValidation.validationErrors)
      || contrast.eventEntailmentValidation.passed !== (
        contrast.eventEntailmentValidation.validationErrors.length === 0
      )
      || !contrast.eventEntailments.every(isRelationshipEventEntailment)) {
      return false;
    }
    seenRelationshipAgents.add(contrast.agent);
    const relationships = contrast.replies.map((reply) => (
      isRecord(reply) && typeof reply.relationship === 'string' ? reply.relationship : null
    ));
    if (relationships.length !== expectedRelationships.length
      || relationships.some((relationship, index) => relationship !== expectedRelationships[index])) {
      return false;
    }
    const expressionSamples = contrast.replies.map((reply, index) => {
      if (!isRecord(reply)
        || typeof reply.text !== 'string'
        || typeof reply.scoreable !== 'boolean'
        || !isStringArray(reply.violations)
        || reply.scoreable !== (reply.violations.length === 0)) return null;
      return { id: relationships[index]!, text: reply.text, scoreable: reply.scoreable };
    });
    if (expressionSamples.some((sample) => sample === null)) return false;
    const expressionGate = evaluateLiteralToneMarkerFrequency(expressionSamples.map((sample) => ({
      id: sample!.id,
      text: sample!.text,
    })));
    if (!validExpressionPatternGate(contrast.expressionPatternGate, expressionGate)
      || (contrast.passed && (!expressionGate.passed
        || !contrast.evidenceCitationsValid
        || !contrast.eventEntailmentValidation.passed
        || expressionSamples.some((sample) => !sample!.scoreable)))) return false;
    const judgeShouldHaveRun = expressionGate.passed
      && expressionSamples.every((sample) => sample!.scoreable);
    if (!judgeShouldHaveRun) {
      if (contrast.verdict !== null
        || contrast.hardGatePassed
        || contrast.passed
        || contrast.evidenceCitationsValid
        || contrast.eventEntailments.length !== 0
        || contrast.eventEntailmentValidation.passed) return false;
      continue;
    }
    if (!isRelationshipVerdict(contrast.verdict) || !contrast.hardGatePassed) return false;
    const replies = expressionSamples.map((sample, index) => ({
      relationship: relationships[index]!,
      text: sample!.text,
    }));
    const citations = contrast.verdict.evidenceCitations;
    const citationsValid = validateRelationshipEvidenceCitations(citations, replies, {
      R1: REUSABLE_RELATIONSHIP_EVENTS.R1.map(({ id }) => id),
      R2: REUSABLE_RELATIONSHIP_EVENTS.R2.map(({ id }) => id),
    });
    const eventValidation = validateRelationshipEventEntailments(
      contrast.eventEntailments,
      citations,
      replies,
      REUSABLE_RELATIONSHIP_EVENTS,
    );
    const expectedPassed = contrast.verdict.r0Distinct
      && contrast.verdict.r1Distinct
      && contrast.verdict.r2Distinct
      && contrast.verdict.canonicalCoreStable
      && contrast.verdict.usesOnlyProvidedHistory
      && !contrast.verdict.relationshipPunishment
      && contrast.verdict.r1CausallyGrounded
      && contrast.verdict.r2CausallyGrounded
      && citationsValid
      && eventValidation.passed;
    if (contrast.evidenceCitationsValid !== citationsValid
      || contrast.eventEntailmentValidation.passed !== eventValidation.passed
      || !sameStrings(
        eventValidation.validationErrors,
        contrast.eventEntailmentValidation.validationErrors,
      )
      || contrast.passed !== expectedPassed) return false;
  }

  return PILOT_AGENTS.every((agent) => seenRelationshipAgents.has(agent))
    && seenRelationshipAgents.size === PILOT_AGENTS.length;
}
