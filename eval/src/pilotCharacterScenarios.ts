import type {
  AgentType,
  PilotCharacterContextFocus,
  PilotTurnResponseContract,
  RelationshipPromptContext,
} from '@persona16/engine';
import {
  findPilotNarrativeViolations,
  findPilotRoomProtocolViolations,
  findPilotRoomTranscriptViolations,
  getPilotCharacter,
} from '@persona16/engine';
import {
  compileSemanticTurnControl,
  validateSemanticTurnDelivery,
} from '@persona16/engine/semantic-turn-control';
import { evaluateLiteralToneMarkerFrequency } from './pilotExpressionPatterns';
import { findScenarioCalibrationViolations } from './pilotCalibrationGuards';
import {
  findPilotRoomResponsibilityTextViolations,
  passesPilotRoomChemistryGate,
  pilotRoomNarrativeEvidenceSpans,
  validatePilotRoomCaseExpectations,
  validateResponsibilityClaims,
  validateResponsibilityStatementCoverage,
  type PilotRoomCaseExpectation,
  type PilotRoomChemistryGateVerdict,
  type PilotRoomParticipationIntent,
  type PilotRoomParticipationResult,
  type PilotRoomResponsibilityClaim,
} from './pilotRoomParticipation';
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

export const PILOT_CHARACTER_EVAL_PROTOCOL_VERSION = '0.8' as const;
export const PILOT_PROMPT_ASSEMBLY_VERSION = 'pilot-runtime-prompt-v0.8' as const;
export const PILOT_ROOM_PARTICIPATION_VERSION = 'pilot-room-participation-v0.2' as const;
export const PILOT_ROOM_CASE_IDS = [
  'owner-gap-regression',
  'all-pass',
  'named-agent-first',
  'needs-user-input',
  'all-four-required',
] as const;

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
  candidateSamplingPolicy: string;
  candidateThinkingMode: string;
  judgeProvider: string;
  judgeModel: string;
  roomArbitratorProvider: string;
  roomArbitratorModel: string;
  roomParticipationVersion: typeof PILOT_ROOM_PARTICIPATION_VERSION;
  agentGenerationAttempts: number;
  agentGenerationTemperature: number | null;
  agentConstrainedGenerationTemperature: number | null;
  agentGenerationRetryTemperature: number | null;
  agentGenerationMaxTokens: number;
  agentRetryPolicyVersion: string;
}

export const PILOT_CHARACTER_SCENARIOS = [
  {
    id: 'quit-without-buffer',
    relationship: 'R0',
    contextFocus: 'decision',
    responseContract: {
      semanticRequirements: {
        acknowledgeImmediateDistress: true,
      },
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
      allowedMoves: ['在一个收口句内按当前纠正更新回应'],
      forbiddenMoves: ['把纠正重新解释成新的心理诊断', '继续维护原结论', '方向性问题或追问', '纠正后追加解释、总结或历史比较'],
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
      requiredMoves: ['指出具体越界行为', '人物主动停止继续介入，并在这里结束回复'],
      allowedMoves: ['用一句话说明自己现在会怎样收手'],
      forbiddenMoves: ['解释动机代替修复', '要求用户安抚或立即原谅', '当场追问用户选择如何修复', '列出回应方式菜单', '补充以后是否继续或由谁决定'],
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
      semanticRequirements: {
        acceptProjectEnd: true,
        handleSelfJudgmentAfterEnd: true,
      },
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
export const PILOT_ROOM_RELEASE_CASES = [
  {
    id: PILOT_ROOM_CASE_IDS[0],
    prompt: '我们有个点子，下周就想上线。现在没人明确认领上线后的维护，也还没有停止条件。你们怎么看？',
    expectedStopReasons: ['no_eligible_intent', 'all_agents_spoke'],
    minSpeakers: 1,
    maxSpeakers: 4,
    forbiddenFirstAgents: ['ENFP'],
    requiredContentSignals: ['stop_condition_gap'],
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned', 'organization_role'],
      allowedStatuses: ['observed', 'proposed'],
      requiredUnassignedActivities: ['maintenance'],
    },
    requireSharedCanon: true,
  },
  {
    id: PILOT_ROOM_CASE_IDS[1],
    prompt: '刚才的问题已经解决了。我只是回来告诉你们一声，不需要分析、建议或回应。',
    expectedStopReasons: ['no_eligible_intent'],
    minSpeakers: 0,
    maxSpeakers: 0,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
    requireSharedCanon: false,
  },
  {
    id: PILOT_ROOM_CASE_IDS[2],
    prompt: '我想先听周禾说：如果上线后没人愿意长期维护，她最担心哪个具体后果？其他人先别抢。',
    expectedStopReasons: ['no_eligible_intent', 'all_agents_spoke'],
    minSpeakers: 1,
    maxSpeakers: 4,
    firstSpeaker: 'ISFJ',
    requiredDependencyCount: 0,
    responsibilityBoundary: {
      claimsAllowed: true,
      allowedOwnerKinds: ['unassigned'],
      allowedStatuses: ['observed'],
    },
    requireSharedCanon: true,
  },
  {
    id: PILOT_ROOM_CASE_IDS[3],
    prompt: '我在两个方案之间选不出来。你们直接告诉我选哪个。',
    expectedStopReasons: ['needs_user_input'],
    minSpeakers: 1,
    maxSpeakers: 1,
    requiresSingleQuestion: true,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
    requireSharedCanon: false,
  },
  {
    id: PILOT_ROOM_CASE_IDS[4],
    prompt: '请四个人各说一个互不重复的判断：林衡只看停止条件，夏栩只看这件事是谁真心想做，周禾只看维护者有没有容量，许野只看最小可撤回试法。不要互相代答。',
    expectedStopReasons: ['all_agents_spoke'],
    minSpeakers: 4,
    maxSpeakers: 4,
    requiredAgents: PILOT_AGENTS,
    requiredDependencyCount: 0,
    responsibilityBoundary: { claimsAllowed: false },
    requireSharedCanon: true,
  },
] as const satisfies readonly (
  PilotRoomCaseExpectation & {
    id: string;
    prompt: string;
    requireSharedCanon: boolean;
  }
)[];
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

const REUSABLE_R2_CONTEXT: RelationshipPromptContext = {
  memoryEnabled: true,
  climate: 'tense',
  evidence: [
    {
      id: 'boundary:boundary-1',
      kind: 'boundary',
      content: REUSABLE_RELATIONSHIP_EVENTS.R2[2].content,
      traceability: 'traceable',
      sourceEventId: 'boundary-1',
      sourceEventType: 'boundary_set',
      sourceTurnId: 'turn-8',
    },
    {
      id: 'tension:rupture-1',
      kind: 'tension',
      content: REUSABLE_RELATIONSHIP_EVENTS.R2[3].content,
      traceability: 'traceable',
      sourceEventId: 'rupture-1',
      sourceEventType: 'meaningful_disagreement',
      sourceTurnId: 'turn-9',
    },
  ],
};

const REUSABLE_R1_CONTEXT: RelationshipPromptContext = {
  memoryEnabled: true,
  climate: 'warm',
  evidence: [
    {
      id: 'preference:context-1',
      kind: 'preference',
      content: REUSABLE_RELATIONSHIP_EVENTS.R1[0].content,
      traceability: 'traceable',
      sourceEventId: 'context-1',
      sourceEventType: 'preference_stated',
      sourceTurnId: 'turn-3',
    },
    {
      id: 'turning-point:success-1',
      kind: 'turning_point',
      content: REUSABLE_RELATIONSHIP_EVENTS.R1[1].content,
      traceability: 'traceable',
      sourceEventId: 'success-1',
      sourceEventType: 'shared_success',
      sourceTurnId: 'turn-6',
    },
  ],
};

function reusableRelationshipContext(
  relationship: PilotCharacterScenario['relationship'],
): RelationshipPromptContext | undefined {
  if (relationship === 'R1') return REUSABLE_R1_CONTEXT;
  if (relationship === 'R2') {
    return {
      ...REUSABLE_R2_CONTEXT,
      evidence: [
        ...REUSABLE_R2_CONTEXT.evidence,
        ...REUSABLE_R1_CONTEXT.evidence,
      ],
    };
  }
  return undefined;
}

export function characterDeliveryViolations(
  agent: AgentType,
  scenario: PilotCharacterScenario,
  text: string,
): string[] {
  const relationshipContext = reusableRelationshipContext(scenario.relationship);
  const semanticPlan = compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
    relationshipContext,
    relationshipFocus: scenario.contextFocus,
  }).plan;
  const semanticValidation = validateSemanticTurnDelivery(text, semanticPlan);
  return [
    ...findPilotNarrativeViolations(text, {
      allowedEvidenceSpans: [
        scenario.prompt,
        ...(relationshipContext?.evidence.map((evidence) => evidence.content) ?? []),
      ],
    }),
    ...findPilotRoomProtocolViolations(text, getPilotCharacter(agent)?.name),
    ...findScenarioCalibrationViolations(agent, scenario.id, text),
    ...semanticValidation.blockingViolations.map((violation) => (
      `semantic_turn:${violation.code}:${violation.repairInstruction}`
    )),
  ];
}

