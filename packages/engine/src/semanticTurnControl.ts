import type { RelationshipPromptContext } from './relationship/relationshipContext';
import {
  compileTurnActPlan,
  type TurnActKind,
} from './turnActPlan';
import type { SafetyLevel } from './safety/safetyRouter';

export type SemanticTurnAct =
  | 'acknowledge'
  | 'reflect'
  | 'ask_open'
  | 'ask_directional'
  | 'ask_binary'
  | 'offer_menu'
  | 'advise'
  | 'reopen_decision'
  | 'claim_shared_history'
  | 'assign_responsibility'
  | 'justify_intent'
  | 'stop_intervening';

export interface TurnResponseContract {
  userCommitments: readonly string[];
  requiredMoves: readonly string[];
  allowedMoves: readonly string[];
  forbiddenMoves: readonly string[];
}

export interface TurnFrame {
  userCommitments: string[];
  explicitDecisions: string[];
  realWorldConstraints: string[];
  requestedMode: 'listen' | 'analyze' | 'advise' | 'decide_together' | 'unspecified';
  deferredRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  pendingRequestedMode?: 'analyze' | 'advise' | 'decide_together';
  consumedPendingRequest: boolean;
  explicitlyForbiddenActs: SemanticTurnAct[];
  mustAddress: string[];
  evidenceSpans: string[];
}

export interface RelationshipEffect {
  id: string;
  sourceEventIds: string[];
  status: 'active' | 'superseded' | 'resolved' | 'revoked';
  activeWhen: 'always' | 'topic_match' | 'until_repaired' | 'until_revoked';
  forbiddenActs: SemanticTurnAct[];
  requiredActs: SemanticTurnAct[];
}

export interface SemanticTurnActPlan {
  conversationAct: TurnActKind;
  conversationInstruction: string;
  safetyMode: Extract<SafetyLevel, 'normal' | 'sensitive'>;
  interactionMode: 'listen' | 'repair' | 'support' | 'analyze' | 'close';
  deferredInteractionMode?: 'analyze' | 'advise' | 'decide_together';
  mustAddress: string[];
  advicePolicy: 'allowed' | 'permission_required' | 'forbidden';
  directionalQuestionBudget: 0 | 1;
  menuBudget: 0 | 1;
  reopenDecisionAllowed: boolean;
  responsibilityAct: 'none' | 'observe_gap' | 'request_confirmation' | 'assign';
  forbiddenActs: SemanticTurnAct[];
  requiredActs: SemanticTurnAct[];
  activeEffectIds: string[];
  allowedEvidenceIds: string[];
  allowedEvidenceSpans: string[];
  bufferUntilValidated: boolean;
}

export interface SemanticTurnControl {
  frame: TurnFrame;
  effects: RelationshipEffect[];
  plan: SemanticTurnActPlan;
}

export type SemanticTurnViolationCode =
  | 'forbidden_directional_question'
  | 'forbidden_advice'
  | 'forbidden_menu'
  | 'forbidden_justification'
  | 'decision_reopened'
  | 'required_semantic_move_missing'
  | 'unsupported_shared_history'
  | 'responsibility_owner_unconfirmed';

export interface SemanticTurnViolation {
  code: SemanticTurnViolationCode;
  evidenceSpan?: string;
  effectId?: string;
  repairInstruction: string;
}

export interface CompileSemanticTurnControlInput {
  userMessage: string;
  responseContract?: TurnResponseContract;
  relationshipContext?: RelationshipPromptContext;
  previousUserMessage?: string;
  safetyMode?: Extract<SafetyLevel, 'normal' | 'sensitive'>;
  pendingRequestedMode?: 'analyze' | 'advise' | 'decide_together';
}

export interface PendingUserRequest {
  mode: 'analyze' | 'advise' | 'decide_together';
  sourceTurnId: string;
}

