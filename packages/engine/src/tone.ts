import type { SpeechType, ToneDims } from './types';

const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n)));

/** 基线 + 导演给出的偏移（最多主偏移 2 个维度）→ 本轮生效语气 */
export function applyToneShift(base: ToneDims, shift?: Partial<ToneDims>): ToneDims {
  if (!shift) return base;
  const entries = Object.entries(shift).slice(0, 2) as [keyof ToneDims, number][];
  const out = { ...base };
  for (const [k, v] of entries) out[k] = clamp(v);
  return out;
}

const DIM_DESC: Record<keyof ToneDims, [string, string]> = {
  turnLength: ['只说一句或半句，短补充', '可以长分析、连续展开'],
  expansion: ['问一句答一句，不拉旁支', '主动补话题、拉旁支、抛新问题'],
  bite: ['顺着说，少挑战', '调侃、反问、小幅拆台、冷幽默'],
  warmth: ['直接、硬、少铺垫', '先接住情绪，再表达判断'],
  daze: ['反应快、判断明确', '会停顿、卡一下、抓奇怪的细节'],
  abstraction: ['讲动作、事实、现场', '讲结构、意义、动机、隐喻'],
  initiative: ['等用户继续', '自己推进、换角度、点名别人'],
};

const DIM_NAME: Record<keyof ToneDims, string> = {
  turnLength: '回合长度',
  expansion: '延展欲',
  bite: '刺感',
  warmth: '温柔度',
  daze: '呆感',
  abstraction: '抽象度',
  initiative: '主动性',
};

/** 把语气参数渲染成给模型的自然语言指令 */
export function renderToneInstruction(tone: ToneDims): string {
  const lines: string[] = [];
  for (const key of Object.keys(tone) as (keyof ToneDims)[]) {
    const v = tone[key];
    const [low, high] = DIM_DESC[key];
    const lean = v <= 2 ? low : v >= 4 ? high : `介于两者之间（${low} / ${high}）`;
    lines.push(`- ${DIM_NAME[key]} ${v}/5：${lean}`);
  }
  return lines.join('\n');
}

const SPEECH_TYPE_INSTRUCTION: Record<SpeechType, string> = {
  长发言: '本轮你是主讲：可以完整展开你的视角，但仍要像说话，不要写文章。',
  短句: '本轮只允许短句补充或旁白：一到两句，说完就停，不要展开。',
  追问: '本轮只提一个问题：问那个最关键、别人没问的，不给答案。',
  反驳: '本轮你的角色是提出分歧：明确指出你不同意的点和理由，可以直接，不能攻击人。',
  沉默: '',
};

export function renderSpeechTypeInstruction(t: SpeechType): string {
  return SPEECH_TYPE_INSTRUCTION[t];
}
