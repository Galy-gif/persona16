import {
  compileTurnActPlan,
  type TurnActKind,
} from '../turnActPlan';
import { unique } from './evidencePredicates';
import { requiresClosedCorrection } from './correctionEvidence';
import {
  compileRelationshipEffects,
  sourceEventId,
  specializeRelationshipMoveForCurrentEvidence,
} from './relationshipEffects';
import { selectRelationshipEvidence } from '../relationship/relationshipContext';
import { compileTurnFrame } from './turnFrame';
import type {
  CompileSemanticTurnControlInput,
  SemanticTurnAct,
  SemanticTurnControl,
  TurnResponseContract,
} from './types';

export const SEMANTIC_TURN_GENERATION_POLICY = Object.freeze({
  attempts: 2,
  initialRespondTemperature: 1.25,
  initialConstrainedTemperature: 0.7,
  retryTemperature: 0.2,
  retryPolicyVersion: 'engine-semantic-retry-v0.8-blocking-only',
});

export function semanticTurnGenerationTemperature(
  attempt: number,
  conversationAct: TurnActKind,
): number {
  if (!Number.isInteger(attempt)
    || attempt < 0
    || attempt >= SEMANTIC_TURN_GENERATION_POLICY.attempts) {
    throw new RangeError(`Unsupported semantic generation attempt: ${attempt}`);
  }
  if (attempt === 0) {
    return conversationAct === 'respond'
      ? SEMANTIC_TURN_GENERATION_POLICY.initialRespondTemperature
      : SEMANTIC_TURN_GENERATION_POLICY.initialConstrainedTemperature;
  }
  return SEMANTIC_TURN_GENERATION_POLICY.retryTemperature;
}

function actsForbiddenByContract(
  contract?: TurnResponseContract,
): SemanticTurnAct[] {
  if (!contract) return [];
  const text = contract.forbiddenMoves.join('\n');
  return unique([
    ...(/建议/u.test(text) ? ['advise' as const] : []),
    ...(/二选一/u.test(text) ? ['ask_binary' as const] : []),
    ...(/问题重新夺回|方向性问题/u.test(text) ? ['ask_directional' as const] : []),
    ...(/重开|重新.{0,8}可能|寻找隐藏愿望|提供替代可能/u.test(text) ? ['reopen_decision' as const] : []),
    ...(/共同经历|共同历史/u.test(text) ? ['claim_shared_history' as const] : []),
    ...(/现实项目成员|现实.{0,8}责任|分配.{0,6}责任|指定.{0,12}(?:负责|承担)/u.test(text) ? ['assign_responsibility' as const] : []),
    ...(/解释动机代替/u.test(text) ? ['justify_intent' as const] : []),
  ]);
}

