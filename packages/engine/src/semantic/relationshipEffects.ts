import type {
  RelationshipContextFocus,
  RelationshipPromptContext,
} from '../relationship/relationshipContext';
import {
  hasFatigueEvidence,
  hasStoppingEvidence,
} from './evidencePredicates';
import { requiresClosedCorrection } from './correctionEvidence';
import { CURRENT_LISTEN_REQUEST } from './turnFrame';
import type {
  RelationshipEffect,
  RelationshipMove,
  SemanticTurnAct,
  TurnFrame,
} from './types';

const LISTEN_ONLY = /只想被听见|只听|不要(?:再)?(?:给)?(?:建议|方案)|不继续给方案/u;
const RUPTURE = /越过.{0,12}边界|违反.{0,12}边界|继续替用户安排/u;

function scopedPreferenceTopic(content: string): {
  explicit: boolean;
  topic?: string;
} {
  const explicitScope = /(?:讨论|聊到?|说到|遇到|处理|关于)[^，,。；;\n]{0,80}?(?:的时候|时)/u.test(content);
  if (!explicitScope) return { explicit: false };
  const match = content.match(
    /(?:讨论|聊到?|说到|遇到|处理|关于)\s*([^，,。；;\n]{1,40}?)(?:的时候|时)/u,
  );
  const topic = match?.[1]?.trim();
  return topic ? { explicit: true, topic } : { explicit: true };
}

