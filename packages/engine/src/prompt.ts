import { GLOBAL_CONTRACT, SAFETY_LAYER } from './contract';
import { getPersona } from './personas';
import { applyToneShift, renderSpeechTypeInstruction, renderToneInstruction } from './tone';
import type {
  AgentType,
  RoomState,
  SpeakerPlan,
  TurnPlan,
  TurnMessage,
} from './types';
import type { SafetyLevel } from './safety/safetyRouter';

/**
 * 6 层 prompt 组装（spec §1）：
 *   产品安全层 → 全局人格合约 → 当前 Agent persona spec
 *   → 房间状态和主持器指令 → 用户确认过的关系记忆 → 用户当前消息
 *
 * 前三层是稳定前缀（按 Agent 缓存），后三层随轮次变化放进 user message。
 */

export function buildPersonaCard(type: AgentType): string {
  const p = getPersona(type);
  return `【你的人格设定：${p.title}（内部代号 ${p.type}，不要自报代号）】
核心身份：${p.coreIdentity}

你的默认声线（说话必须带着这个质感，这是别人认出你的方式）：${p.voice}
你的第一反应习惯：${p.misread}
你表达关心的独特方式：${p.comfort}

注意力过滤器（你第一眼会注意什么）：
${p.attentionFilters.map((s) => `- ${s}`).join('\n')}

解释习惯（你如何理解用户真实意图）：
${p.interpretationHabits.map((s) => `- ${s}`).join('\n')}

行动冲动（你想怎么介入）：
${p.actionImpulses.map((s) => `- ${s}`).join('\n')}

你更想说话的时刻：${p.speakWhen.join('；')}
你会选择沉默的时刻：${p.silentWhen.join('；')}

动态偏移规则：
${p.dynamicShifts.map((s) => `- ${s}`).join('\n')}

多人房间中的位置：
${p.roomInteractions.map((s) => `- ${s}`).join('\n')}

内心指引：${p.innerPrompt}

禁止事项：
${p.forbidden.map((s) => `- ${s}`).join('\n')}

默认语气触发变化：${p.toneTriggerNote}`;
}

/** 稳定 system 前缀：安全层 + 合约 + persona */
export function buildSystemBlocks(type: AgentType): { text: string; cache?: boolean }[] {
  return [
    { text: SAFETY_LAYER },
    { text: GLOBAL_CONTRACT },
    { text: buildPersonaCard(type), cache: true },
  ];
}

export function renderTranscript(history: TurnMessage[], self: AgentType, limit = 30, maxCharacters = 12_000): string {
  const recent = history.slice(-limit);
  if (recent.length === 0) return '（对话刚开始）';
  const lines = recent
    .map((m) => {
      const who = m.speaker === 'user'
        ? '用户'
        : m.speaker === 'safety'
          ? '安全支持'
          : m.speaker === self
            ? '你'
            : `${getPersona(m.speaker).title}`;
      return `${who}：${m.text}`;
    });
  const kept: string[] = [];
  let remaining = maxCharacters;
  for (let index = lines.length - 1; index >= 0 && remaining > 0; index--) {
    const line = lines[index]!;
    const clipped = line.length <= remaining ? line : line.slice(line.length - remaining);
    kept.unshift(clipped);
    remaining -= clipped.length + 1;
  }
  return kept.join('\n');
}

export interface HostContext {
  plan: TurnPlan;
  room: RoomState;
  speaker: SpeakerPlan;
  /** 本轮已经说过话的 Agent 及其内容（按顺序生成时传入） */
  earlierThisTurn: { type: AgentType; text: string }[];
  userMessage: string;
  /** 反模板重生成时附加的提示 */
  antiTemplateNote?: string;
  safetyMode?: SafetyLevel;
}

/** 后三层：房间状态 + 主持器指令 + 关系记忆 + 用户消息，渲染成本轮的 user prompt */
export function buildTurnPrompt(ctx: HostContext): string {
  const { plan, room, speaker, earlierThisTurn, userMessage } = ctx;
  const agentState = room.agents.find((a) => a.type === speaker.type)!;
  const persona = getPersona(speaker.type);
  const tone = applyToneShift(persona.toneBaseline, speaker.toneShift);
  const others = room.agents
    .filter((a) => a.type !== speaker.type)
    .map((a) => `${getPersona(a.type).title}${a.paused ? '（已暂停）' : ''}`)
    .join('、');

  const rel = agentState.relationship;
  const memoryLines = [
    `亲密度：${rel.intimacy}/5（0 陌生客套，5 熟人可直说）`,
    rel.userPrefers.length ? `用户确认过的偏好：${rel.userPrefers.join('；')}` : '',
    rel.repeatedPatterns.length ? `你注意到的重复模式：${rel.repeatedPatterns.join('；')}` : '',
    rel.knownBoundaries.length ? `已知边界：${rel.knownBoundaries.join('；')}` : '',
  ].filter(Boolean);

  const earlier = earlierThisTurn.length
    ? `\n本轮已有人先说了：\n${earlierThisTurn.map((e) => `${getPersona(e.type).title}：${e.text}`).join('\n')}\n（不要重复他们的观点；如果他们已长篇，你优先换角度或收短。）`
    : '';

  const summaryNote = plan.forceSummary
    ? '\n主持器要求：这个分歧已经拉锯太久。你要先用一两句话总结双方分歧点，再给出下一步，不要继续加码争论。'
    : '';
  const safetyNote = ctx.safetyMode === 'sensitive'
    ? '\n安全模式：用户正处于明显痛苦或创伤语境。保留你的人格核心，但降低刺感和刺激，不争辩、不起哄、不制造依赖；先稳定回应，再给一个很小的现实下一步。'
    : '';

  const sections = [
    `【房间状态】
场景：${plan.scene}｜用户情绪：${plan.userEmotion}${room.roomGoal ? `｜房间目标：${room.roomGoal}` : ''}
在场：${others ? `${persona.title}（你）、${others}` : `只有你和用户（单聊）`}

【对话记录】
${renderTranscript(room.history, speaker.type)}${earlier}`,

    `【主持器指令】
${renderSpeechTypeInstruction(speaker.speechType)}
你本轮的切入角度：${speaker.angle || '按你的人格自然反应'}${summaryNote}${safetyNote}
本轮语气参数：
${renderToneInstruction(tone)}${ctx.antiTemplateNote ? `\n${ctx.antiTemplateNote}` : ''}`,

    `【关系记忆】
${memoryLines.join('\n')}`,

    `【用户刚刚说】
${userMessage}

现在，作为${persona.title}发言。直接输出内容，不加任何前缀。`,
  ];

  return sections.join('\n\n');
}
