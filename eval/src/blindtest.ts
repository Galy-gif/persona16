/**
 * 同题盲测（PRD §11.1 人格辨识度 + §11.3 语气辨识度）
 *
 * 给 16 个 Agent 同一个问题，收集回复后：
 * 1. LLM judge 隐名猜测每条回复属于哪个人格（top1 / top3）→ 辨识率
 * 2. LLM judge 给整组回复打同质化分（1=完全不同，5=高度同质）
 * 3. 代码统计开场重复、长短分布（§11.3 的硬性要求）
 * 4. 生成人工盲测 HTML 页
 */
import { AGENT_TYPES } from '@persona16/engine';
import {
  judge,
  mapWithConcurrency,
  personaRoster,
  saveArtifact,
  shuffled,
  soloReply,
  type AgentType,
} from './shared';
import { renderBlindtestHtml } from './blindtestHtml';

const QUESTIONS = [
  { id: 'q1-quit-job', scene: '决策' as const, text: '我最近很想辞职，但又怕后悔。' },
  { id: 'q2-no-work', scene: '吐槽' as const, text: '我今天不想上班，但也不知道自己到底想干嘛。' },
];

interface GuessResult {
  guesses: { replyIndex: number; top1: AgentType; top3: AgentType[]; reason: string }[];
  homogeneityScore: number;
  homogeneityReason: string;
}

async function runQuestion(q: (typeof QUESTIONS)[number]) {
  console.log(`\n=== ${q.id}: ${q.text}`);
  const replies = await mapWithConcurrency([...AGENT_TYPES], 4, async (agent) => {
    const text = await soloReply({ agent, userMessage: q.text, scene: q.scene });
    console.log(`  [${agent}] ${text.slice(0, 40).replace(/\n/g, ' ')}...`);
    return { agent, text };
  });

  const order = shuffled(replies, q.id.length * 7 + 13);
  const numbered = order.map((r, i) => ({ index: i, ...r }));

  const guessSchema = {
    type: 'object',
    properties: {
      guesses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            replyIndex: { type: 'integer' },
            top1: { type: 'string', enum: [...AGENT_TYPES] },
            top3: { type: 'array', items: { type: 'string', enum: [...AGENT_TYPES] } },
            reason: { type: 'string' },
          },
          required: ['replyIndex', 'top1', 'top3', 'reason'],
          additionalProperties: false,
        },
      },
      homogeneityScore: { type: 'integer', description: '1=16条完全不像同一个AI，5=高度同质' },
      homogeneityReason: { type: 'string' },
    },
    required: ['guesses', 'homogeneityScore', 'homogeneityReason'],
    additionalProperties: false,
  };

  const result = await judge<GuessResult>(
    `你是人格盲测评审。下面有 16 条对同一句话的回复，每条来自一个不同的 16 型人格 Agent。任务：
1. 只凭语气、关注点、介入方式猜每条回复的人格（top1 + top3 候选），不要靠排除法凑数。
2. 给整组回复打同质化分：如果它们像"同一个 AI 换了 16 套说辞"打 5，像 16 个不同的人打 1。

人格清单：
${personaRoster()}`,
    `用户的话：「${q.text}」\n\n16 条回复：\n${numbered.map((r) => `【${r.index}】${r.text}`).join('\n\n')}`,
    guessSchema,
  );

  // 计分
  let top1Hits = 0;
  let top3Hits = 0;
  const perAgent = numbered.map((r) => {
    const g = result.guesses.find((x) => x.replyIndex === r.index);
    const top1 = g?.top1 === r.agent;
    const top3 = g?.top3.includes(r.agent) ?? false;
    if (top1) top1Hits++;
    if (top3) top3Hits++;
    return { agent: r.agent, guessedTop1: g?.top1, top1, top3, reason: g?.reason };
  });

  // 代码级语气统计（§11.3）
  const lens = replies.map((r) => r.text.length);
  const short = replies.filter((r) => r.text.length <= 60).length;
  const long = replies.filter((r) => r.text.length >= 200).length;
  const openings = new Map<string, number>();
  for (const r of replies) {
    const key = r.text.trim().slice(0, 4);
    openings.set(key, (openings.get(key) ?? 0) + 1);
  }
  const maxSameOpening = Math.max(...openings.values());

  return {
    question: q,
    replies,
    judge: { perAgent, top1Hits, top3Hits, homogeneity: result.homogeneityScore, homogeneityReason: result.homogeneityReason },
    toneStats: { lens, shortReplies: short, longReplies: long, maxSameOpening },
  };
}

async function main() {
  const results = [];
  for (const q of QUESTIONS) {
    results.push(await runQuestion(q));
  }
  saveArtifact('blindtest.json', results);
  saveArtifact('blindtest.html', renderBlindtestHtml(results));

  console.log('\n===== 盲测结果 vs PRD §12 =====');
  for (const r of results) {
    console.log(`\n${r.question.id}`);
    console.log(`  judge top1 辨识：${r.judge.top1Hits}/16（目标≥60% → ≥10）`);
    console.log(`  judge top3 辨识：${r.judge.top3Hits}/16（相邻匹配口径）`);
    console.log(`  同质化评分：${r.judge.homogeneity}/5（目标≤2.5）— ${r.judge.homogeneityReason}`);
    console.log(`  短回复(≤60字)：${r.toneStats.shortReplies}（目标≥4）｜长展开(≥200字)：${r.toneStats.longReplies}（目标≥4）`);
    console.log(`  最大相同开场数：${r.toneStats.maxSameOpening}（目标<8）`);
    const misses = r.judge.perAgent.filter((p) => !p.top3);
    if (misses.length) console.log(`  top3 未命中：${misses.map((m) => `${m.agent}(被猜成${m.guessedTop1})`).join('、')}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
