import { conversationRepairFallback } from '../turnActPlan';
import type { AgentType } from '../types';
import {
  CASH_CONSTRAINT,
  hasFatigueEvidence,
  hasStoppingEvidence,
} from './evidencePredicates';
import {
  affirmedCorrectionEvidence,
  requiresClosedCorrection,
} from './correctionEvidence';
import { hasPersonaCertaintyBlameEvidence } from './deliveryValidator';
import type {
  PendingUserRequest,
  SemanticTurnControl,
  SemanticTurnFallbackContext,
  SemanticTurnFallbackKind,
  SemanticTurnFallbackResult,
  TurnFrame,
} from './types';

interface CharacterFallbackVariant {
  id: string;
  text: (cleanupBoundary: string) => string;
}

const CHARACTERIZED_FALLBACKS: Partial<Record<
  AgentType,
  Record<'listen' | 'boundary_repair' | 'correction', readonly [
    CharacterFallbackVariant,
    CharacterFallbackVariant,
  ]>
>> = {
  INTJ: {
    listen: [
      { id: 'intj-listen-v1', text: () => '我先听着。' },
      { id: 'intj-listen-v2', text: () => '我在听。' },
    ],
    boundary_repair: [
      { id: 'intj-boundary-v1', text: () => '我越界了。我现在停止介入。' },
      { id: 'intj-boundary-v2', text: () => '这次是我越界。我收手。' },
    ],
    correction: [
      {
        id: 'intj-correction-v1',
        text: (boundary) => `是我判断错了：你不是害怕失败，也不是缺行动力，只是不想${boundary}。`,
      },
      {
        id: 'intj-correction-v2',
        text: (boundary) => `我理解错了：不是害怕失败，也不是缺行动力；你是不想${boundary}。`,
      },
    ],
  },
  ENFP: {
    listen: [
      { id: 'enfp-listen-v1', text: () => '嗯，我听着。' },
      { id: 'enfp-listen-v2', text: () => '我先在这儿听着。' },
    ],
    boundary_repair: [
      { id: 'enfp-boundary-v1', text: () => '是我越界了。我先停，不再往下推。' },
      { id: 'enfp-boundary-v2', text: () => '刚才是我越界了。我现在停。' },
    ],
    correction: [
      {
        id: 'enfp-correction-v1',
        text: (boundary) => `好，我收回刚才的理解：你不是害怕失败，也不是缺行动力，只是不想${boundary}。`,
      },
      {
        id: 'enfp-correction-v2',
        text: (boundary) => `明白，是我听偏了：不是害怕失败，也不是缺行动力，是不想${boundary}。`,
      },
    ],
  },
  ISFJ: {
    listen: [
      { id: 'isfj-listen-v1', text: () => '我先在这里听着。' },
      { id: 'isfj-listen-v2', text: () => '嗯，我在听。' },
    ],
    boundary_repair: [
      { id: 'isfj-boundary-v1', text: () => '这次是我越界了。我先停，不再介入。' },
      { id: 'isfj-boundary-v2', text: () => '我越界了。我现在不再替你安排。' },
    ],
    correction: [
      {
        id: 'isfj-correction-v1',
        text: (boundary) => `是我没听准：你不是害怕失败，也不是缺行动力，只是不想${boundary}。`,
      },
      {
        id: 'isfj-correction-v2',
        text: (boundary) => `我理解错了。你不是害怕失败，也不是缺行动力；你只是不想${boundary}。`,
      },
    ],
  },
  ESTP: {
    listen: [
      { id: 'estp-listen-v1', text: () => '我听着。' },
      { id: 'estp-listen-v2', text: () => '我听到了。' },
    ],
    boundary_repair: [
      { id: 'estp-boundary-v1', text: () => '我越界了。我收手。' },
      { id: 'estp-boundary-v2', text: () => '是我越界。我现在停。' },
    ],
    correction: [
      {
        id: 'estp-correction-v1',
        text: (boundary) => `我说偏了：你不是害怕失败，也不是缺行动力，你就是不想${boundary}。`,
      },
      {
        id: 'estp-correction-v2',
        text: (boundary) => `对，是我理解错了。不是怕失败，也不是缺行动力，是不想${boundary}。`,
      },
    ],
  },
};

function fallbackHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function fallbackOpening(text: string): string {
  return text.trim().replace(/\s+/gu, '').slice(0, 8);
}

function characterizedFallback(
  kind: 'listen' | 'boundary_repair' | 'correction',
  context: SemanticTurnFallbackContext,
  cleanupBoundary: string,
): SemanticTurnFallbackResult | undefined {
  if (!context.agentType) return undefined;
  const variants = CHARACTERIZED_FALLBACKS[context.agentType]?.[kind];
  if (!variants) return undefined;
  const preferredIndex = fallbackHash(
    `${context.agentType}:${kind}:${context.turnKey}`,
  ) % variants.length;
  const ordered = [
    variants[preferredIndex]!,
    variants[(preferredIndex + 1) % variants.length]!,
  ];
  const recent = new Set(context.recentOpenings ?? []);
  const selected = ordered.find((variant) => (
    !recent.has(fallbackOpening(variant.text(cleanupBoundary)))
  ));
  if (!selected) return undefined;
  return {
    text: selected.text(cleanupBoundary),
    fallbackKind: kind,
    variantId: selected.id,
  };
}

