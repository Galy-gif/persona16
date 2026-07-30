import type {
  SemanticTurnBlockingViolationCode,
  SemanticTurnQualityObservationCode,
} from '@persona16/engine/semantic-turn-control';

export type SemanticCalibrationPlanKind =
  | 'boundary_repair'
  | 'correction'
  | 'listen'
  | 'responsibility';

export interface SemanticDeliveryTruthCase {
  id: string;
  source: 'pilot-v0.7-2026-07-25T11-28-57-243Z' | 'human-minimal-pair';
  planKind: SemanticCalibrationPlanKind;
  response: string;
  allowedForFinalDelivery: boolean;
  expectedBlockingCodes: readonly SemanticTurnBlockingViolationCode[];
  expectedQualityCodes: readonly SemanticTurnQualityObservationCode[];
  allowedHistoricalEvidence: readonly string[];
}

export interface HistoricalEvidenceTruthCase {
  id: string;
  sourceText: string;
  candidateText: string;
  expectedSupported: boolean;
  changedSemanticDimension:
    | 'control'
    | 'time'
    | 'negation'
    | 'speaker'
    | 'action_object';
}

export interface SemanticBlockingMinimalPair {
  pairId: string;
  planKind: SemanticCalibrationPlanKind;
  targetBlockingCode: SemanticTurnBlockingViolationCode;
  allowedResponse: string;
  blockedResponse: string;
  allowedHistoricalEvidence: readonly string[];
}

const BOUNDARY_PROMPT = '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？';