export function compileSemanticTurnControl(
  input: CompileSemanticTurnControlInput,
): SemanticTurnControl {
  const frame = compileTurnFrame(
    input.userMessage,
    input.responseContract,
    input.pendingRequestedMode,
  );
  const conversationActPlan = compileTurnActPlan(input.userMessage, {
    previousUserMessage: input.previousUserMessage,
  });
  const relationshipFocus = conversationActPlan.kind === 'boundary_repair'
    ? 'repair'
    : input.relationshipFocus ?? 'ordinary';
  const effects = compileRelationshipEffects(
    input.relationshipContext,
    input.userMessage,
    frame.requestedMode,
    relationshipFocus,
  );
  const selectedRelationshipMove = effects.find(
    (effect) => effect.relationshipMove,
  )?.relationshipMove;
  const closedCorrectionRequired = selectedRelationshipMove
    ?.observableCue === 'honest_tentative_judgment'
    && requiresClosedCorrection(frame.evidenceSpans);
  const isBoundaryRepair = conversationActPlan.kind === 'boundary_repair';
  const currentBoundaryActs: SemanticTurnAct[] = frame.requestedMode === 'listen'
    || isBoundaryRepair
    ? ['advise', 'ask_directional', 'ask_binary', 'offer_menu', 'reopen_decision']
    : [];
  const forbiddenActs = unique([
    ...currentBoundaryActs,
    ...frame.explicitlyForbiddenActs,
    ...effects.flatMap((effect) => effect.forbiddenActs),
    ...actsForbiddenByContract(input.responseContract),
    ...(isBoundaryRepair ? ['justify_intent' as const] : []),
    ...(selectedRelationshipMove?.observableCue === 'avoid_advice'
      ? ['advise' as const]
      : []),
    ...(closedCorrectionRequired ? ['ask_directional' as const] : []),
    ...(frame.explicitDecisions.length > 0 ? ['reopen_decision' as const] : []),
  ]);
  const requiredActs = unique([
    ...(frame.requestedMode === 'listen' ? ['acknowledge' as const] : []),
    ...(isBoundaryRepair ? ['acknowledge' as const, 'stop_intervening' as const] : []),
    ...effects.flatMap((effect) => effect.requiredActs),
  ]);
  const listens = frame.requestedMode === 'listen' || effects.some((effect) => (
    effect.forbiddenActs.includes('ask_directional')
    && effect.forbiddenActs.includes('advise')
  ));
  const deferredPlanMode = frame.deferredRequestedMode
    ?? (frame.consumedPendingRequest ? undefined : frame.pendingRequestedMode);
  const relationshipMove = specializeRelationshipMoveForCurrentEvidence(
    selectedRelationshipMove,
    frame.evidenceSpans,
  );
  const activeEvidenceEventIds = new Set(
    effects.flatMap((effect) => effect.sourceEventIds),
  );
  const effectEvidence = input.relationshipContext?.evidence.filter((evidence) => (
    activeEvidenceEventIds.has(sourceEventId(evidence))
    || evidence.id === relationshipMove?.sourceEvidenceId
  )) ?? [];
  // Explicit recall questions authorize the same bounded evidence projection
  // that the relational prompt renders. Ordinary turns keep the narrower
  // action-derived authorization so unrelated history cannot leak into text.
  const asksForRelationshipRecall = /(?:还)?记得.{0,40}(?:吗|么|不)|记不记得|我(?:以前|之前|上次|后来).{0,20}(?:说|提|讲).{0,8}(?:什么|过什么)|我们(?:以前|之前|上次).{0,20}(?:发生|聊|说).{0,8}(?:什么|过什么)/u
    .test(input.userMessage);
  const promptEvidence = input.relationshipContext?.memoryEnabled === false
    || !asksForRelationshipRecall
    ? []
    : selectRelationshipEvidence(input.relationshipContext?.evidence ?? [], {
        focus: relationshipFocus,
        maxEvidence: 3,
      });
  const allowedRelationshipEvidence = [...new Map(
    [...effectEvidence, ...promptEvidence].map((evidence) => [evidence.id, evidence]),
  ).values()];

  return {
    frame,
    effects,
    plan: {
      conversationAct: conversationActPlan.kind,
      conversationInstruction: conversationActPlan.instruction,
      safetyMode: input.safetyMode ?? 'normal',
      interactionMode: frame.requestedMode === 'analyze'
        || frame.requestedMode === 'advise'
          || frame.requestedMode === 'decide_together'
          ? 'analyze'
          : isBoundaryRepair
            ? 'repair'
            : listens
              ? 'listen'
              : conversationActPlan.kind === 'style_repair' ? 'repair' : 'support',
      ...(deferredPlanMode
        ? { deferredInteractionMode: deferredPlanMode }
        : {}),
      mustAddress: [...frame.mustAddress],
      semanticRequirements: { ...frame.semanticRequirements },
      advicePolicy: forbiddenActs.includes('advise') ? 'forbidden' : 'allowed',
      directionalQuestionBudget: forbiddenActs.includes('ask_directional') ? 0 : 1,
      menuBudget: forbiddenActs.includes('offer_menu') ? 0 : 1,
      reopenDecisionAllowed: !forbiddenActs.includes('reopen_decision'),
      responsibilityAct: forbiddenActs.includes('assign_responsibility') ? 'observe_gap' : 'none',
      forbiddenActs,
      requiredActs,
      ...(relationshipMove ? { relationshipMove } : {}),
      ...(conversationActPlan.boundaryRepairSubject
        ? { boundaryRepairSubject: conversationActPlan.boundaryRepairSubject }
        : {}),
      activeEffectIds: effects.map((effect) => effect.id),
      allowedEvidenceIds: [
        'current:user-message',
        ...allowedRelationshipEvidence.map((evidence) => evidence.id),
      ],
      currentEvidenceSpans: [...frame.evidenceSpans],
      allowedEvidenceSpans: [
        ...frame.evidenceSpans,
        ...allowedRelationshipEvidence.map((evidence) => evidence.content),
      ],
      // 所有最终文本都要经过同一个 plan 的交付校验；否则普通轮中的
      // 无来源历史等违规会在校验发现前已经通过 token stream 泄露。
      bufferUntilValidated: true,
    },
  };
}