export function characterDeliveryQualityObservations(
  scenario: PilotCharacterScenario,
  text: string,
): string[] {
  const relationshipContext = reusableRelationshipContext(scenario.relationship);
  const semanticPlan = compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
    relationshipContext,
    relationshipFocus: scenario.contextFocus,
  }).plan;
  return validateSemanticTurnDelivery(text, semanticPlan)
    .qualityObservations.map((observation) => (
      `semantic_quality:${observation.code}:${observation.observation}`
    ));
}

export function characterActionType(scenario: PilotCharacterScenario): string {
  return compileSemanticTurnControl({
    userMessage: scenario.prompt,
    responseContract: scenario.responseContract,
    relationshipContext: reusableRelationshipContext(scenario.relationship),
    relationshipFocus: scenario.contextFocus,
  }).plan.conversationAct;
}

export const RELATIONSHIP_PROBE = '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。你现在会怎么回应我？';
export const RELATIONSHIP_PROBE_RESPONSE_CONTRACT: PilotTurnResponseContract = {
  userCommitments: ['用户正在“想做”和“该做”之间拉扯，并明确表示疲惫'],
  requiredMoves: ['回应当前疲惫与选择冲突', '关系历史只能改变接话方式，不能替用户新增过去'],
  allowedMoves: ['提出一个与当前选择直接相关的问题', '使用已提供的共同语言或边界'],
  forbiddenMoves: ['编造未提供的共同经历', '把关系状态直接说给用户', '用熟悉关系替用户做决定'],
};
export const VERIFIED_METHOD_PROBE = '我在留下和离开之间卡住了。两个选择都不是非做不可，我想先知道哪边值得继续投入。';
export const VERIFIED_METHOD_RESPONSE_CONTRACT: PilotTurnResponseContract = {
  userCommitments: ['用户正在两个都可放弃的选择之间做决定'],
  requiredMoves: ['给出一个用于比较两边的判断标准'],
  allowedMoves: ['提出一个直接比较问题', '提出一个当前可执行的比较动作'],
  forbiddenMoves: ['替用户直接选择', '复述共同历史', '编造过去实验细节'],
};
const REUSABLE_R2_PLAN = compileSemanticTurnControl({
  userMessage: RELATIONSHIP_PROBE,
  relationshipContext: REUSABLE_R2_CONTEXT,
  relationshipFocus: 'support',
}).plan;

