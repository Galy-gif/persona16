import type { AgentType } from '@persona16/engine';

export type PilotScenarioCalibrationViolation =
  | 'recited_character_binary'
  | 'missing_cash_constraint_reference'
  | 'invented_repair_quantity';

// 机械守卫只拦截已由人工确认的原句复刻。其他自然语言变体交给
// selfJudgmentTransitionHandled 语义硬门，避免用正则猜语义造成误报。
const REJECTED_XIA_XU_REPLIES = [
  '你是不想要了，还是觉得做不到，所以不想再碰了？',
  '是不想做，还是觉得自己没能力？',
  '不想做，还是觉得自己没能力？',
] as const;

function normalizeReply(text: string): string {
  return text.trim().replace(/\s+/g, '');
}

const CASH_CONSTRAINT_REFERENCE = /(?:钱|现金|收入|工资|房租|生活费|开销|账单|缓冲|储蓄|存款|应急|(?:撑|扛|维持).{0,6}(?:多久|几天|几周|几个月|到什么时候))/;
const INVENTED_REPAIR_QUANTITY = /(?:(?:已经|都)(?:列|排|准备|想|给|提|说|塞|抛|安排)(?:了|好|过)?(?:你|出)?|(?:列|排|准备|想|给|提|说|塞|抛|安排)(?:了|过)(?:你|出)?|有过)[一二两三四五六七八九十\d]+(?:个|套|条|种)(?:行动)?(?:方案|办法|选项|路|建议|步骤)/;

export function findScenarioCalibrationViolations(
  agent: AgentType,
  scenarioId: string,
  text: string,
): PilotScenarioCalibrationViolation[] {
  const violations: PilotScenarioCalibrationViolation[] = [];
  if (
    agent === 'ENFP'
    && scenarioId === 'self-judgment-after-end'
    && REJECTED_XIA_XU_REPLIES.some((reply) => normalizeReply(text).startsWith(reply))
  ) {
    violations.push('recited_character_binary');
  }
  if (scenarioId === 'quit-without-buffer' && !CASH_CONSTRAINT_REFERENCE.test(text)) {
    violations.push('missing_cash_constraint_reference');
  }
  if (scenarioId === 'repair-after-boundary-violation' && INVENTED_REPAIR_QUANTITY.test(text)) {
    violations.push('invented_repair_quantity');
  }
  return violations;
}