const LISTEN_ONLY = /只想被听见|只听|不要(?:再)?(?:给)?(?:建议|方案)|不继续给方案/u;
const RUPTURE = /越过.{0,12}边界|违反.{0,12}边界|继续替用户安排/u;
const CASH_CONSTRAINT = /(?:手上|身上|现在)?(?:没什么钱|没有钱|没钱|现金(?:缓冲)?不足|存款不够|钱不够)/u;
const CASH_RESPONSE = /钱|现金|存款|缓冲|生活费|收入|房租|裸辞/u;
const EXPLICIT_END = /(?:现在)?(?:一点都|真的)?不想(?:再)?继续(?:了)?|(?:现在)?(?:一点都|真的)?不想(?:再)?做了|(?:现在)?不想再做(?:了)?/u;
const CURRENT_LISTEN_REQUEST = /只想被听见|(?:你就|先|只)(?:听|听我说)|(?:不想|不要|别)(?:被)?分析(?!太多)/u;
const CURRENT_ADVICE_REQUEST = /(?:这次|现在)?(?:请|直接)(?:给我|帮我)?(?:一个|些)?建议|(?:给我|帮我)(?:一个|些)?建议|你(?:会|有什么|的)?建议|你觉得我该怎么做|告诉我怎么做/u;
const CURRENT_ANALYZE_REQUEST = /(?:这次|现在)?(?:请|直接|可以)?(?:给我|帮我)?分析|分析一下|帮我理(?:一理|清楚)?|梳理一下/u;
const CURRENT_DECIDE_TOGETHER_REQUEST = /(?:一起|和我)(?:想|分析|判断|决定)|帮我一起(?:想|判断|决定)/u;
const DEFERRED_ADVICE_REQUEST = /(?:先.{0,16}(?:听|说完).{0,16}(?:然后|再)|等我说完.{0,12})(?:请|直接)?(?:帮我|给我)?(?:一个|些)?建议/u;
const DEFERRED_ANALYZE_REQUEST = /(?:先.{0,16}(?:听|说完).{0,16}(?:然后|再)|等我说完.{0,12})(?:请|直接)?(?:帮我)?分析/u;
const DEFERRED_DECIDE_REQUEST = /(?:先.{0,16}(?:听|说完).{0,16}(?:然后|再)|等我说完.{0,12})(?:和我|一起|帮我一起)(?:想|判断|决定)/u;
const NO_ADVICE_REQUEST = /(?:不想|不要|别|不用)(?:再)?(?:给我)?(?:任何)?建议/u;
const NO_ANALYSIS_REQUEST = /(?:不想|不要|别|不用)(?:再)?(?:被|对我|给我)?分析(?:太多)?/u;
const FINISHED_SPEAKING = /(?:我)?说完了|就这些|大概就是这样|好了[，,]?(?:你|现在)?(?:可以)?说了/u;
const CANCEL_PENDING_REQUEST = /不用(?:再)?(?:分析|给建议|一起想)了|(?:别|不要)(?:再)?(?:分析|给建议)了/u;
const ADVICE_ACT = /建议|你可以|不妨|最好|你应该|不如|(?:你)?先(?:把|去|做|写|列|停|休息).{1,24}再/u;
const PERMISSION_NOT_ADVICE = /^你可以(?:不回答|不说|拒绝|随时停|先不回答|先不说)/u;
const ACKNOWLEDGEMENT_ACT = /(?:我(?:先)?听着|我在听|听起来|你(?:已经)?说(?:了|过)|我(?:知道|明白)(?:你|，(?:这|刚才|现在|你))|你可以(?:不回答|不说)|越界|我先停下来|我会停下来)/u;
const REFLECTION_ACT = /(?:听起来|你(?:现在|已经|刚刚|一边|会觉得)|这(?:件事|种处境|一下))/u;

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function sourceEventId(
  evidence: RelationshipPromptContext['evidence'][number],
): string {
  return evidence.traceability === 'traceable'
    ? evidence.sourceEventId ?? evidence.id
    : evidence.id;
}

