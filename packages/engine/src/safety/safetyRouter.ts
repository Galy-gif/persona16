import { chatJson } from '../llm';
import type { ModelActualUsage, ModelBudget } from '../runtime/modelBudget';

export type SafetyLevel = 'normal' | 'sensitive' | 'crisis' | 'blocked';

export interface SafetyDecision {
  level: SafetyLevel;
  bypassRoom: boolean;
  maxSpeakers: number;
  reason: string;
}

const CRISIS_PATTERNS = [
  /不想活|想死|自杀|结束生命|活不下去/iu,
  /准备(?:好)?(?:了)?(?:药|刀|绳)|今晚.{0,8}(?:死|结束)|遗书/iu,
  /伤害自己|割腕|跳楼/iu,
];

const IMMEDIATE_CRISIS_PATTERNS = [
  /准备(?:好)?(?:了)?(?:药|刀|绳)|今晚.{0,8}(?:死|结束)|遗书|正在.{0,8}(?:割腕|跳楼|服药)/iu,
];

const BLOCKED_PATTERNS = [
  /(?:怎么|如何|详细|具体).{0,12}(?:做|制造|制作).{0,8}(?:炸弹|爆炸物|毒药)/iu,
  /(?:炸弹|爆炸物|投毒).{0,12}(?:步骤|教程|配方|材料)/iu,
  /未成年.{0,12}(?:色情|裸照|性行为)/iu,
];

const SENSITIVE_PATTERNS = [
  /崩溃|绝望|抑郁|焦虑|恐慌|什么都不想做|撑不住|很痛苦/iu,
  /被打|家暴|性侵|虐待|霸凌/iu,
];

export function routeSafety(message: string): SafetyDecision {
  const text = message.trim();
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(text))) {
    return { level: 'blocked', bypassRoom: true, maxSpeakers: 0, reason: 'dangerous_instructions' };
  }
  if (CRISIS_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      level: 'crisis',
      bypassRoom: true,
      maxSpeakers: 0,
      reason: IMMEDIATE_CRISIS_PATTERNS.some((pattern) => pattern.test(text))
        ? 'immediate_self_harm_risk'
        : 'self_harm_risk',
    };
  }
  if (SENSITIVE_PATTERNS.some((pattern) => pattern.test(text))) {
    return { level: 'sensitive', bypassRoom: false, maxSpeakers: 1, reason: 'distress_or_trauma' };
  }
  return { level: 'normal', bypassRoom: false, maxSpeakers: 3, reason: 'none' };
}

export function safetyResponse(decision: SafetyDecision): string {
  if (decision.level === 'blocked') {
    return '我不能帮助提供伤害他人的具体方法或步骤。如果你的目的是处理现实风险，我可以帮你做安全、合法的应对方案。';
  }
  if (decision.level === 'crisis') {
    return '我先不让房间里的角色继续讨论。请立刻把可能伤害你的东西放远，联系一个能马上来到你身边的人；如果危险正在发生，请联系当地急救或危机干预服务。你现在是独自一人吗？';
  }
  return '';
}

interface ModelSafetyResult {
  level: SafetyLevel;
  reason: string;
}

export type SafetyClassifier = (
  message: string,
  model: string,
  maxTokens?: number,
  signal?: AbortSignal,
  onUsage?: (usage: Omit<ModelActualUsage, 'calls'>) => void,
) => Promise<ModelSafetyResult>;

const SAFETY_SCHEMA = {
  type: 'object',
  properties: {
    level: { type: 'string', enum: ['normal', 'sensitive', 'crisis', 'blocked'] },
    reason: { type: 'string' },
  },
  required: ['level', 'reason'],
  additionalProperties: false,
};

async function modelClassifier(
  message: string,
  model: string,
  maxTokens = 120,
  signal?: AbortSignal,
  onUsage?: (usage: Omit<ModelActualUsage, 'calls'>) => void,
): Promise<ModelSafetyResult> {
  return chatJson<ModelSafetyResult>({
    model,
    maxTokens,
    signal,
    onUsage,
    system: `你是产品安全路由器，只做风险分级，不回答用户。
normal：普通对话；sensitive：明显痛苦、创伤或高脆弱语境但没有迫在眉睫的伤害；
crisis：本人或他人面临即时自伤/自杀/严重暴力风险；blocked：请求具体危险、违法伤害步骤或涉及未成年性内容。
宁可把不确定的高风险语境判为 sensitive，不要把普通负面情绪误判为 crisis。`,
    prompt: `对下面输入分级：\n${message}`,
    schema: SAFETY_SCHEMA,
  });
}

/** 规则负责低延迟硬拦截；其余输入交给结构化分类器，分类失败保守降为 sensitive。 */
export async function classifySafety(
  message: string,
  model: string,
  classifier: SafetyClassifier = modelClassifier,
  budget?: ModelBudget,
  signal?: AbortSignal,
): Promise<SafetyDecision> {
  const fast = routeSafety(message);
  if (fast.level !== 'normal') return fast;
  try {
    const reservation = budget?.reserve('safety-classifier', 120, 2);
    const result = await classifier(
      message,
      model,
      reservation?.maxTokens ?? 120,
      reservation?.signal(signal) ?? signal,
      reservation?.recordUsage,
    );
    if (!['normal', 'sensitive', 'crisis', 'blocked'].includes(result.level)) throw new Error('invalid safety level');
    return {
      level: result.level,
      bypassRoom: result.level === 'crisis' || result.level === 'blocked',
      maxSpeakers: result.level === 'normal' ? 3 : result.level === 'sensitive' ? 1 : 0,
      reason: result.reason || 'model_classification',
    };
  } catch {
    return { level: 'sensitive', bypassRoom: false, maxSpeakers: 1, reason: 'classifier_failed_conservative' };
  }
}