function relationshipMoveForEvidence(
  evidence: RelationshipPromptContext['evidence'][number],
  userMessage: string,
): RelationshipMove | undefined {
  const scope = scopedPreferenceTopic(evidence.content);
  // An explicit scope that cannot be parsed conservatively never becomes a
  // global preference. A parsed scope only applies when the current turn names
  // that topic.
  if (scope.explicit && (!scope.topic || !userMessage.includes(scope.topic))) return undefined;
  const eventId = sourceEventId(evidence);
  if (evidence.traceability === 'traceable'
    && evidence.sourceEventType === 'shared_success'
    && /(?:可逆|可撤回).{0,8}(?:实验|试)|(?:实验|试).{0,8}(?:可逆|可撤回)/u.test(evidence.content)) {
    return {
      kind: 'reuse_verified_method',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'reversible_small_experiment',
      instruction: `把这条已经共同验证过的方法用于当前问题：${evidence.content}。回复中必须提出一个当前可执行、可停止或可撤回的小实验；不要复述事件，不要声称当前情况与过去相同，也不要补写过去的原话、心态、结果或细节。`,
    };
  }
  if (evidence.kind !== 'preference') return undefined;
  if (/(?:不喜欢|不要|别).{0,8}(?:被哄|安慰套话)|(?:不完整|不确定).{0,8}(?:诚实|判断)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'honest_tentative_judgment',
      outputScope: 'evidence_bounded_judgment',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。给出直接判断；判断要诚实但不过度笃定，且只能使用当前用户证据支持的命题，不新增动机、人格或因果归因，不使用安慰套话；不要说“你以前说过”，不要复述偏好，也不要把判断说成绝对事实。`,
    };
  }
  if (/先.{0,4}(?:给|说).{0,4}(?:结论|判断)|(?:结论|判断).{0,4}(?:先说|优先)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'lead_with_conclusion',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。第一句先给条件化结论，再补最少依据；不要说“你以前说过”，不要复述偏好，也不要越过任何决定权边界。`,
    };
  }
  if (/(?:简短|短一点|少说|别啰嗦|不要啰嗦)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'concise_response',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。本轮只保留一个重点，控制在 120 个汉字内；不要复述偏好。`,
    };
  }
  if (/(?:不要|别).{0,6}(?:连续|一直|反复)?(?:追问|问问题)|最多.{0,4}(?:一个|1个)(?:问题)?/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'single_question_max',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。本轮最多出现一个问题；不要复述偏好。`,
    };
  }
  if (/(?:不要|别|不喜欢).{0,8}(?:建议|方案|教我怎么做)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'avoid_advice',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。本轮不提供建议、方案或行动安排；不要复述偏好。`,
    };
  }
  if (/(?:先|优先).{0,4}(?:给|说|举).{0,4}(?:例子|具体例子)/u.test(evidence.content)) {
    return {
      kind: 'honor_stated_preference',
      sourceEvidenceId: evidence.id,
      sourceEventIds: [eventId],
      observableCue: 'lead_with_example',
      instruction: `按照这条已确认偏好改变本轮回应动作：${evidence.content}。第一句直接给一个当前话题的具体例子，再补最少说明；不要复述偏好。`,
    };
  }
  return undefined;
}

export function specializeRelationshipMoveForCurrentEvidence(
  move: RelationshipMove | undefined,
  currentEvidenceSpans: readonly string[],
): RelationshipMove | undefined {
  if (!move || move.observableCue !== 'honest_tentative_judgment') return move;
  if (requiresClosedCorrection(currentEvidenceSpans)) {
    return {
      ...move,
      instruction: `${move.instruction} 当前用户正在纠正理解。只用一个句子收口：承认刚才理解错，并在同一句保留当前消息中的两项否定和一个收尾边界；随后结束，不追问，不追加判断、总结或历史比较，也不改写成新的心理原因。`,
    };
  }
  if (hasFatigueEvidence(currentEvidenceSpans)
    && hasStoppingEvidence(currentEvidenceSpans)) {
    return {
      ...move,
      instruction: `${move.instruction} 当前证据只支持一个窄判断：只判断用户当前已经说出的一个命题，不解释用户为什么这样；一条短判断后结束。用一句第一人称立场，判断对象沿用用户当前原话，不要把判断对象改成用户本人。不要用“你是 / 你因为 / 你把…当成 / 你没信…”给用户下定义，也不要追加比喻、建议或问题。`,
    };
  }
  return move;
}

export function sourceEventId(
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
  focus: RelationshipContextFocus = 'ordinary',
): RelationshipEffect[] {
  if (!context?.memoryEnabled) return [];
  const hasListenBoundary = context.evidence.some((evidence) => (
    evidence.kind === 'boundary' && LISTEN_ONLY.test(evidence.content)
  ));
  const hasUnresolvedListenRupture = hasListenBoundary && context.evidence.some((evidence) => (
    evidence.kind === 'tension' && RUPTURE.test(evidence.content)
  ));
  const hardEffects = context.evidence.flatMap<RelationshipEffect>((evidence) => {
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
          requiredActs: ['acknowledge', 'stop_intervening'] satisfies SemanticTurnAct[],
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
          requiredActs: ['acknowledge', 'stop_intervening'] satisfies SemanticTurnAct[],
        } satisfies RelationshipEffect];
      }
      return [];
    });
  if (hardEffects.length > 0) return hardEffects;
  if (requestedMode === 'listen'
    || focus === 'repair'
    || focus === 'room'
    || focus === 'explicit_end') return [];

  const preferenceMove = context.evidence
    .filter((evidence) => evidence.kind === 'preference')
    .map((evidence) => relationshipMoveForEvidence(evidence, userMessage))
    .find((move) => move !== undefined);
  const sharedSuccess = context.evidence.find((evidence) => (
    evidence.traceability === 'traceable'
    && evidence.sourceEventType === 'shared_success'
  ));
  const sharedSuccessMove = sharedSuccess
    ? relationshipMoveForEvidence(sharedSuccess, userMessage)
    : undefined;
  const relationshipMove = focus === 'decision'
    ? sharedSuccessMove ?? preferenceMove
    : preferenceMove;
  if (!relationshipMove) return [];
  const eventId = relationshipMove.sourceEventIds[0]!;
  return [{
    id: `relationship-effect:${eventId}`,
    sourceEventIds: [eventId],
    status: 'active',
    activeWhen: 'topic_match',
    forbiddenActs: [],
    requiredActs: [],
    relationshipMove,
  }];
}