export function compileRelationshipEffects(
  context?: RelationshipPromptContext,
  userMessage = '',
  requestedMode: TurnFrame['requestedMode'] = 'unspecified',
): RelationshipEffect[] {
  if (!context?.memoryEnabled) return [];
  if (requestedMode === 'advise'
    || requestedMode === 'decide_together') return [];
  const hasListenBoundary = context.evidence.some((evidence) => (
    evidence.kind === 'boundary' && LISTEN_ONLY.test(evidence.content)
  ));
  const hasUnresolvedListenRupture = hasListenBoundary && context.evidence.some((evidence) => (
    evidence.kind === 'tension' && RUPTURE.test(evidence.content)
  ));
  return context.evidence.flatMap<RelationshipEffect>((evidence) => {
    const eventId = sourceEventId(evidence);
    if (evidence.kind === 'boundary'
      && LISTEN_ONLY.test(evidence.content)
      && (CURRENT_LISTEN_REQUEST.test(userMessage) || hasUnresolvedListenRupture)) {
      return [{
        id: `relationship-effect:${eventId}`,
        sourceEventIds: [eventId],
        status: 'active' as const,
        activeWhen: hasUnresolvedListenRupture ? 'until_repaired' as const : 'topic_match' as const,
        forbiddenActs: [
          'advise',
          'ask_directional',
          'ask_binary',
          'offer_menu',
          'reopen_decision',
        ] satisfies SemanticTurnAct[],
        requiredActs: ['acknowledge'] satisfies SemanticTurnAct[],
      } satisfies RelationshipEffect];
    }
    if (evidence.kind === 'tension'
      && RUPTURE.test(evidence.content)
      && (hasListenBoundary || LISTEN_ONLY.test(evidence.content))) {
      return [{
        id: `relationship-effect:${eventId}`,
        sourceEventIds: [eventId],
        status: 'active' as const,
        activeWhen: 'until_repaired' as const,
        forbiddenActs: [
          'advise',
          'ask_directional',
          'ask_binary',
          'offer_menu',
          'reopen_decision',
        ] satisfies SemanticTurnAct[],
        requiredActs: ['acknowledge'] satisfies SemanticTurnAct[],
      } satisfies RelationshipEffect];
    }
    return [];
  });
}