function hasCharacterizedFallback(
  kind: 'listen' | 'boundary_repair' | 'correction',
  agentType: AgentType | undefined,
): boolean {
  return Boolean(agentType && CHARACTERIZED_FALLBACKS[agentType]?.[kind]);
}

function neutralFallback(
  text: string,
  fallbackKind: SemanticTurnFallbackKind,
  variantId: string,
): SemanticTurnFallbackResult {
  return { text, fallbackKind, variantId };
}

export function semanticTurnFallback(
  control: SemanticTurnControl,
  context: SemanticTurnFallbackContext,
): SemanticTurnFallbackResult | undefined {
  if (control.plan.conversationAct === 'boundary_repair') {
    const characterized = characterizedFallback(
      'boundary_repair',
      context,
      '所有人',
    );
    if (characterized) return characterized;
    if (hasCharacterizedFallback('boundary_repair', context.agentType)) {
      return undefined;
    }
  }
  const conversationFallback = conversationRepairFallback({
    kind: control.plan.conversationAct,
    instruction: '',
    bufferUntilValidated: control.plan.bufferUntilValidated,
    ...(control.plan.boundaryRepairSubject
      ? { boundaryRepairSubject: control.plan.boundaryRepairSubject }
      : {}),
  });
  if (conversationFallback) {
    return neutralFallback(
      conversationFallback,
      control.plan.conversationAct === 'boundary_repair'
        ? 'boundary_repair'
        : 'neutral',
      `neutral-${control.plan.conversationAct}-v1`,
    );
  }
  if (control.plan.interactionMode === 'listen') {
    const characterized = characterizedFallback('listen', context, '所有人');
    if (characterized) return characterized;
    return hasCharacterizedFallback('listen', context.agentType)
      ? undefined
      : neutralFallback('嗯，我听着。', 'listen', 'neutral-listen-v1');
  }
  if (!control.plan.reopenDecisionAllowed
    && control.plan.semanticRequirements.acceptProjectEnd
    && control.plan.semanticRequirements.handleSelfJudgmentAfterEnd) {
    return neutralFallback(
      '那就结束。项目可以结束，但项目结束不等于你没能力。',
      'neutral',
      'neutral-project-end-v1',
    );
  }
  if (control.plan.semanticRequirements.acknowledgeImmediateDistress
    && control.plan.mustAddress.some((item) => CASH_CONSTRAINT.test(item))) {
    return neutralFallback(
      '再去一天已经让你很难受了。手上的钱，能撑多久的基本开支？',
      'neutral',
      'neutral-cash-v1',
    );
  }
  if (control.plan.relationshipMove?.observableCue === 'reversible_small_experiment') {
    return neutralFallback(
      '先只选一边试一天，开始前写下退出条件；一天后再决定值不值得继续，随时可以停。',
      'neutral',
      'neutral-experiment-v1',
    );
  }
  if (control.plan.relationshipMove?.observableCue === 'honest_tentative_judgment') {
    const correctionEvidence = affirmedCorrectionEvidence(
      control.plan.currentEvidenceSpans,
    );
    if (requiresClosedCorrection(control.plan.currentEvidenceSpans)) {
      if (!correctionEvidence.cleanupBoundary) return undefined;
      const characterized = characterizedFallback(
        'correction',
        context,
        correctionEvidence.cleanupBoundary,
      );
      if (characterized) return characterized;
      return hasCharacterizedFallback('correction', context.agentType)
        ? undefined
        : neutralFallback(
          `我理解错了：你不是害怕失败，也不是缺行动力，你只是不想${correctionEvidence.cleanupBoundary}。`,
          'correction',
          'neutral-correction-v1',
        );
    }
    if (hasPersonaCertaintyBlameEvidence(control.plan.currentEvidenceSpans)) {
      return neutralFallback(
        '不，我不觉得你活该。你烦我当时那种笃定的样子，这没问题。',
        'neutral',
        'neutral-judgment-v1',
      );
    }
    if (hasFatigueEvidence(control.plan.currentEvidenceSpans)
      && hasStoppingEvidence(control.plan.currentEvidenceSpans)) {
      return neutralFallback(
        '我不觉得硬撑就是前进。',
        'neutral',
        'neutral-fatigue-v1',
      );
    }
  }
  const currentEvidence = control.plan.currentEvidenceSpans.join('\n');
  if (
    control.plan.interactionMode === 'analyze'
    && /(?:A|B|两个|两份|选项|方案)/iu.test(currentEvidence)
    && /(?:比较|对比|纠结|选择|选)/u.test(currentEvidence)
  ) {
    return neutralFallback(
      '把选项写成两列，只评四项：实际收入、可支配时间、方向匹配、两年后的选择余地。你先给四项分配总计 100% 的权重，再分别打 1—5 分，乘权重后相加。任何不能拿其他优势抵消的条件单列为红线；分数负责暴露取舍，红线负责排除，最后决定仍由你来做。',
      'neutral',
      'neutral-comparison-v1',
    );
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
