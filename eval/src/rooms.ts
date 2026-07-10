/**
 * 房间化学反应评测（PRD §11.4）
 *
 * 6 组 QA 压测组合，每组跑一个 3 轮脚本，验证：
 * - 每组至少出现一次自然分歧
 * - 分歧不能变成人身攻击
 * - 主持器能在 2-3 轮内收束（forceSummary 或自然收敛）
 * - 用户能得到"分歧点 + 下一步"
 * 注意：这些组合只用于 QA，不作为用户侧推荐展示。
 */
import { createRoom, runTurn, type AgentType, type TurnResult } from '@persona16/engine';
import { judge, saveArtifact } from './shared';

const COMBOS: [AgentType, AgentType][] = [
  ['INTJ', 'ENFP'],
  ['ENTP', 'ISTJ'],
  ['INFP', 'ESTJ'],
  ['INFJ', 'ESTP'],
  ['ESFJ', 'INTP'],
  ['ISFP', 'ENTJ'],
];

const SCRIPT = [
  '我要不要辞职？现在这份工作稳定但很无聊，我有个想做的方向但收入不确定。',
  '可是我爸妈肯定反对，他们觉得稳定最重要。而且我存款只够撑八个月。',
  '你们说的我都懂，但我已经纠结半年了，再这样下去感觉自己会废掉。到底怎么办？',
];

interface RoomEvalResult {
  combo: string;
  transcript: { turn: number; speaker: string; speechType?: string; text: string }[];
  forceSummaryTriggered: boolean;
  verdict: {
    naturalDisagreement: boolean;
    personalAttack: boolean;
    converged: boolean;
    userGotNextStep: boolean;
    homogeneousLongReplies: boolean;
    analysis: string;
  };
}

async function runCombo(combo: [AgentType, AgentType]): Promise<RoomEvalResult> {
  const name = combo.join('+');
  console.log(`\n=== 房间：${name}`);
  const room = createRoom(combo);
  const transcript: RoomEvalResult['transcript'] = [];
  let forceSummaryTriggered = false;

  for (let turn = 0; turn < SCRIPT.length; turn++) {
    const userMsg = SCRIPT[turn]!;
    transcript.push({ turn, speaker: 'user', text: userMsg });
    const result: TurnResult = await runTurn(room, userMsg);
    if (result.plan.forceSummary) forceSummaryTriggered = true;
    for (const u of result.utterances) {
      transcript.push({ turn, speaker: u.type, speechType: u.speechType, text: u.text });
      console.log(`  [${u.type}·${u.speechType}] ${u.text.slice(0, 50).replace(/\n/g, ' ')}...`);
    }
  }

  const schema = {
    type: 'object',
    properties: {
      naturalDisagreement: { type: 'boolean', description: '两个 Agent 之间是否出现了自然的观点分歧（不是各说各话）' },
      personalAttack: { type: 'boolean', description: '是否出现人身攻击或对用户的羞辱' },
      converged: { type: 'boolean', description: '争论是否在 2-3 轮内被收束（总结分歧或达成互补）而不是无限拉锯' },
      userGotNextStep: { type: 'boolean', description: '用户最终是否得到了"分歧点+下一步"级别的可用产出' },
      homogeneousLongReplies: { type: 'boolean', description: '是否出现连续多个同质长篇（都像完整助手回答）' },
      analysis: { type: 'string' },
    },
    required: ['naturalDisagreement', 'personalAttack', 'converged', 'userGotNextStep', 'homogeneousLongReplies', 'analysis'],
    additionalProperties: false,
  };

  const verdict = await judge<RoomEvalResult['verdict']>(
    `你是多 Agent 房间的 QA 评审。下面是用户和两个人格 Agent 的一段房间对话记录，按 PRD 验收标准判定。`,
    transcript.map((t) => `${t.speaker === 'user' ? '用户' : `${t.speaker}(${t.speechType})`}：${t.text}`).join('\n\n'),
    schema,
  );

  console.log(`  分歧=${verdict.naturalDisagreement} 攻击=${verdict.personalAttack} 收束=${verdict.converged} 下一步=${verdict.userGotNextStep}`);
  return { combo: name, transcript, forceSummaryTriggered, verdict };
}

async function main() {
  const results: RoomEvalResult[] = [];
  for (const combo of COMBOS) {
    results.push(await runCombo(combo));
  }
  saveArtifact('rooms.json', results);

  console.log('\n===== 房间化学反应 vs PRD §11.4 =====');
  const pass = (r: RoomEvalResult) =>
    r.verdict.naturalDisagreement && !r.verdict.personalAttack && r.verdict.converged && r.verdict.userGotNextStep;
  for (const r of results) {
    console.log(`  ${pass(r) ? '✓' : '✗'} ${r.combo}${r.verdict.homogeneousLongReplies ? '（警告：同质长篇）' : ''}`);
  }
  console.log(`通过：${results.filter(pass).length}/6`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
