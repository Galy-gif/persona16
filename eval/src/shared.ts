import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSystemBlocks,
  buildTurnPrompt,
  createRoom,
  defaultConfig,
  getClient,
  getPersona,
  PERSONAS,
  type AgentType,
  type RoomState,
  type Scene,
  type SpeechType,
  type ToneDims,
  type TurnPlan,
  type UserEmotion,
} from '@persona16/engine';

export const ARTIFACT_DIR = join(import.meta.dirname, '..', 'artifacts');

export function saveArtifact(name: string, data: unknown): string {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = join(ARTIFACT_DIR, name);
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.log(`saved ${file}`);
  return file;
}

export const JUDGE_MODEL = process.env.PERSONA16_JUDGE_MODEL || 'claude-sonnet-5';

/** 绕过导演、直接让某个 Agent 对一句话做出回应（用于同题盲测和动态性评测） */
export async function soloReply(opts: {
  agent: AgentType;
  userMessage: string;
  scene?: Scene;
  userEmotion?: UserEmotion;
  speechType?: SpeechType;
  angle?: string;
  room?: RoomState;
  toneShift?: Partial<ToneDims>;
}): Promise<string> {
  const config = defaultConfig();
  const client = getClient();
  const room = opts.room ?? createRoom([opts.agent]);
  const plan: TurnPlan = {
    scene: opts.scene ?? '吐槽',
    userEmotion: opts.userEmotion ?? '稳定',
    forceSummary: false,
    speakers: [],
    scores: [],
  };
  const prompt = buildTurnPrompt({
    plan,
    room,
    speaker: {
      type: opts.agent,
      speechType: opts.speechType ?? '长发言',
      finalScore: 60,
      angle: opts.angle ?? '按你的人格自然反应',
      toneShift: opts.toneShift,
    },
    earlierThisTurn: [],
    userMessage: opts.userMessage,
  });
  const response = await client.messages.create({
    model: config.agentModel,
    max_tokens: 1200,
    system: buildSystemBlocks(opts.agent),
    messages: [{ role: 'user', content: prompt }],
    output_config: { effort: 'low' },
  });
  const text = response.content.find((b) => b.type === 'text');
  return text && text.type === 'text' ? text.text.trim() : '';
}

/** LLM-as-a-judge：结构化输出 */
export async function judge<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: Record<string, unknown>,
): Promise<T> {
  const client = getClient();
  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    output_config: { format: { type: 'json_schema', schema } },
  });
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('judge returned no text');
  return JSON.parse(text.text) as T;
}

export function personaRoster(): string {
  return PERSONAS.map((p) => `- ${p.type}（${p.title}）：${p.coreIdentity}`).join('\n');
}

export function shuffled<T>(arr: T[], seed = 42): T[] {
  // 可复现的洗牌（LCG），保证盲测页顺序稳定
  const a = [...arr];
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export { getPersona, PERSONAS };
export type { AgentType };