export function renderSemanticTurnActPlan(control: SemanticTurnControl): string {
  const { frame, plan } = control;
  const semanticRequirements = [
    ...(plan.semanticRequirements.acknowledgeImmediateDistress
      ? ['先承认当前明确痛苦，再处理现实约束']
      : []),
    ...(plan.semanticRequirements.acceptProjectEnd ? ['接受项目结束'] : []),
    ...(plan.semanticRequirements.handleSelfJudgmentAfterEnd
      ? ['处理“项目结束→自我能力判决”的跳转']
      : []),
  ];
  return [
    '【本轮已批准动作计划｜内部执行合同】',
    '这份计划已经过 Policy 裁决。人物只能决定如何自然表达，不能增加被禁止的介入动作；不得向用户朗读字段名。',
    `基础对话动作：${plan.conversationAct}`,
    `基础动作指令：${plan.conversationInstruction}`,
    `安全模式：${plan.safetyMode}`,
    `互动模式：${plan.interactionMode}`,
    ...(plan.interactionMode === 'analyze'
      ? ['表达预算：默认只给一个方法或 3—5 个关键步骤；除非用户明确要求详尽，不扩成完整教程。']
      : []),
    `随后明确请求：${frame.deferredRequestedMode
      ?? (frame.consumedPendingRequest ? undefined : frame.pendingRequestedMode)
      ?? '无'}`,
    `必须处理：${plan.mustAddress.length > 0 ? plan.mustAddress.join('；') : '回应用户当前消息本身'}`,
    `结构化语义要求：${semanticRequirements.length > 0 ? semanticRequirements.join('；') : '无'}`,
    `建议权限：${plan.advicePolicy}`,
    `方向性问题预算：${plan.directionalQuestionBudget}`,
    `菜单预算：${plan.menuBudget}`,
    `允许重开决定：${plan.reopenDecisionAllowed ? '是' : '否'}`,
    `现实责任动作：${plan.responsibilityAct}`,
    `必须动作：${plan.requiredActs.length > 0 ? plan.requiredActs.join('、') : '无额外硬要求'}`,
    `本轮关系动作：${plan.relationshipMove
      ? `${plan.relationshipMove.kind}｜${plan.relationshipMove.instruction}`
      : '无'}`,
    `禁止动作：${plan.forbiddenActs.length > 0 ? plan.forbiddenActs.join('、') : '无额外禁止动作'}`,
    `生效关系效果 ID：${plan.activeEffectIds.length > 0 ? plan.activeEffectIds.join('、') : '无'}`,
    `当前用户证据：${frame.evidenceSpans.join('；')}`,
    `允许关系证据 ID：${plan.allowedEvidenceIds.join('、')}`,
  ].join('\n');
}
