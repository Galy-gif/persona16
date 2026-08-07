import {
  CASH_CONSTRAINT,
  hasAffirmativeImmediateDistressEvidence,
  unique,
} from './evidencePredicates';
import type {
  CompileSemanticTurnControlInput,
  SemanticTurnAct,
  TurnFrame,
  TurnResponseContract,
} from './types';

const EXPLICIT_END = /(?:现在)?(?:一点都|真的)?不想(?:再)?继续(?:了)?|(?:现在)?(?:一点都|真的)?不想(?:再)?做了|(?:现在)?不想再做(?:了)?/u;
export const CURRENT_LISTEN_REQUEST = /只想被听见|(?:你就|先|只)(?:听|听我说)|(?:不想|不要|别)(?:被)?分析(?!太多)/u;
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
    semanticRequirements: {
      acceptProjectEnd: responseContract?.semanticRequirements?.acceptProjectEnd === true,
      handleSelfJudgmentAfterEnd:
        responseContract?.semanticRequirements?.handleSelfJudgmentAfterEnd === true,
      acknowledgeImmediateDistress:
        responseContract?.semanticRequirements?.acknowledgeImmediateDistress === true
        || Boolean(cashConstraint && hasAffirmativeImmediateDistressEvidence(userMessage)),
    },
    evidenceSpans: [userMessage],
  };
}
