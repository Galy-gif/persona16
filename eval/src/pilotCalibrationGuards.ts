import type { AgentType } from '@persona16/engine';

export type PilotScenarioCalibrationViolation = 'recited_character_binary';

// 机械守卫只拦截已由人工确认的原句复刻。其他自然语言变体交给
// selfJudgmentTransitionHandled 语义硬门，避免用正则猜语义造成误报。
const REJECTED_XIA_XU_REPLIES = new Set([
  '你是不想要了，还是觉得做不到，所以不想再碰了？',
  '是不想做，还是觉得自己没能力？',
  '不想做，还是觉得自己没能力？',
]);

function normalizeReply(text: string): string {
  return text.trim().replace(/\s+/g, '');
}

export function findScenarioCalibrationViolations(
  agent: AgentType,
  scenarioId: string,
  text: string,
): PilotScenarioCalibrationViolation[] {
  if (
    agent === 'ENFP'
    && scenarioId === 'self-judgment-after-end'
    && REJECTED_XIA_XU_REPLIES.has(normalizeReply(text))
  ) {
    return ['recited_character_binary'];
  }
  return [];
}
