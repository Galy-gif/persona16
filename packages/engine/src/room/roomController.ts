import { chatJson } from '../llm';
import { getPersona } from '../personas';
import type { AgentType, SpeechType } from '../types';
import type { RoomAction, RoomController, RoomControllerContext } from './types';
import type { ModelBudget } from '../runtime/modelBudget';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const SPEECH_TYPES: SpeechType[] = ['长发言', '短句', '追问', '反驳'];

const CONTROLLER_SYSTEM = `你是多人格房间的逐步控制器。每有一个 Agent 说完，你只决定下一步，不生成用户可见内容。

规则：
1. 只有仍有独特观点时才让下一位说；不要为了轮流而轮流。
2. 优先从主持器已经筛选出的候选中选择，不得新增候选。
3. 已有人完整覆盖重点时 stop；缺关键事实时 ask_user；争论需要收束时 summarize。
4. speak 的 angle 必须明确它相对已有发言新增什么。
5. 脆弱情绪下避免无必要反驳；危险情绪不继续多人争论。
6. stop 的 reason 只能是 complete 或 no_new_value。
7. 输出只包含所选动作需要的字段。`;

function controllerDecisionSchema(activeAgents: AgentType[]) {
  if (activeAgents.length === 0) throw new Error('room controller requires at least one active agent');
  const agent = z.enum(activeAgents as [AgentType, ...AgentType[]]);
  const nonEmptyText = z.string().trim().min(1).max(500);
  return z.discriminatedUnion('action', [
    z.object({
      action: z.literal('speak'),
      agent,
      speechType: z.enum(SPEECH_TYPES as [SpeechType, ...SpeechType[]]),
      angle: nonEmptyText,
    }).strict(),
    z.object({
      action: z.literal('summarize'),
      agent,
      reason: nonEmptyText,
    }).strict(),
    z.object({
      action: z.literal('ask_user'),
      agent,
      question: nonEmptyText,
    }).strict(),
    z.object({
      action: z.literal('stop'),
      reason: z.enum(['complete', 'no_new_value']),
    }).strict(),
  ]);
}

type ControllerDecision = z.infer<ReturnType<typeof controllerDecisionSchema>>;

function renderControllerContext(context: RoomControllerContext): string {
  const alreadySaid = context.state.utterances.length
    ? context.state.utterances
        .map((utterance) => `${getPersona(utterance.type).title}（${utterance.speechType}）：${utterance.text}`)
        .join('\n')
    : '（还没人说）';
  const remaining = context.availableSpeakers.length
    ? context.availableSpeakers
        .map((speaker) => `- ${speaker.type} ${getPersona(speaker.type).title}｜分数 ${speaker.finalScore}｜原角度：${speaker.angle}`)
        .join('\n')
    : '（没有剩余普通发言候选）';

  return `【场景】${context.plan.scene}｜用户情绪：${context.plan.userEmotion}｜强制收束：${context.plan.forceSummary}

【用户最近消息】
${context.userMessage}

【本轮已经说过】
${alreadySaid}

【剩余候选】
${remaining}

【预算】
普通发言 ${context.state.normalSpeakers.length}/${context.budget.maxNormalSpeakers}；总结 ${context.state.summaryCount}/${context.budget.maxSummaries}。

决定下一步。`;
}

function toRoomAction(decision: ControllerDecision): RoomAction {
  if (decision.action === 'stop') return { type: 'stop', reason: decision.reason };
  if (decision.action === 'summarize') {
    return { type: 'summarize', agent: decision.agent, reason: decision.reason };
  }
  if (decision.action === 'ask_user') {
    return { type: 'ask_user', agent: decision.agent, question: decision.question };
  }
  return {
    type: 'speak',
    agent: decision.agent,
    speechType: decision.speechType,
    angle: decision.angle,
  };
}

export function parseRoomControllerAction(raw: unknown, activeAgents: AgentType[]): RoomAction {
  return toRoomAction(controllerDecisionSchema(activeAgents).parse(raw));
}

export function createLlmRoomController(
  model: string,
  options: { budget?: ModelBudget; signal?: AbortSignal } = {},
): RoomController {
  return {
    async decide(context) {
      const activeAgents = context.room.agents.filter((agent) => !agent.paused).map((agent) => agent.type);
      if (activeAgents.length === 0) return { type: 'stop', reason: 'no_new_value' };
      const reservation = options.budget?.reserve('room-controller', 800, 2);
      const decisionSchema = controllerDecisionSchema(activeAgents);
      const raw = await chatJson<unknown>({
        model,
        maxTokens: reservation?.maxTokens ?? 800,
        signal: reservation?.signal(options.signal) ?? options.signal,
        onUsage: reservation?.recordUsage,
        system: CONTROLLER_SYSTEM,
        prompt: renderControllerContext(context),
        schema: zodToJsonSchema(decisionSchema, { $refStrategy: 'none' }),
      });
      return toRoomAction(decisionSchema.parse(raw));
    },
  };
}
