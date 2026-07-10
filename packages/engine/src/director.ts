import { chatJson } from './llm';
import { getPersona } from './personas';
import type {
  AgentType,
  DirectorDecision,
  RoomState,
  TurnMessage,
} from './types';
import { AGENT_TYPES } from './types';

/**
 * 主持器/导演：每轮一次便宜模型调用，输出场景识别 + 每个在场 Agent 的
 * 原始发言冲动评估。确定性加减分（点名/暂停/入场/最近发言/拥挤）由
 * scoring.ts 在代码里完成，不交给模型。
 */

const SPEECH_TYPES = ['长发言', '短句', '追问', '反驳', '沉默'] as const;
const SCENES = ['求助', '吐槽', '冲突', '决策', '陪伴', '创作', '复盘', '闲聊'] as const;
const EMOTIONS = ['稳定', '低落', '脆弱', '激动', '危险'] as const;

function decisionSchema(agentsInRoom: AgentType[]) {
  return {
    type: 'object',
    properties: {
      scene: { type: 'string', enum: [...SCENES] },
      userEmotion: { type: 'string', enum: [...EMOTIONS] },
      conflictTopic: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
        description: '当前正在争论的话题，没有则为 null',
      },
      forceSummary: { type: 'boolean' },
      assessments: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: agentsInRoom },
            baseImpulse: {
              type: 'integer',
              description:
                '0-85：话题相关性(0-30)+独特洞察(0-20)+与上一位分歧(0-15)+用户需求匹配(0-20) 的合计，再按人格主动性微调',
            },
            angle: { type: 'string', description: '它这轮想切入的角度，一句话' },
            suggestedSpeechType: { type: 'string', enum: [...SPEECH_TYPES] },
            toneShift: {
              anyOf: [
                {
                  type: 'object',
                  properties: {
                    turnLength: { type: 'integer' },
                    expansion: { type: 'integer' },
                    bite: { type: 'integer' },
                    warmth: { type: 'integer' },
                    daze: { type: 'integer' },
                    abstraction: { type: 'integer' },
                    initiative: { type: 'integer' },
                  },
                  required: [],
                  additionalProperties: false,
                },
                { type: 'null' },
              ],
              description: '仅在上下文触发偏移时给出，最多改 2 个维度，1-5',
            },
          },
          required: ['type', 'baseImpulse', 'angle', 'suggestedSpeechType', 'toneShift'],
          additionalProperties: false,
        },
      },
    },
    required: ['scene', 'userEmotion', 'conflictTopic', 'forceSummary', 'assessments'],
    additionalProperties: false,
  };
}

function renderRoomForDirector(room: RoomState, userMessage: string): string {
  const roster = room.agents
    .map((a) => {
      const p = getPersona(a.type);
      return `- ${a.type} ${p.title}：${p.coreIdentity}
  发言触发：${p.speakWhen.join('；')}｜沉默条件：${p.silentWhen.join('；')}${a.paused ? '｜【已被用户暂停】' : ''}`;
    })
    .join('\n');

  const transcript = room.history
    .slice(-16)
    .map((m: TurnMessage) => `${m.speaker === 'user' ? '用户' : m.speaker}：${m.text}`)
    .join('\n');

  return `【在场 Agent】
${roster}

【最近对话】
${transcript || '（对话刚开始）'}

【房间状态】
${room.roomGoal ? `房间目标：${room.roomGoal}\n` : ''}${room.conflictTopic ? `当前争论：${room.conflictTopic}（已持续 ${room.conflictRounds} 轮）` : '当前无争论'}
${room.calledAgent ? `用户点名了：${room.calledAgent}` : ''}

【用户刚刚说】
${userMessage}`;
}

const DIRECTOR_SYSTEM = `你是一个多人格对话房间的调度器（主持器）。你不是可见角色，你的输出只用于决定这一轮谁发言、以什么方式发言。

评估原则：
1. 不是每个 Agent 都要回答。同一轮里观点重复的 Agent 应给低分（重复观点是扣分项，直接压低它的 baseImpulse）。
2. 用它的人格判断它"想不想说"：话题撞上它的注意力过滤器和发言触发器才给高分；撞上它的沉默条件就压到 40 以下。
3. 用户情绪脆弱或低落时，压低挑衅/刺激型切入的分数，或在 toneShift 里降 bite、升 warmth。
4. suggestedSpeechType 要制造真实对话感：有人主讲、有人短句补充、有人追问或反驳、有人沉默。避免所有人都长发言。
5. 上一位如果适合长篇，下一位优先短句/反问/旁白。
6. 如果同一争论已持续 3 轮以上，设 forceSummary=true。
7. 单聊（只有一个 Agent）时它通常应该发言，除非它的人格此刻有充分理由沉默。
8. baseImpulse 是 0-85 的整数。不要考虑点名加分、暂停、新入场、最近发言惩罚——这些由系统另行计算。`;

export async function runDirector(
  model: string,
  room: RoomState,
  userMessage: string,
): Promise<DirectorDecision> {
  const agentsInRoom = room.agents.map((a) => a.type);
  const raw = await chatJson<
    DirectorDecision & {
      assessments: (DirectorDecision['assessments'][number] & { toneShift: unknown })[];
    }
  >({
    model,
    maxTokens: 2000,
    system: DIRECTOR_SYSTEM,
    prompt: renderRoomForDirector(room, userMessage),
    schema: decisionSchema(agentsInRoom),
  });

  // 清洗：只保留在场 Agent、去掉 null toneShift、裁剪偏移到 2 维
  const valid = new Set<string>(agentsInRoom);
  const assessments = raw.assessments
    .filter((a) => valid.has(a.type) && AGENT_TYPES.includes(a.type))
    .map((a) => {
      let toneShift = a.toneShift && typeof a.toneShift === 'object' ? { ...(a.toneShift as Record<string, number>) } : undefined;
      if (toneShift) {
        const entries = Object.entries(toneShift).filter(([, v]) => typeof v === 'number');
        if (entries.length === 0) toneShift = undefined;
        else toneShift = Object.fromEntries(entries.slice(0, 2));
      }
      return {
        type: a.type,
        baseImpulse: Math.max(0, Math.min(85, Math.round(a.baseImpulse))),
        angle: a.angle,
        suggestedSpeechType: a.suggestedSpeechType,
        toneShift: toneShift as DirectorDecision['assessments'][number]['toneShift'],
      };
    });

  return {
    scene: raw.scene,
    userEmotion: raw.userEmotion,
    conflictTopic: raw.conflictTopic ?? null,
    forceSummary: raw.forceSummary,
    assessments,
  };
}