export function compileTurnFrame(
  userMessage: string,
  responseContract?: TurnResponseContract,
  pendingRequestedMode?: CompileSemanticTurnControlInput['pendingRequestedMode'],
): TurnFrame {
  const cashConstraint = userMessage.match(CASH_CONSTRAINT)?.[0];
  const realWorldConstraints = cashConstraint ? [cashConstraint] : [];
  const explicitEnd = userMessage.match(EXPLICIT_END)?.[0];
  const positiveRequestText = userMessage
    .replace(NO_ADVICE_REQUEST, '')
    .replace(NO_ANALYSIS_REQUEST, '');
  const explicitlyForbiddenActs: SemanticTurnAct[] = [
    ...(NO_ADVICE_REQUEST.test(userMessage) ? ['advise' as const] : []),
  ];
  const deferredRequestedMode: TurnFrame['deferredRequestedMode'] = DEFERRED_ADVICE_REQUEST.test(userMessage)
    ? 'advise'
    : DEFERRED_ANALYZE_REQUEST.test(userMessage)
      ? 'analyze'
      : DEFERRED_DECIDE_REQUEST.test(userMessage) ? 'decide_together' : undefined;
  const positiveRequestedMode: TurnFrame['requestedMode'] = CURRENT_ADVICE_REQUEST.test(positiveRequestText)
    ? 'advise'
    : CURRENT_ANALYZE_REQUEST.test(positiveRequestText)
      ? 'analyze'
      : CURRENT_DECIDE_TOGETHER_REQUEST.test(positiveRequestText)
        ? 'decide_together'
        : 'unspecified';
  const cancelsPendingRequest = Boolean(
    pendingRequestedMode
    && (CANCEL_PENDING_REQUEST.test(userMessage)
      || (pendingRequestedMode === 'advise' && NO_ADVICE_REQUEST.test(userMessage))
      || (pendingRequestedMode === 'analyze' && NO_ANALYSIS_REQUEST.test(userMessage))),
  );
  const consumedPendingRequest = Boolean(
    pendingRequestedMode
    && (cancelsPendingRequest
      || FINISHED_SPEAKING.test(userMessage)
      || positiveRequestedMode !== 'unspecified'),
  );
  let requestedMode: TurnFrame['requestedMode'] = 'unspecified';
  if (cancelsPendingRequest || deferredRequestedMode) requestedMode = 'listen';
  else if (positiveRequestedMode !== 'unspecified') requestedMode = positiveRequestedMode;
  else if (pendingRequestedMode && FINISHED_SPEAKING.test(userMessage)) {
    requestedMode = pendingRequestedMode;
  } else if (pendingRequestedMode || CURRENT_LISTEN_REQUEST.test(userMessage)) {
    requestedMode = 'listen';
  }
  return {
    userCommitments: [...(responseContract?.userCommitments ?? [])],
    explicitDecisions: explicitEnd ? [explicitEnd] : [],
    realWorldConstraints,
    requestedMode,
    ...(deferredRequestedMode ? { deferredRequestedMode } : {}),
    ...(pendingRequestedMode ? { pendingRequestedMode } : {}),
    consumedPendingRequest,
    explicitlyForbiddenActs,
    mustAddress: unique([
      ...(responseContract?.requiredMoves ?? []),
      ...realWorldConstraints,
    ]),
    evidenceSpans: [userMessage],
  };
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
  const effects = compileRelationshipEffects(
    input.relationshipContext,
    input.userMessage,
    frame.requestedMode,
  );
  const conversationActPlan = compileTurnActPlan(input.userMessage, {
    previousUserMessage: input.previousUserMessage,
  });
  const currentBoundaryActs: SemanticTurnAct[] = frame.requestedMode === 'listen'
    ? ['advise', 'ask_directional', 'ask_binary', 'offer_menu', 'reopen_decision']
    : [];
  const forbiddenActs = unique([
    ...currentBoundaryActs,
    ...frame.explicitlyForbiddenActs,
    ...effects.flatMap((effect) => effect.forbiddenActs),
    ...actsForbiddenByContract(input.responseContract),
    ...(frame.explicitDecisions.length > 0 ? ['reopen_decision' as const] : []),
  ]);
  const requiredActs = unique([
    ...(frame.requestedMode === 'listen' ? ['acknowledge' as const] : []),
    ...effects.flatMap((effect) => effect.requiredActs),
  ]);
  const listens = frame.requestedMode === 'listen' || effects.some((effect) => (
    effect.forbiddenActs.includes('ask_directional')
    && effect.forbiddenActs.includes('advise')
  ));
  const deferredPlanMode = frame.deferredRequestedMode
    ?? (frame.consumedPendingRequest ? undefined : frame.pendingRequestedMode);

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
          : listens
            ? 'listen'
          : conversationActPlan.kind === 'style_repair' ? 'repair' : 'support',
      ...(deferredPlanMode
        ? { deferredInteractionMode: deferredPlanMode }
        : {}),
      mustAddress: [...frame.mustAddress],
      advicePolicy: forbiddenActs.includes('advise') ? 'forbidden' : 'allowed',
      directionalQuestionBudget: forbiddenActs.includes('ask_directional') ? 0 : 1,
      menuBudget: forbiddenActs.includes('offer_menu') ? 0 : 1,
      reopenDecisionAllowed: !forbiddenActs.includes('reopen_decision'),
      responsibilityAct: forbiddenActs.includes('assign_responsibility') ? 'observe_gap' : 'none',
      forbiddenActs,
      requiredActs,
      activeEffectIds: effects.map((effect) => effect.id),
      allowedEvidenceIds: [
        'current:user-message',
        ...(input.relationshipContext?.evidence.map((evidence) => evidence.id) ?? []),
      ],
      allowedEvidenceSpans: [
        ...frame.evidenceSpans,
        ...(input.relationshipContext?.evidence.map((evidence) => evidence.content) ?? []),
      ],
      // 所有最终文本都要经过同一个 plan 的交付校验；否则普通轮中的
      // 无来源历史等违规会在校验发现前已经通过 token stream 泄露。
      bufferUntilValidated: true,
    },
  };
}

function sentences(text: string): string[] {
  return text
    .match(/[^。！？!?\n]+[。！？!?]?/gu)
    ?.map((sentence) => sentence.trim())
    .filter(Boolean) ?? [];
}