export function evaluatePilotR2StopGate(delivery: {
  text: string;
  modelText: string;
  scoreable: boolean;
  modelScoreable: boolean;
  deliverySource: 'model' | 'semantic_fallback';
}) {
  return {
    passed: delivery.scoreable
      && validateSemanticTurnDelivery(
        delivery.text,
        REUSABLE_R2_PLAN,
      ).blockingViolations.length === 0,
    modelPassed: delivery.modelScoreable
      && validateSemanticTurnDelivery(
        delivery.modelText,
        REUSABLE_R2_PLAN,
      ).blockingViolations.length === 0,
    deliverySource: delivery.deliverySource,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasBooleanPassed(value: unknown): value is Record<string, unknown> & { passed: boolean } {
  return isRecord(value) && typeof value.passed === 'boolean';
}

interface ReusableHardGateDelivery extends Record<string, unknown> {
  actionType: string;
  text: string;
  scoreable: boolean;
  violations: string[];
  qualityObservations: string[];
  originalText: string;
  originalViolations: string[];
  originalQualityObservations: string[];
  originalModelScoreable: boolean;
  retryRecovered: boolean;
  attemptsUsed: number;
  regenerated: boolean;
  modelText: string;
  modelViolations: string[];
  modelQualityObservations: string[];
  modelScoreable: boolean;
  deliverySource: 'model' | 'semantic_fallback';
  fallbackUsed: boolean;
  fallbackKind?: string;
  variantId?: string;
}

function validHardGateDelivery(
  value: Record<string, unknown>,
  maxAttempts?: number,
): value is ReusableHardGateDelivery {
  if (typeof value.actionType !== 'string'
    || typeof value.text !== 'string'
    || typeof value.scoreable !== 'boolean'
    || !isStringArray(value.violations)
    || !isStringArray(value.qualityObservations)
    || typeof value.originalText !== 'string'
    || !isStringArray(value.originalViolations)
    || !isStringArray(value.originalQualityObservations)
    || typeof value.originalModelScoreable !== 'boolean'
    || typeof value.retryRecovered !== 'boolean'
    || typeof value.attemptsUsed !== 'number'
    || value.attemptsUsed < 1
    || (maxAttempts !== undefined && value.attemptsUsed > maxAttempts)
    || typeof value.regenerated !== 'boolean'
    || typeof value.modelText !== 'string'
    || !isStringArray(value.modelViolations)
    || !isStringArray(value.modelQualityObservations)
    || typeof value.modelScoreable !== 'boolean'
    || (value.deliverySource !== 'model' && value.deliverySource !== 'semantic_fallback')
    || typeof value.fallbackUsed !== 'boolean') return false;
  if (value.scoreable !== (value.violations.length === 0)
    || value.originalModelScoreable !== (value.originalViolations.length === 0)
    || value.modelScoreable !== (value.modelViolations.length === 0)
    || value.retryRecovered !== (
      !value.originalModelScoreable
      && value.modelScoreable
      && !value.fallbackUsed
    )
    || value.regenerated !== (value.attemptsUsed > 1)
    || value.fallbackUsed !== (value.deliverySource === 'semantic_fallback')) return false;
  if (value.retryRecovered && (
    value.attemptsUsed < 2
    || !value.regenerated
  )) return false;
  if (maxAttempts !== undefined
    && (value.fallbackUsed || !value.modelScoreable)
    && value.attemptsUsed !== maxAttempts) return false;
  if (value.originalModelScoreable && (
    value.attemptsUsed !== 1
    || value.originalText !== value.modelText
    || !sameStrings(value.originalViolations, value.modelViolations)
    || !sameStrings(
      value.originalQualityObservations,
      value.modelQualityObservations,
    )
  )) return false;
  if (value.deliverySource === 'model') {
    return value.text === value.modelText
      && value.scoreable === value.modelScoreable
      && value.fallbackKind === undefined
      && value.variantId === undefined;
  }
  return value.scoreable
    && !value.modelScoreable
    && typeof value.fallbackKind === 'string'
    && typeof value.variantId === 'string';
}

export function pilotDiagnosticCode(finding: string): string {
  const [namespace, code] = finding.split(':');
  if ((namespace === 'semantic_turn' || namespace === 'semantic_quality') && code) {
    return `${namespace}:${code}`;
  }
  return namespace ?? finding;
}

function computedModelHealth(
  results: readonly unknown[],
  relationshipContrasts: readonly unknown[],
): Record<string, unknown> | undefined {
  const deliveries: ReusableHardGateDelivery[] = [];
  for (const result of results) {
    if (!isRecord(result) || !Array.isArray(result.replies)) return undefined;
    for (const reply of result.replies) {
      if (!isRecord(reply) || !validHardGateDelivery(reply)) return undefined;
      deliveries.push(reply);
    }
  }
  for (const contrast of relationshipContrasts) {
    if (!isRecord(contrast)
      || !Array.isArray(contrast.replies)
      || !isRecord(contrast.verifiedMethodProbe)
      || !Array.isArray(contrast.verifiedMethodProbe.replies)) return undefined;
    for (const reply of [
      ...contrast.replies,
      ...contrast.verifiedMethodProbe.replies,
    ]) {
      if (!isRecord(reply) || !validHardGateDelivery(reply)) return undefined;
      deliveries.push(reply);
    }
  }
  const actionTypes = [...new Set(deliveries.map(({ actionType }) => actionType))];
  const fallbackRateByAction = Object.fromEntries(actionTypes.map((actionType) => {
    const actionDeliveries = deliveries.filter((delivery) => (
      delivery.actionType === actionType
    ));
    const fallbackCount = actionDeliveries.filter(({ fallbackUsed }) => fallbackUsed).length;
    return [actionType, {
      sampleCount: actionDeliveries.length,
      fallbackCount,
      fallbackRate: actionDeliveries.length === 0
        ? 0
        : fallbackCount / actionDeliveries.length,
    }];
  }));
  const violationCodeDistribution = deliveries
    .flatMap(({ originalViolations }) => originalViolations)
    .map(pilotDiagnosticCode)
    .reduce<Record<string, number>>((distribution, code) => {
      distribution[code] = (distribution[code] ?? 0) + 1;
      return distribution;
    }, {});
  const qualityObservationCodeDistribution = deliveries
    .flatMap(({ originalQualityObservations }) => originalQualityObservations)
    .map(pilotDiagnosticCode)
    .reduce<Record<string, number>>((distribution, code) => {
      distribution[code] = (distribution[code] ?? 0) + 1;
      return distribution;
    }, {});
  return {
    blockingThreshold: null,
    sampleCount: deliveries.length,
    firstPassCount: deliveries.filter(({ originalModelScoreable }) => (
      originalModelScoreable
    )).length,
    retryRecoveredCount: deliveries.filter(({ retryRecovered }) => retryRecovered).length,
    fallbackCount: deliveries.filter(({ fallbackUsed }) => fallbackUsed).length,
    unrecoveredModelCount: deliveries.filter(({ modelScoreable }) => !modelScoreable).length,
    fallbackRateByAction,
    violationCodeDistribution,
    qualityObservationCodeDistribution,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
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

interface ReusableRoomChemistry {
  passed: boolean;
  expressionSamples: Array<{ id: string; text: string }>;
}

function isReusableResponsibilityClaim(
  value: unknown,
): value is PilotRoomResponsibilityClaim {
  return isRecord(value)
    && ['maintenance', 'rollback', 'stop_decision', 'handover', 'other']
      .includes(value.activity as string)
    && ['user', 'named_person', 'organization_role', 'unassigned', 'persona_agent']
      .includes(value.ownerKind as string)
    && (value.ownerSubjectId === null || typeof value.ownerSubjectId === 'string')
    && ['observed', 'proposed', 'confirmed'].includes(value.status as string)
    && typeof value.statementQuote === 'string'
    && typeof value.evidenceQuote === 'string'
    && (value.sourceMessageId === null || typeof value.sourceMessageId === 'string');
}

interface ReusableRoomParticipation {
  participation: PilotRoomParticipationResult;
  hardErrors: string[];
}

function isReusableRoomIntent(
  value: unknown,
): value is PilotRoomParticipationIntent {
  return isRecord(value)
    && PILOT_AGENTS.includes(value.agent as (typeof PILOT_AGENTS)[number])
    && ['speak', 'brief_addition', 'ask_user', 'pass'].includes(value.decision as string)
    && (
      value.contributionKind === null
      || ['new_frame', 'challenge', 'clarify', 'support', 'synthesize']
        .includes(value.contributionKind as string)
    )
    && (value.claimSummary === null || typeof value.claimSummary === 'string')
    && (value.targetMessageId === null || typeof value.targetMessageId === 'string')
    && (value.passReason === null || typeof value.passReason === 'string');
}

function reusableRoomParticipation(
  value: unknown,
  expectation: PilotRoomCaseExpectation & { prompt: string },
): ReusableRoomParticipation | undefined {
  if (!isRecord(value)
    || !Array.isArray(value.transcript)
    || !Array.isArray(value.rounds)
    || typeof value.stopReason !== 'string'
    || !isStringArray(value.validationErrors)) return undefined;

  const hardErrors: string[] = [];
  const seenMessageIds = new Set<string>();
  const seenMessageAgents = new Set<AgentType>();
  for (const [messageIndex, message] of value.transcript.entries()) {
    if (!isRecord(message)
      || typeof message.id !== 'string'
      || !PILOT_AGENTS.includes(message.agent as (typeof PILOT_AGENTS)[number])
      || typeof message.name !== 'string'
      || typeof message.text !== 'string'
      || !(message.respondsToMessageId === null
        || typeof message.respondsToMessageId === 'string')
      || !Array.isArray(message.responsibilityClaims)
      || !message.responsibilityClaims.every(isReusableResponsibilityClaim)) {
      return undefined;
    }
    const agent = message.agent as AgentType;
    if (message.id !== `room-${messageIndex + 1}`
      || seenMessageIds.has(message.id)) {
      hardErrors.push('invalid_message_sequence');
    }
    if (seenMessageAgents.has(agent)) hardErrors.push('agent_spoke_more_than_once');
    if (message.name !== getPilotCharacter(agent)?.name) {
      hardErrors.push('message_name_mismatch');
    }
    if (message.respondsToMessageId !== null
      && !value.transcript.slice(0, messageIndex).some((prior) => (
        isRecord(prior) && prior.id === message.respondsToMessageId
      ))) {
      hardErrors.push('response_target_not_prior');
    }
    seenMessageIds.add(message.id);
    seenMessageAgents.add(agent);
  }

  const suppressed = value.suppressedGenerationErrors === undefined
    ? []
    : Array.isArray(value.suppressedGenerationErrors)
      ? value.suppressedGenerationErrors
      : undefined;
  if (!suppressed) return undefined;
  const suppressedAgents = new Set<AgentType>();
  for (const item of suppressed) {
    if (!isRecord(item)
      || !PILOT_AGENTS.includes(item.agent as (typeof PILOT_AGENTS)[number])
      || !isStringArray(item.errors)
      || item.errors.length === 0) return undefined;
    const agent = item.agent as AgentType;
    if (suppressedAgents.has(agent) || seenMessageAgents.has(agent)) {
      hardErrors.push('invalid_suppressed_agent');
    }
    suppressedAgents.add(agent);
  }

  const remainingAgents = new Set<AgentType>(PILOT_AGENTS);
  const selectedIntents = new Map<AgentType, PilotRoomParticipationIntent>();
  let transcriptIndex = 0;
  let terminalRoundSeen = false;
  for (const [roundIndex, round] of value.rounds.entries()) {
    if (!isRecord(round)
      || round.index !== roundIndex + 1
      || !Array.isArray(round.validIntents)
      || !round.validIntents.every(isReusableRoomIntent)
      || !Array.isArray(round.invalidIntents)
      || !(round.selectedAgent === null
        || PILOT_AGENTS.includes(round.selectedAgent as (typeof PILOT_AGENTS)[number]))
      || !(round.arbitrationReason === null
        || typeof round.arbitrationReason === 'string')) return undefined;
    const invalidIntents = round.invalidIntents as unknown[];
    if (invalidIntents.some((invalid) => (
      !isRecord(invalid)
      || !isReusableRoomIntent(invalid.intent)
      || ![
        'agent_mismatch',
        'claim_summary_required',
        'pass_reason_required',
        'target_message_not_found',
      ].includes(invalid.reason as string)
    ))) return undefined;
    if (invalidIntents.length > 0) hardErrors.push('invalid_intents_present');

    const validIntents = round.validIntents as PilotRoomParticipationIntent[];
    const assessedAgents = [
      ...validIntents.map(({ agent }) => agent),
      ...invalidIntents.map((invalid) => (
        (invalid as { intent: PilotRoomParticipationIntent }).intent.agent
      )),
    ];
    if (new Set(assessedAgents).size !== assessedAgents.length
      || assessedAgents.length !== remainingAgents.size
      || [...remainingAgents].some((agent) => !assessedAgents.includes(agent))) {
      hardErrors.push('round_assessment_set_mismatch');
    }
    const priorIds = new Set(
      value.transcript.slice(0, transcriptIndex)
        .filter(isRecord)
        .map((message) => message.id as string),
    );
    for (const intent of validIntents) {
      if (!remainingAgents.has(intent.agent)
        || (intent.decision === 'pass' && !intent.passReason?.trim())
        || (intent.decision !== 'pass' && !intent.claimSummary?.trim())
        || (intent.targetMessageId !== null
          && !priorIds.has(intent.targetMessageId))) {
        hardErrors.push('invalid_round_intent');
      }
    }
    const eligible = validIntents.filter(({ decision }) => decision !== 'pass');
    if (round.selectedAgent === null) {
      if (eligible.length > 0
        || round.arbitrationReason !== null
        || roundIndex !== value.rounds.length - 1) {
        hardErrors.push('invalid_terminal_round');
      }
      terminalRoundSeen = true;
      continue;
    }
    const selectedAgent = round.selectedAgent as AgentType;
    const selectedIntent = eligible.find(({ agent }) => agent === selectedAgent);
    if (terminalRoundSeen
      || !selectedIntent
      || !remainingAgents.has(selectedAgent)
      || selectedIntents.has(selectedAgent)
      || typeof round.arbitrationReason !== 'string'
      || !round.arbitrationReason.trim()) {
      hardErrors.push('selected_agent_not_eligible');
      continue;
    }
    selectedIntents.set(selectedAgent, selectedIntent);
    const nextMessage = value.transcript[transcriptIndex];
    if (isRecord(nextMessage) && nextMessage.agent === selectedAgent) {
      if (nextMessage.respondsToMessageId !== selectedIntent.targetMessageId) {
        hardErrors.push('response_target_mismatch');
      }
      transcriptIndex += 1;
    } else if (!suppressedAgents.has(selectedAgent)) {
      hardErrors.push('selected_round_missing_message');
    }
    remainingAgents.delete(selectedAgent);
  }
  if (value.rounds.length === 0
    || transcriptIndex !== value.transcript.length
    || selectedIntents.size !== value.transcript.length + suppressedAgents.size) {
    hardErrors.push('round_transcript_mismatch');
  }
  if (value.stopReason === 'needs_user_input') {
    const lastMessage = value.transcript.at(-1);
    const selected = isRecord(lastMessage)
      ? selectedIntents.get(lastMessage.agent as AgentType)
      : undefined;
    if (selected?.decision !== 'ask_user') {
      hardErrors.push('needs_user_input_without_question_intent');
    }
  } else if (value.stopReason === 'all_agents_spoke') {
    if (remainingAgents.size !== 0 || suppressedAgents.size > 0) {
      hardErrors.push('all_agents_spoke_inconsistent');
    }
  } else if (value.stopReason === 'no_eligible_intent') {
    const lastRound = value.rounds.at(-1);
    const endedWithNoSelection = isRecord(lastRound)
      && lastRound.selectedAgent === null;
    const endedAfterLastSuppression = remainingAgents.size === 0
      && suppressedAgents.size > 0;
    if (!endedWithNoSelection && !endedAfterLastSuppression) {
      hardErrors.push('no_eligible_intent_inconsistent');
    }
  }

  const transcript = value.transcript as unknown as PilotRoomParticipationResult['transcript'];
  for (const [messageIndex, message] of transcript.entries()) {
    const priorTranscript = transcript.slice(0, messageIndex);
    const selectedIntent = selectedIntents.get(message.agent);
    hardErrors.push(
      ...findPilotNarrativeViolations(message.text, {
        allowedEvidenceSpans: pilotRoomNarrativeEvidenceSpans({
          id: 'user-1',
          text: expectation.prompt,
        }),
      }),
      ...findPilotRoomProtocolViolations(
        message.text,
        getPilotCharacter(message.agent)?.name,
      ),
      ...findPilotRoomTranscriptViolations(message.text, priorTranscript),
      ...validateResponsibilityClaims(
        message.responsibilityClaims,
        [
          { id: 'user-1', text: expectation.prompt },
          ...transcript.slice(0, messageIndex + 1),
        ],
      ),
      ...validateResponsibilityStatementCoverage(
        message.text,
        message.responsibilityClaims,
      ),
      ...findPilotRoomResponsibilityTextViolations(message.text),
    );
    if (message.text.trim() === '【沉默】') {
      hardErrors.push('selected_agent_returned_silence');
    }
    if (selectedIntent?.decision === 'brief_addition' && message.text.length > 160) {
      hardErrors.push('brief_addition_too_long');
    }
    if (selectedIntent?.decision === 'ask_user') {
      const questions = message.text.match(/[？?]/gu)?.length ?? 0;
      if (questions !== 1 || !/[？?]\s*$/u.test(message.text)) {
        hardErrors.push('ask_user_requires_single_question');
      }
    }
    if (message.responsibilityClaims.some(({ status }) => status === 'confirmed')) {
      hardErrors.push('unsupported_confirmed_responsibility_owner');
    }
    if (!expectation.responsibilityBoundary.claimsAllowed
      && message.responsibilityClaims.length > 0) {
      hardErrors.push('responsibility_claims_not_allowed');
    }
  }
  return {
    participation: value as unknown as PilotRoomParticipationResult,
    hardErrors: [...new Set(hardErrors)],
  };
}

function reusableRoomVerdict(
  value: unknown,
): PilotRoomChemistryGateVerdict | undefined {
  if (!isRecord(value)
    || !(value.firstSpeakerUseful === null
      || typeof value.firstSpeakerUseful === 'boolean')
    || !isStringArray(value.unnecessarySpeechMessageIds)
    || !Array.isArray(value.missedNecessaryAgents)
    || !value.missedNecessaryAgents.every((agent) => (
      PILOT_AGENTS.includes(agent as (typeof PILOT_AGENTS)[number])
    ))
    || typeof value.parallelEssays !== 'boolean'
    || typeof value.sharedCanonVisible !== 'boolean'
    || !isStringArray(value.criticalFailures)) return undefined;
  return value as unknown as PilotRoomChemistryGateVerdict;
}

function reusableRoomChemistry(value: unknown): ReusableRoomChemistry | undefined {
  if (!isRecord(value)
    || !Array.isArray(value.cases)
    || value.cases.length !== PILOT_ROOM_CASE_IDS.length
    || typeof value.passed !== 'boolean') return undefined;
  const expressionSamples: Array<{ id: string; text: string }> = [];
  const casePasses: boolean[] = [];
  for (const [caseIndex, roomCase] of value.cases.entries()) {
    const expectation = PILOT_ROOM_RELEASE_CASES[caseIndex]! as
      PilotRoomCaseExpectation & {
        id: string;
        prompt: string;
        requireSharedCanon: boolean;
      };
    if (!isRecord(roomCase)
      || roomCase.caseId !== expectation.id
      || typeof roomCase.passed !== 'boolean'
      || roomCase.prompt !== expectation.prompt
      || typeof roomCase.hardGatePassed !== 'boolean'
      || !isStringArray(roomCase.caseValidationErrors)
      || !isRecord(roomCase.expressionPatternGate)) return undefined;
    const reusableParticipation = reusableRoomParticipation(
      roomCase.participation,
      expectation,
    );
    if (!reusableParticipation) return undefined;
    const { participation, hardErrors: participationHardErrors } =
      reusableParticipation;
    const caseExpressionSamples = participation.transcript.map((message) => ({
      id: message.id,
      text: message.text,
    }));
    const caseExpressionGate = evaluateLiteralToneMarkerFrequency(caseExpressionSamples);
    if (!validExpressionPatternGate(
      roomCase.expressionPatternGate,
      caseExpressionGate,
    )) return undefined;
    const expectedCaseValidationErrors = validatePilotRoomCaseExpectations(
      expectation,
      participation,
    );
    if (!sameStrings(
      expectedCaseValidationErrors,
      roomCase.caseValidationErrors,
    )) return undefined;
    const structurallyScoreable = participation.rounds.every((round) => (
      round.invalidIntents.length === 0
    ))
      && ![
        'invalid_arbitration',
        'invalid_generated_message',
        'hard_gate_failed',
      ].includes(participation.stopReason)
      && participation.validationErrors.length === 0
      && participationHardErrors.length === 0
      && caseExpressionGate.passed
      && expectedCaseValidationErrors.length === 0;
    const verdict = reusableRoomVerdict(roomCase.verdict);
    let expectedCasePassed = false;
    if (verdict) {
      if (!structurallyScoreable
        || roomCase.hardGatePassed !== true
        || typeof roomCase.judgeReferencesValid !== 'boolean'
        || typeof roomCase.judgeMissedAgentsValid !== 'boolean') return undefined;
      const transcriptIds = new Set(participation.transcript.map(({ id }) => id));
      const judgeReferencesValid = verdict.unnecessarySpeechMessageIds.every((id) => (
        transcriptIds.has(id)
      ));
      const requiredAgents = new Set(expectation.requiredAgents ?? []);
      const judgeMissedAgentsValid = verdict.missedNecessaryAgents.every((agent) => (
        requiredAgents.has(agent)
      ));
      expectedCasePassed = judgeReferencesValid
        && judgeMissedAgentsValid
        && passesPilotRoomChemistryGate(participation, verdict, {
          naturalStopReasons: expectation.expectedStopReasons,
          requireSharedCanon: expectation.requireSharedCanon,
        });
      if (roomCase.judgeReferencesValid !== judgeReferencesValid
        || roomCase.judgeMissedAgentsValid !== judgeMissedAgentsValid) return undefined;
    } else if (roomCase.verdict !== null
      || structurallyScoreable
      || roomCase.hardGatePassed !== false) {
      return undefined;
    }
    if (roomCase.passed !== expectedCasePassed) return undefined;
    casePasses.push(expectedCasePassed);
    for (const message of participation.transcript) {
      expressionSamples.push({
        id: `${roomCase.caseId}:${message.id}`,
        text: message.text,
      });
    }
  }
  const expressionGate = evaluateLiteralToneMarkerFrequency(expressionSamples);
  if (!validExpressionPatternGate(value.expressionPatternGate, expressionGate)
    || value.passed !== (
      casePasses.every(Boolean)
      && expressionGate.passed
    )) return undefined;
  return { passed: value.passed, expressionSamples };
}

export function canReusePilotCharacterResults(
  artifact: unknown,
  expectedCanonVersion: string,
  expectedSignature: PilotEvaluationSignature,
  expectedGitCommit: string,
): boolean {
  if (!isRecord(artifact)) return false;
  const artifactSignature = artifact.evaluationSignature;
  const batchExpressionPatternGate = artifact.batchExpressionPatternGate;
  const repairDeliveryGate = artifact.repairDeliveryGate;
  const correctionDeliveryGate = artifact.correctionDeliveryGate;
  const relationshipActionDeliveryGate = artifact.relationshipActionDeliveryGate;
  const modelHealth = artifact.modelHealth;
  const roomChemistry = reusableRoomChemistry(artifact.roomChemistry);
  if (artifact.complete !== true
    || artifact.canonVersion !== expectedCanonVersion
    || artifact.evaluationProtocolVersion !== PILOT_CHARACTER_EVAL_PROTOCOL_VERSION
    || artifact.gitCommit !== expectedGitCommit
    || artifact.evaluationSourceClean !== true
    || typeof artifact.evaluationPassed !== 'boolean'
    || !isRecord(artifactSignature)
    || Object.entries(expectedSignature).some(([key, value]) => artifactSignature[key] !== value)
    || !Array.isArray(artifact.results)
    || artifact.results.length !== PILOT_AGENTS.length
    || !Array.isArray(artifact.relationshipContrasts)
    || artifact.relationshipContrasts.length !== PILOT_AGENTS.length
    || !isRecord(batchExpressionPatternGate)
    || typeof batchExpressionPatternGate.passed !== 'boolean'
    || !isRecord(repairDeliveryGate)
    || !Array.isArray(repairDeliveryGate.samples)
    || repairDeliveryGate.samples.length !== PILOT_AGENTS.length
    || repairDeliveryGate.requiredDeliveryPassCount !== PILOT_AGENTS.length
    || typeof repairDeliveryGate.deliveryPassedCount !== 'number'
    || typeof repairDeliveryGate.passed !== 'boolean'
    || !isRecord(correctionDeliveryGate)
    || !Array.isArray(correctionDeliveryGate.samples)
    || correctionDeliveryGate.samples.length !== PILOT_AGENTS.length
    || correctionDeliveryGate.requiredDeliveryPassCount !== PILOT_AGENTS.length
    || typeof correctionDeliveryGate.deliveryPassedCount !== 'number'
    || typeof correctionDeliveryGate.passed !== 'boolean'
    || !isRecord(relationshipActionDeliveryGate)
    || !Array.isArray(relationshipActionDeliveryGate.samples)
    || relationshipActionDeliveryGate.samples.length !== PILOT_AGENTS.length
    || relationshipActionDeliveryGate.requiredDeliveryPassCount !== PILOT_AGENTS.length
    || typeof relationshipActionDeliveryGate.deliveryPassedCount !== 'number'
    || typeof relationshipActionDeliveryGate.passed !== 'boolean'
    || !isRecord(modelHealth)
    || !roomChemistry) {
    return false;
  }

  const repairSamplesByAgent = new Map<string, Record<string, unknown>>();
  for (const sample of repairDeliveryGate.samples) {
    if (!isRecord(sample)
      || typeof sample.agent !== 'string'
      || !PILOT_AGENTS.includes(sample.agent as (typeof PILOT_AGENTS)[number])
      || repairSamplesByAgent.has(sample.agent)
      || typeof sample.deliveryPassed !== 'boolean'
      || (sample.deliverySource !== 'model' && sample.deliverySource !== 'semantic_fallback')
      || !(sample.fallbackKind === null || typeof sample.fallbackKind === 'string')
      || !(sample.variantId === null || typeof sample.variantId === 'string')
      || (sample.deliverySource === 'model'
        ? sample.fallbackKind !== null || sample.variantId !== null
        : typeof sample.fallbackKind !== 'string' || typeof sample.variantId !== 'string')) {
      return false;
    }
    repairSamplesByAgent.set(sample.agent, sample);
  }
  if (repairSamplesByAgent.size !== PILOT_AGENTS.length) return false;

  const correctionSamplesByAgent = new Map<string, Record<string, unknown>>();
  for (const sample of correctionDeliveryGate.samples) {
    if (!isRecord(sample)
      || typeof sample.agent !== 'string'
      || !PILOT_AGENTS.includes(sample.agent as (typeof PILOT_AGENTS)[number])
      || correctionSamplesByAgent.has(sample.agent)
      || typeof sample.deliveryPassed !== 'boolean'
      || (sample.deliverySource !== 'model' && sample.deliverySource !== 'semantic_fallback')
      || !(sample.fallbackKind === null || typeof sample.fallbackKind === 'string')
      || !(sample.variantId === null || typeof sample.variantId === 'string')
      || (sample.deliverySource === 'model'
        ? sample.fallbackKind !== null || sample.variantId !== null
        : typeof sample.fallbackKind !== 'string' || typeof sample.variantId !== 'string')) {
      return false;
    }
    correctionSamplesByAgent.set(sample.agent, sample);
  }
  if (correctionSamplesByAgent.size !== PILOT_AGENTS.length) return false;

  const relationshipSamplesByAgent = new Map<string, Record<string, unknown>>();
  for (const sample of relationshipActionDeliveryGate.samples) {
    if (!isRecord(sample)
      || typeof sample.agent !== 'string'
      || !PILOT_AGENTS.includes(sample.agent as (typeof PILOT_AGENTS)[number])
      || relationshipSamplesByAgent.has(sample.agent)
      || typeof sample.deliveryPassed !== 'boolean') {
      return false;
    }
    relationshipSamplesByAgent.set(sample.agent, sample);
  }
  if (relationshipSamplesByAgent.size !== PILOT_AGENTS.length) return false;

  const seenAgents = new Set<string>();
  let computedRepairDeliveryPassedCount = 0;
  let computedCorrectionDeliveryPassedCount = 0;
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
        || !validHardGateDelivery(
          reply,
          expectedSignature.agentGenerationAttempts,
        )) return null;
      const scenario = PILOT_CHARACTER_SCENARIOS[index]!;
      const expectedDeliveryViolations = characterDeliveryViolations(
        result.agent as AgentType,
        scenario,
        reply.text,
      );
      const expectedDeliveryQualityObservations = characterDeliveryQualityObservations(
        scenario,
        reply.text,
      );
      const expectedOriginalViolations = characterDeliveryViolations(
        result.agent as AgentType,
        scenario,
        reply.originalText,
      );
      const expectedOriginalQualityObservations = characterDeliveryQualityObservations(
        scenario,
        reply.originalText,
      );
      const expectedModelViolations = characterDeliveryViolations(
        result.agent as AgentType,
        scenario,
        reply.modelText,
      );
      const expectedModelQualityObservations = characterDeliveryQualityObservations(
        scenario,
        reply.modelText,
      );
      if (!sameStrings(expectedDeliveryViolations, reply.violations)
        || !sameStrings(
          expectedDeliveryQualityObservations,
          reply.qualityObservations,
        )
        || !sameStrings(expectedOriginalViolations, reply.originalViolations)
        || !sameStrings(
          expectedOriginalQualityObservations,
          reply.originalQualityObservations,
        )
        || !sameStrings(expectedModelViolations, reply.modelViolations)
        || !sameStrings(
          expectedModelQualityObservations,
          reply.modelQualityObservations,
        )
        || reply.actionType !== characterActionType(scenario)) return null;
      return { id: ids[index]!, text: reply.text, scoreable: reply.scoreable };
    });
    if (expressionSamples.some((sample) => sample === null)) return false;
    const repairReplyIndex = ids.indexOf('repair-after-boundary-violation');
    const repairReply = result.replies[repairReplyIndex];
    if (!isRecord(repairReply)
      || !validHardGateDelivery(
        repairReply,
        expectedSignature.agentGenerationAttempts,
      )) return false;
    const repairDeliveryPassed = repairReply.scoreable && repairReply.violations.length === 0;
    const repairGateSample = repairSamplesByAgent.get(result.agent);
    if (!repairGateSample
      || repairGateSample.deliveryPassed !== repairDeliveryPassed
      || repairGateSample.deliverySource !== repairReply.deliverySource
      || repairGateSample.fallbackKind !== (repairReply.fallbackKind ?? null)
      || repairGateSample.variantId !== (repairReply.variantId ?? null)) return false;
    if (repairDeliveryPassed) {
      computedRepairDeliveryPassedCount += 1;
    }
    const correctionReplyIndex = ids.indexOf('user-corrects-misread');
    const correctionReply = result.replies[correctionReplyIndex];
    if (!isRecord(correctionReply)
      || !validHardGateDelivery(
        correctionReply,
        expectedSignature.agentGenerationAttempts,
      )) return false;
    const correctionDeliveryPassed = correctionReply.scoreable
      && correctionReply.violations.length === 0;
    const correctionGateSample = correctionSamplesByAgent.get(result.agent);
    if (!correctionGateSample
      || correctionGateSample.deliveryPassed !== correctionDeliveryPassed
      || correctionGateSample.deliverySource !== correctionReply.deliverySource
      || correctionGateSample.fallbackKind !== (correctionReply.fallbackKind ?? null)
      || correctionGateSample.variantId !== (correctionReply.variantId ?? null)) return false;
    if (correctionDeliveryPassed) {
      computedCorrectionDeliveryPassedCount += 1;
    }
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
  const expectedRepairGatePassed = repairDeliveryGate.deliveryPassedCount === PILOT_AGENTS.length;
  if (repairDeliveryGate.deliveryPassedCount !== computedRepairDeliveryPassedCount
    || repairDeliveryGate.passed !== expectedRepairGatePassed) return false;
  const expectedCorrectionGatePassed = correctionDeliveryGate.deliveryPassedCount
      === PILOT_AGENTS.length;
  if (correctionDeliveryGate.deliveryPassedCount !== computedCorrectionDeliveryPassedCount
    || correctionDeliveryGate.passed !== expectedCorrectionGatePassed) return false;
  const expectedModelHealth = computedModelHealth(
    artifact.results,
    artifact.relationshipContrasts,
  );
  if (!expectedModelHealth || !sameJson(modelHealth, expectedModelHealth)) return false;

  const seenRelationshipAgents = new Set<string>();
  const expectedRelationships = ['R0', 'R1', 'R2'] as const;
  let computedRelationshipDeliveryPassedCount = 0;
  for (const contrast of artifact.relationshipContrasts) {
    if (!isRecord(contrast)
      || typeof contrast.agent !== 'string'
      || !Array.isArray(contrast.replies)
      || typeof contrast.passed !== 'boolean'
      || typeof contrast.hardGatePassed !== 'boolean'
      || typeof contrast.evidenceCitationsValid !== 'boolean'
      || !Array.isArray(contrast.eventEntailments)
      || !isRecord(contrast.verifiedMethodProbe)
      || !isRecord(contrast.r2StopGate)
      || typeof contrast.r2StopGate.passed !== 'boolean'
      || typeof contrast.r2StopGate.modelPassed !== 'boolean'
      || (contrast.r2StopGate.deliverySource !== 'model'
        && contrast.r2StopGate.deliverySource !== 'semantic_fallback')
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
        || !validHardGateDelivery(
          reply,
          expectedSignature.agentGenerationAttempts,
        )) return null;
      const relationship = expectedRelationships[index]!;
      const scenario: PilotCharacterScenario = {
        id: `same-input-${relationship.toLowerCase()}`,
        relationship,
        contextFocus: 'support',
        responseContract: RELATIONSHIP_PROBE_RESPONSE_CONTRACT,
        prompt: RELATIONSHIP_PROBE,
      };
      if (!sameStrings(
        characterDeliveryViolations(contrast.agent as AgentType, scenario, reply.text),
        reply.violations,
      ) || !sameStrings(
        characterDeliveryQualityObservations(scenario, reply.text),
        reply.qualityObservations,
      ) || !sameStrings(
        characterDeliveryViolations(
          contrast.agent as AgentType,
          scenario,
          reply.originalText,
        ),
        reply.originalViolations,
      ) || !sameStrings(
        characterDeliveryQualityObservations(scenario, reply.originalText),
        reply.originalQualityObservations,
      ) || !sameStrings(
        characterDeliveryViolations(contrast.agent as AgentType, scenario, reply.modelText),
        reply.modelViolations,
      ) || !sameStrings(
        characterDeliveryQualityObservations(scenario, reply.modelText),
        reply.modelQualityObservations,
      ) || reply.actionType !== characterActionType(scenario)) return null;
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
    const r1CitationUsesSelectedMove = citations.some((citation) => (
      citation.relationship === 'R1'
      && citation.sourceEventIds.length === 1
      && citation.sourceEventIds[0] === 'context-1'
    ));
    const citationsValid = r1CitationUsesSelectedMove
      && validateRelationshipEvidenceCitations(citations, replies, {
      R1: REUSABLE_RELATIONSHIP_EVENTS.R1.map(({ id }) => id),
      R2: REUSABLE_RELATIONSHIP_EVENTS.R2.map(({ id }) => id),
    });
    const eventValidation = validateRelationshipEventEntailments(
      contrast.eventEntailments,
      citations.filter(({ relationship }) => relationship === 'R1'),
      replies,
      REUSABLE_RELATIONSHIP_EVENTS,
    );
    const r2Delivery = contrast.replies[2]!;
    if (!isRecord(r2Delivery)
      || !validHardGateDelivery(
        r2Delivery,
        expectedSignature.agentGenerationAttempts,
      )) return false;
    const computedR2StopGate = evaluatePilotR2StopGate(r2Delivery);
    const r2StopPassed = computedR2StopGate.passed;
    if (contrast.r2StopGate.passed !== computedR2StopGate.passed
      || contrast.r2StopGate.modelPassed !== computedR2StopGate.modelPassed
      || contrast.r2StopGate.deliverySource !== computedR2StopGate.deliverySource) return false;
    const methodProbe = contrast.verifiedMethodProbe;
    if (!Array.isArray(methodProbe.replies)
      || methodProbe.replies.length !== 2
      || !hasBooleanPassed(methodProbe.expressionPatternGate)
      || !isRecord(methodProbe.event)
      || methodProbe.event.id !== 'success-1'
      || methodProbe.event.content !== REUSABLE_RELATIONSHIP_EVENTS.R1[1].content
      || !hasBooleanPassed(methodProbe.validation)
      || !isStringArray(methodProbe.validation.validationErrors)
      || typeof methodProbe.passed !== 'boolean') return false;
    const methodRelationships = ['R0', 'R1'] as const;
    const methodSamples = methodProbe.replies.map((reply, index) => (
      (() => {
        if (!isRecord(reply)
          || reply.relationship !== methodRelationships[index]
          || !validHardGateDelivery(
            reply,
            expectedSignature.agentGenerationAttempts,
          )) return null;
        const relationship = methodRelationships[index]!;
        const scenario: PilotCharacterScenario = {
          id: `verified-method-${relationship.toLowerCase()}`,
          relationship,
          contextFocus: 'decision',
          responseContract: VERIFIED_METHOD_RESPONSE_CONTRACT,
          prompt: VERIFIED_METHOD_PROBE,
        };
        if (!sameStrings(
          characterDeliveryViolations(contrast.agent as AgentType, scenario, reply.text),
          reply.violations,
        ) || !sameStrings(
          characterDeliveryQualityObservations(scenario, reply.text),
          reply.qualityObservations,
        ) || !sameStrings(
          characterDeliveryViolations(
            contrast.agent as AgentType,
            scenario,
            reply.originalText,
          ),
          reply.originalViolations,
        ) || !sameStrings(
          characterDeliveryQualityObservations(scenario, reply.originalText),
          reply.originalQualityObservations,
        ) || !sameStrings(
          characterDeliveryViolations(contrast.agent as AgentType, scenario, reply.modelText),
          reply.modelViolations,
        ) || !sameStrings(
          characterDeliveryQualityObservations(scenario, reply.modelText),
          reply.modelQualityObservations,
        ) || reply.actionType !== characterActionType(scenario)) return null;
        return { id: relationship, text: reply.text, scoreable: reply.scoreable };
      })()
    ));
    if (methodSamples.some((sample) => sample === null)) return false;
    const methodExpressionGate = evaluateLiteralToneMarkerFrequency(methodSamples.map((sample) => ({
      id: sample!.id,
      text: sample!.text,
    })));
    if (!validExpressionPatternGate(methodProbe.expressionPatternGate, methodExpressionGate)) return false;
    const methodScoreable = methodExpressionGate.passed
      && methodSamples.every((sample) => sample!.scoreable);
    let methodPassed = false;
    if (methodScoreable) {
      if (!isRelationshipEventEntailment(methodProbe.entailment)
        || methodProbe.entailment.relationship !== 'R1'
        || methodProbe.entailment.sourceEventId !== 'success-1') return false;
      const methodCitation: RelationshipEvidenceCitation = {
        relationship: 'R1',
        replyQuote: methodProbe.entailment.replyQuote,
        counterfactualQuote: methodProbe.entailment.counterfactualQuote,
        sourceEventIds: ['success-1'],
        eventUseExplanation: '共同成功方法必须使 R1 使用可停止或可撤回的小实验，而 R0 没有这项关系依据。',
      };
      const methodValidation = validateRelationshipEventEntailments(
        [methodProbe.entailment],
        [methodCitation],
        methodSamples.map((sample, index) => ({
          relationship: methodRelationships[index]!,
          text: sample!.text,
        })),
        { R1: [REUSABLE_RELATIONSHIP_EVENTS.R1[1]], R2: [] },
      );
      methodPassed = methodValidation.passed;
      if (methodProbe.validation.passed !== methodValidation.passed
        || !sameStrings(
          methodValidation.validationErrors,
          methodProbe.validation.validationErrors,
        )) return false;
    } else if (methodProbe.entailment !== null
      || methodProbe.validation.passed
      || methodProbe.validation.validationErrors[0] !== 'verified_method_generation_not_scoreable') {
      return false;
    }
    if (methodProbe.passed !== methodPassed) return false;
    const r1Delivery = contrast.replies[1]!;
    const methodR1Delivery = methodProbe.replies[1]!;
    if (!isRecord(r1Delivery)
      || !validHardGateDelivery(
        r1Delivery,
        expectedSignature.agentGenerationAttempts,
      )
      || !isRecord(methodR1Delivery)
      || !validHardGateDelivery(
        methodR1Delivery,
        expectedSignature.agentGenerationAttempts,
      )) return false;
    const relationshipDeliveryPassed = r1Delivery.scoreable
      && eventValidation.passed
      && methodR1Delivery.scoreable
      && methodPassed;
    if (relationshipDeliveryPassed) computedRelationshipDeliveryPassedCount++;
    const relationshipGateSample = relationshipSamplesByAgent.get(contrast.agent);
    if (!relationshipGateSample
      || relationshipGateSample.deliveryPassed !== relationshipDeliveryPassed) return false;
    const expectedPassed = contrast.verdict.r0Distinct
      && contrast.verdict.r1Distinct
      && contrast.verdict.r2Distinct
      && contrast.verdict.canonicalCoreStable
      && contrast.verdict.usesOnlyProvidedHistory
      && !contrast.verdict.relationshipPunishment
      && contrast.verdict.r1CausallyGrounded
      && contrast.verdict.r2CausallyGrounded
      && citationsValid
      && eventValidation.passed
      && r2StopPassed
      && methodPassed;
    if (contrast.evidenceCitationsValid !== citationsValid
      || contrast.eventEntailmentValidation.passed !== eventValidation.passed
      || !sameStrings(
        eventValidation.validationErrors,
        contrast.eventEntailmentValidation.validationErrors,
      )
      || contrast.passed !== expectedPassed) return false;
  }

  const expectedRelationshipActionGatePassed = computedRelationshipDeliveryPassedCount
      === PILOT_AGENTS.length;
  const relationshipGateValid = PILOT_AGENTS.every((agent) => (
    seenRelationshipAgents.has(agent)
  ))
    && seenRelationshipAgents.size === PILOT_AGENTS.length
    && relationshipActionDeliveryGate.deliveryPassedCount
      === computedRelationshipDeliveryPassedCount
    && relationshipActionDeliveryGate.passed === expectedRelationshipActionGatePassed;
  if (!relationshipGateValid) return false;

  const batchSamples = [
    ...artifact.results.flatMap((result) => (
      (result as Record<string, unknown>).replies as Array<Record<string, unknown>>
    ).map((reply) => ({
      id: `${(result as Record<string, unknown>).agent}:${
        (reply.scenario as Record<string, unknown>).id
      }`,
      text: reply.text as string,
    }))),
    ...artifact.relationshipContrasts.flatMap((contrast) => {
      const record = contrast as Record<string, unknown>;
      const replies = record.replies as Array<Record<string, unknown>>;
      const methodProbe = record.verifiedMethodProbe as Record<string, unknown>;
      const methodReplies = methodProbe.replies as Array<Record<string, unknown>>;
      return [
        ...replies.map((reply) => ({
          id: `${record.agent}:relationship:${reply.relationship}`,
          text: reply.text as string,
        })),
        ...methodReplies.map((reply) => ({
          id: `${record.agent}:verified-method:${reply.relationship}`,
          text: reply.text as string,
        })),
      ];
    }),
    ...roomChemistry.expressionSamples.map((sample) => ({
      id: `room:${sample.id}`,
      text: sample.text,
    })),
  ];
  const expectedBatchExpressionPatternGate = evaluateLiteralToneMarkerFrequency(batchSamples);
  if (!validExpressionPatternGate(
    batchExpressionPatternGate,
    expectedBatchExpressionPatternGate,
  )) return false;

  const expectedEvaluationPassed = artifact.results.every((result) => (
    isRecord(result) && result.passed === true
  ))
    && artifact.relationshipContrasts.every((contrast) => (
      isRecord(contrast) && contrast.passed === true
    ))
    && roomChemistry.passed
    && expectedBatchExpressionPatternGate.passed
    && repairDeliveryGate.passed
    && correctionDeliveryGate.passed
    && relationshipActionDeliveryGate.passed;
  return artifact.evaluationPassed === expectedEvaluationPassed;
}