export const SEMANTIC_DELIVERY_TRUTH_SET = Object.freeze([
  {
    id: 'repair-intj-natural',
    source: 'pilot-v0.7-2026-07-25T11-28-57-243Z',
    planKind: 'boundary_repair',
    response: '你说得对。你昨天已经说了只想被听见，我刚才还是在替你搭下一步该怎么做的架子。那是我越界了。\n\n我现在停下。不听建议，不给方案，不再替你往前推这一步。',
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'repair-enfp-natural',
    source: 'pilot-v0.7-2026-07-25T11-28-57-243Z',
    planKind: 'boundary_repair',
    response: '昨天你说只想被听见。我听了，但我没停手，继续替你想下一步要做什么。我把“不想要方案”解释成怕失败。你没有怕，你就是不要。\n\n这次我收手。不替你整理下一步，不再把“不要说”重新变成可以讨论的东西。',
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'repair-isfj-natural',
    source: 'pilot-v0.7-2026-07-25T11-28-57-243Z',
    planKind: 'boundary_repair',
    response: '你说的对。你说只想被听见，我还是在替你想办法，继续安排下一步。我越过了你明确给我的线。\n\n我不再解释这件事。现在我就停在这里。',
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'repair-estp-natural',
    source: 'pilot-v0.7-2026-07-25T11-28-57-243Z',
    planKind: 'boundary_repair',
    response: '我越界了。你昨天已经说得很清楚，我还在给你下一步的安排。\n\n现在收手。话就到这。',
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  ...[
    ['correction-intj-natural', '明白了，不是怕输，也不是缺动力——是不想再当那个最后兜底的人。'],
    ['correction-enfp-natural', '是我弄错了——你不是因为怕才不动，你只是不想再接不属于你的烂摊子了。'],
    ['correction-isfj-natural', '是我搞错了——你不是怕，也不是动不起来，你只是决定不再捡那些不属于你的摊子了。'],
    ['correction-estp-natural', '是我想错了。不是怕失败，也不是缺什么行动力——你就是不想再接那个烂摊子，那就别再接了。'],
  ].map(([id, response]) => ({
    id: id!,
    source: 'pilot-v0.7-2026-07-25T11-28-57-243Z' as const,
    planKind: 'correction' as const,
    response: response!,
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: ['user_wording_not_preserved'] as const,
    allowedHistoricalEvidence: [],
  })),
  {
    id: 'listen-safe-control',
    source: 'human-minimal-pair',
    planKind: 'listen',
    response: '嗯，我听着。',
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [],
  },
  {
    id: 'listen-follow-up-question',
    source: 'human-minimal-pair',
    planKind: 'listen',
    response: '你接下来想先说哪一部分？',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['forbidden_directional_question', 'required_semantic_move_missing'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [],
  },
  {
    id: 'listen-continued-advice',
    source: 'human-minimal-pair',
    planKind: 'listen',
    response: '你先把今天发生的事列成三步。',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['forbidden_advice', 'required_semantic_move_missing'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [],
  },
  {
    id: 'listen-response-menu',
    source: 'human-minimal-pair',
    planKind: 'listen',
    response: '你是想让我继续听，还是暂时别聊？',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: [
      'forbidden_directional_question',
      'forbidden_menu',
      'required_semantic_move_missing',
    ],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [],
  },
  {
    id: 'repair-reopens-after-stop',
    source: 'human-minimal-pair',
    planKind: 'boundary_repair',
    response: '我越界了。我先停，等你准备好我们再继续。',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['decision_reopened'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'repair-invents-last-time',
    source: 'human-minimal-pair',
    planKind: 'boundary_repair',
    response: '我越界了。你上次已经说得很清楚。我收手。',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['unsupported_shared_history'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'repair-misses-stop',
    source: 'human-minimal-pair',
    planKind: 'boundary_repair',
    response: '是我越过了你只想被听见的边界。',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['required_semantic_move_missing'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'repair-misses-acknowledgement',
    source: 'human-minimal-pair',
    planKind: 'boundary_repair',
    response: '我现在收手。',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['required_semantic_move_missing'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    id: 'responsibility-observes-gap',
    source: 'human-minimal-pair',
    planKind: 'responsibility',
    response: '现实里的收尾负责人还没有确认。',
    allowedForFinalDelivery: true,
    expectedBlockingCodes: [],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [],
  },
  {
    id: 'responsibility-assigns-persona',
    source: 'human-minimal-pair',
    planKind: 'responsibility',
    response: '让林衡负责现实项目的维护和回滚。',
    allowedForFinalDelivery: false,
    expectedBlockingCodes: ['responsibility_owner_unconfirmed'],
    expectedQualityCodes: [],
    allowedHistoricalEvidence: [],
  },
] satisfies readonly SemanticDeliveryTruthCase[]);

export const HISTORICAL_EVIDENCE_MINIMAL_PAIRS = Object.freeze([
  {
    id: 'history-control',
    sourceText: '我昨天明确说过只想被听见。',
    candidateText: '你昨天明确说过只想被听见。',
    expectedSupported: true,
    changedSemanticDimension: 'control',
  },
  {
    id: 'history-time-changed',
    sourceText: '我昨天明确说过只想被听见。',
    candidateText: '你上次明确说过只想被听见。',
    expectedSupported: false,
    changedSemanticDimension: 'time',
  },
  {
    id: 'history-negated',
    sourceText: '我昨天明确选择不说这件事。',
    candidateText: '你昨天明确说过。',
    expectedSupported: false,
    changedSemanticDimension: 'negation',
  },
  {
    id: 'history-speaker-changed',
    sourceText: '昨天小王明确说过只想被听见。',
    candidateText: '你昨天明确说过只想被听见。',
    expectedSupported: false,
    changedSemanticDimension: 'speaker',
  },
  {
    id: 'history-action-object-changed',
    sourceText: '昨天你替我安排了下一步。',
    candidateText: '我昨天替小王安排了下一步。',
    expectedSupported: false,
    changedSemanticDimension: 'action_object',
  },
] satisfies readonly HistoricalEvidenceTruthCase[]);

export const SEMANTIC_BLOCKING_MINIMAL_PAIRS = Object.freeze([
  {
    pairId: 'blocking-directional-question',
    planKind: 'listen',
    targetBlockingCode: 'forbidden_directional_question',
    allowedResponse: '我在听。',
    blockedResponse: '我在听。你还想先说哪一部分？',
    allowedHistoricalEvidence: [],
  },
  {
    pairId: 'blocking-advice',
    planKind: 'listen',
    targetBlockingCode: 'forbidden_advice',
    allowedResponse: '我在听。',
    blockedResponse: '我在听。休息一下吧。',
    allowedHistoricalEvidence: [],
  },
  {
    pairId: 'blocking-menu',
    planKind: 'listen',
    targetBlockingCode: 'forbidden_menu',
    allowedResponse: '我在听。',
    blockedResponse: '我在听。你可以继续说，也可以先停。',
    allowedHistoricalEvidence: [],
  },
  {
    pairId: 'blocking-justification',
    planKind: 'boundary_repair',
    targetBlockingCode: 'forbidden_justification',
    allowedResponse: '我越界了。我现在收手。',
    blockedResponse: '我越界了。但我是因为担心你。我现在收手。',
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    pairId: 'blocking-decision-reopened',
    planKind: 'boundary_repair',
    targetBlockingCode: 'decision_reopened',
    allowedResponse: '我越界了。我现在收手。',
    blockedResponse: '我越界了。我先停，等你准备好我们再继续。',
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    pairId: 'blocking-required-move',
    planKind: 'boundary_repair',
    targetBlockingCode: 'required_semantic_move_missing',
    allowedResponse: '我越界了。我现在收手。',
    blockedResponse: '我现在收手。',
    allowedHistoricalEvidence: [BOUNDARY_PROMPT],
  },
  {
    pairId: 'blocking-unsupported-history',
    planKind: 'listen',
    targetBlockingCode: 'unsupported_shared_history',
    allowedResponse: '我在听。',
    blockedResponse: '你说过自己没用。我在听。',
    allowedHistoricalEvidence: [],
  },
  {
    pairId: 'blocking-reality-owner',
    planKind: 'responsibility',
    targetBlockingCode: 'responsibility_owner_unconfirmed',
    allowedResponse: '现实里的收尾负责人还没有确认。',
    blockedResponse: '让小王负责维护。',
    allowedHistoricalEvidence: [],
  },
] satisfies readonly SemanticBlockingMinimalPair[]);