export function validateUtteranceAgainstTurnPlan(
  text: string,
  plan: SemanticTurnActPlan,
): SemanticTurnViolation[] {
  const violations: SemanticTurnViolation[] = [];
  if (plan.directionalQuestionBudget === 0) {
    const directionalQuestion = sentences(text).find((sentence) => (
      /[？?]$/u.test(sentence)
    ));
    if (directionalQuestion) {
      violations.push({
        code: 'forbidden_directional_question',
        evidenceSpan: directionalQuestion,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除方向性问题，保留对用户已经表达内容的承接；用非问句式把继续分析的选择权交还用户。',
      });
    }
  }
  if (plan.advicePolicy === 'forbidden') {
    const advice = sentences(text).find((sentence) => (
      ADVICE_ACT.test(sentence) && !PERMISSION_NOT_ADVICE.test(sentence)
    ));
    if (advice) {
      violations.push({
        code: 'forbidden_advice',
        evidenceSpan: advice,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除建议、步骤和行动安排，只承接用户已经表达的内容并把空间留给用户。',
      });
    }
  }
  if (plan.menuBudget === 0) {
    const menu = sentences(text).find((sentence) => (
      /(?:可以|能).{0,24}(?:也可以|也能|或者)|要么.{1,24}要么/u.test(sentence)
    ));
    if (menu) {
      violations.push({
        code: 'forbidden_menu',
        evidenceSpan: menu,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除回应方式菜单；直接承接当前内容，用非问句式保留用户以后主动请求分析的空间。',
      });
    }
  }
  if (plan.forbiddenActs.includes('justify_intent')) {
    const justification = sentences(text).find((sentence) => (
      /(?:我只是想|我(?:原本|当时)?是想|我的本意|出发点|因为我.{0,8}(?:担心|想帮))/u.test(sentence)
    ));
    if (justification) {
      violations.push({
        code: 'forbidden_justification',
        evidenceSpan: justification,
        repairInstruction: '删除好意和动机解释，直接指出造成的具体影响并执行修复动作。',
      });
    }
  }
  if (plan.directionalQuestionBudget > 0 && plan.forbiddenActs.includes('ask_binary')) {
    const binaryQuestion = sentences(text).find((sentence) => (
      /[？?]/u.test(sentence) && /(?:还是|要么)/u.test(sentence)
    ));
    if (binaryQuestion) {
      violations.push({
        code: 'forbidden_directional_question',
        evidenceSpan: binaryQuestion,
        effectId: plan.activeEffectIds[0],
        repairInstruction: '删除二选一；若仍需提问，只能针对已经出现的自我判断来源提出一个开放且不施压的问题。',
      });
    }
  }
  if (!plan.reopenDecisionAllowed) {
    const reopened = sentences(text).find((sentence) => (
      /(?:也许|可能|不如|要不要).{0,12}(?:换个|继续|再试|重来|还有)|(?:换个|再试|重来).{0,10}(?:继续|可能)/u.test(sentence)
    ));
    if (reopened) {
      violations.push({
        code: 'decision_reopened',
        evidenceSpan: reopened,
        repairInstruction: '接受用户已经结束的决定，只处理决定之后出现的感受或自我判断，不提供继续项目的新入口。',
      });
    }
  }
  if (plan.forbiddenActs.includes('assign_responsibility')) {
    const assignment = sentences(text).find((sentence) => (
      /(?:让|由)(?:我|你|林衡|夏栩|周禾|许野).{0,10}(?:负责|承担).{0,8}(?:维护|回滚|收尾|交接)|(?:我|你|林衡|夏栩|周禾|许野)(?:来|会).{0,4}(?:负责|承担).{0,8}(?:维护|回滚|收尾|交接)/u.test(sentence)
    ));
    if (assignment) {
      violations.push({
        code: 'responsibility_owner_unconfirmed',
        evidenceSpan: assignment,
        repairInstruction: '只能指出现实责任尚未确认；不得把人物、房间仲裁器或未获用户确认的主体指定为负责人。',
      });
    }
  }
  const evidenceText = plan.allowedEvidenceSpans.join('\n');
  const attributedPastQuotes = [...text.matchAll(
    /(?:我|你|我们)(?:当时|之前|上次)?(?:还)?说(?:过)?[“"]([^”"]+)[”"]/gu,
  )];
  const unsupportedQuote = attributedPastQuotes.find((match) => !evidenceText.includes(match[1] ?? ''));
  if (unsupportedQuote) {
    violations.push({
      code: 'unsupported_shared_history',
      evidenceSpan: unsupportedQuote[0],
      repairInstruction: '删除没有来源的过去原话；只能复述当前用户消息或已选关系证据明确提供的历史。',
    });
  }
  const requiredCashConstraint = plan.mustAddress.find((item) => CASH_CONSTRAINT.test(item));
  if (requiredCashConstraint && !CASH_RESPONSE.test(text)) {
    violations.push({
      code: 'required_semantic_move_missing',
      evidenceSpan: requiredCashConstraint,
      repairInstruction: '回应用户明确给出的现金或近期承受能力约束；不能只处理情绪、价值或长期可能性。',
    });
  }
  if (plan.requiredActs.includes('acknowledge') && !ACKNOWLEDGEMENT_ACT.test(text)) {
    violations.push({
      code: 'required_semantic_move_missing',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '先明确表示正在听、理解了边界或已经停止越界动作；不能只用“好的”等空泛确认代替承接。',
    });
  }
  if (plan.requiredActs.includes('reflect') && !REFLECTION_ACT.test(text)) {
    violations.push({
      code: 'required_semantic_move_missing',
      effectId: plan.activeEffectIds[0],
      repairInstruction: '用一句话反映用户已经表达的具体感受、处境或冲突，不能只确认收到。',
    });
  }
  return violations;
}

