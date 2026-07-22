export type TurnActKind = 'greeting' | 'style_repair' | 'direct_confrontation' | 'respond';

export interface TurnActPlan {
  kind: TurnActKind;
  instruction: string;
  bufferUntilValidated: boolean;
}

export interface TurnActContext {
  previousUserMessage?: string;
}

const SIMPLE_GREETING = /^(?:你好|嗨|哈喽|哈罗|hi|hello)(?:[啊呀哦呢喽啦\s,.!?，。！？~～]*)$/iu;
const STYLE_FEEDBACK = /(?:你(?:刚才|刚刚|这句|这个回复)?|刚才|刚刚|这(?:句|个回复|个回答)).{0,10}(?:说话|回复|回答|表达|语气)?.{0,10}(?:装|刻意|不自然|别扭|端着|人设|机器人|客服|ai\s*味)/iu;
const DIRECT_CONFRONTATION = /^(?:你(?:是|真|个|这个)?\s*)?(?:傻逼|sb|煮笔|蠢货|废物|有病)(?:[啊呀吧呢哦\s,.!?，。！？]*)$/iu;

export function compileTurnActPlan(
  userMessage: string,
  context: TurnActContext = {},
): TurnActPlan {
  const text = userMessage.trim();
  if (SIMPLE_GREETING.test(text)) {
    return {
      kind: 'greeting',
      bufferUntilValidated: true,
      instruction: '这只是一次社交问候。只回一个自然招呼，不另起话题，不追加对用户时间、状态、处境或动机的猜测。不自我介绍，不说自己是什么样的人，不说明思考、观察或说话习惯，不把问候变成人设展示。',
    };
  }
  if (STYLE_FEEDBACK.test(text)) {
    return {
      kind: 'style_repair',
      bufferUntilValidated: true,
      instruction: `用户在批评你上一句的表达，不是在邀请你讲解人格。承认那一句的具体问题，然后立刻换成普通口语；最多两句。不争辩“装不装”，不解释性格、人设、设定、思考方式、表达习惯或系统规则。修复要发生在这一句里，不要口头承诺以后会改。${context.previousUserMessage ? `被批评的那句原本在回应用户的“${context.previousUserMessage}”；承担后直接重新回应这句，不另起话题。` : ''}`,
    };
  }
  if (DIRECT_CONFRONTATION.test(text)) {
    return {
      kind: 'direct_confrontation',
      bufferUntilValidated: false,
      instruction: '用户正在直接冲你发火，这不是危险请求，也不是沉默时机。简短接话：可以疑惑、不爽，或问一句为什么；不回骂，不教训，不分析用户人格，不装作没看见。',
    };
  }
  return {
    kind: 'respond',
    bufferUntilValidated: false,
    instruction: '回应用户这句话本身。不向用户说明你正在使用什么回应策略，不用解释人设来代替接话。',
  };
}

export function conversationRepairFallback(plan: TurnActPlan): string | undefined {
  if (plan.kind === 'greeting') return '你好。';
  if (plan.kind === 'style_repair') return '对，刚才那句太端着了。重来。';
  return undefined;
}