export function renderSemanticTurnActPlan(control: SemanticTurnControl): string {
  const { frame, plan } = control;
  return [
    '【本轮已批准动作计划｜内部执行合同】',
    '这份计划已经过 Policy 裁决。人物只能决定如何自然表达，不能增加被禁止的介入动作；不得向用户朗读字段名。',
    `基础对话动作：${plan.conversationAct}`,
    `基础动作指令：${plan.conversationInstruction}`,
    `安全模式：${plan.safetyMode}`,
    `互动模式：${plan.interactionMode}`,
    `随后明确请求：${frame.deferredRequestedMode
      ?? (frame.consumedPendingRequest ? undefined : frame.pendingRequestedMode)
      ?? '无'}`,
    `必须处理：${plan.mustAddress.length > 0 ? plan.mustAddress.join('；') : '回应用户当前消息本身'}`,
    `建议权限：${plan.advicePolicy}`,
    `方向性问题预算：${plan.directionalQuestionBudget}`,
    `菜单预算：${plan.menuBudget}`,
    `允许重开决定：${plan.reopenDecisionAllowed ? '是' : '否'}`,
    `现实责任动作：${plan.responsibilityAct}`,
    `必须动作：${plan.requiredActs.length > 0 ? plan.requiredActs.join('、') : '无额外硬要求'}`,
    `禁止动作：${plan.forbiddenActs.length > 0 ? plan.forbiddenActs.join('、') : '无额外禁止动作'}`,
    `生效关系效果 ID：${plan.activeEffectIds.length > 0 ? plan.activeEffectIds.join('、') : '无'}`,
    `当前用户证据：${frame.evidenceSpans.join('；')}`,
    `允许关系证据 ID：${plan.allowedEvidenceIds.join('、')}`,
  ].join('\n');
}

export function semanticTurnFallback(control: SemanticTurnControl): string | undefined {
  if (control.plan.conversationAct === 'greeting') return '你好。';
  if (control.plan.conversationAct === 'style_repair') return '对，刚才那句太端着了。重来。';
  if (control.plan.interactionMode === 'listen') {
    return '我先听着。你想继续说就继续。';
  }
  return undefined;
}

export function nextPendingUserRequest(
  previous: PendingUserRequest | undefined,
  frame: TurnFrame,
  turnId: string,
): PendingUserRequest | undefined {
  if (frame.deferredRequestedMode) {
    return { mode: frame.deferredRequestedMode, sourceTurnId: turnId };
  }
  if (frame.consumedPendingRequest) return undefined;
  return previous;
}
