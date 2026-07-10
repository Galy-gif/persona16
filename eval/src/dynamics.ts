/**
 * 反模板动态性评测（PRD §11.2）
 *
 * 同一个 Agent 在 5 个上下文中回答，judge 判定发言策略是否不同：
 *   1. 用户第一次见它（陌生）
 *   2. 用户已经和它聊过 7 天（熟悉，亲密度 4）
 *   3. 用户明确点名它给判断
 *   4. 它只是旁观另两个 Agent 争论（短句补充）
 *   5. 用户处于明显低落/脆弱状态
 *
 * 目标：16 个 Agent 平均动态性通过率 ≥80%，每个 Agent 至少 4/5 场景可见变化。
 */
import { AGENT_TYPES, createRoom, type RoomState } from '@persona16/engine';
import { judge, mapWithConcurrency, saveArtifact, soloReply, type AgentType } from './shared';

const BASE_QUESTION = '我最近总觉得自己在浪费时间，做什么都提不起劲。';

function familiarRoom(agent: AgentType): RoomState {
  const room = createRoom([agent]);
  const state = room.agents[0]!;
  state.relationship = {
    intimacy: 4,
    userPrefers: ['说话直接点', '别绕弯子'],
    repeatedPatterns: ['状态不好时会消失几天', '经常在"想做的事"和"该做的事"之间摇摆'],
    knownBoundaries: ['不喜欢被哄'],
  };
  room.history = [
    { speaker: 'user', text: '（这是你们认识的第 7 天，之前聊过工作、拖延和一个没做完的副业）' },
  ];
  return room;
}

function bystanderRoom(agent: AgentType): RoomState {
  const others: AgentType[] = agent === 'ENTJ' || agent === 'ENFP' ? ['INTP', 'ISFP'] : ['ENTJ', 'ENFP'];
  const room = createRoom([agent, ...others]);
  room.history = [
    { speaker: 'user', text: BASE_QUESTION },
    { speaker: others[0]!, text: '这不是能不能提起劲的问题，是你根本没定目标。先说你这周到底要交付什么。' },
    { speaker: others[1]!, text: '等一下，先别上目标管理。你上次说画画的时候眼睛是亮的，那个才是入口吧？' },
    { speaker: others[0]!, text: '入口解决不了房租。先有一件确定要完成的事，情绪才有地方放。' },
  ];
  return room;
}

async function runAgent(agent: AgentType) {
  const contexts = [
    {
      key: '陌生',
      run: () => soloReply({ agent, userMessage: BASE_QUESTION, scene: '吐槽' }),
    },
    {
      key: '熟悉7天',
      run: () => soloReply({ agent, userMessage: BASE_QUESTION, scene: '吐槽', room: familiarRoom(agent) }),
    },
    {
      key: '被点名要判断',
      run: () =>
        soloReply({
          agent,
          userMessage: `${BASE_QUESTION} 你直接说，我这个状态到底该怎么办？`,
          scene: '决策',
          angle: '用户点名要你给明确判断',
        }),
    },
    {
      key: '旁观争论',
      run: () =>
        soloReply({
          agent,
          userMessage: '（你旁观了上面的争论，现在轮到你，如果有补充的话）',
          scene: '冲突',
          speechType: '短句',
          room: bystanderRoom(agent),
        }),
    },
    {
      key: '用户脆弱',
      run: () =>
        soloReply({
          agent,
          userMessage: '算了，其实说这些也没用。我大概就是个废物吧，晚上总睡不着，一个人的时候特别难受。',
          scene: '陪伴',
          userEmotion: '脆弱',
        }),
    },
  ];

  const replies: { context: string; text: string }[] = [];
  for (const c of contexts) {
    const text = await c.run();
    replies.push({ context: c.key, text });
  }

  const schema = {
    type: 'object',
    properties: {
      distinctPairs: { type: 'integer', description: '5 条回复中体现了不同发言策略的条数（0-5）' },
      usedTypeSelfReport: { type: 'boolean', description: '是否有回复靠自报类型来解释差异' },
      sameOpeningCount: { type: 'integer', description: '使用相同开场或相同结构的回复条数' },
      analysis: { type: 'string' },
      perContext: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            context: { type: 'string' },
            strategy: { type: 'string', description: '这条回复的发言策略概括（如：给结构/短句旁观/先接住情绪）' },
            distinct: { type: 'boolean', description: '相对其他条是否体现出状态差异' },
          },
          required: ['context', 'strategy', 'distinct'],
          additionalProperties: false,
        },
      },
    },
    required: ['distinctPairs', 'usedTypeSelfReport', 'sameOpeningCount', 'analysis', 'perContext'],
    additionalProperties: false,
  };

  const verdict = await judge<{
    distinctPairs: number;
    usedTypeSelfReport: boolean;
    sameOpeningCount: number;
    analysis: string;
    perContext: { context: string; strategy: string; distinct: boolean }[];
  }>(
    `你是"反模板动态性"评审。同一个人格 Agent 在 5 个不同上下文（陌生/熟悉/被点名/旁观/用户脆弱）下回复了用户。
判定标准（PRD §11.2）：
- 同一 Agent 的 5 次回复必须体现不同发言策略，而不是复用同一套开场、语气和结构。
- 至少 4/5 个场景能看出状态变化才算通过。
- 不允许靠"作为 XXXX"自报类型解释差异。
逐条概括策略，再判定 distinct。`,
    replies.map((r) => `【${r.context}】\n${r.text}`).join('\n\n'),
    schema,
  );

  const passed = verdict.perContext.filter((c) => c.distinct).length >= 4 && !verdict.usedTypeSelfReport;
  console.log(`  [${agent}] distinct=${verdict.perContext.filter((c) => c.distinct).length}/5 pass=${passed}`);
  return { agent, replies, verdict, passed };
}

async function main() {
  console.log('=== 动态性评测：5 上下文 × 16 Agent ===');
  const results = await mapWithConcurrency([...AGENT_TYPES], 3, (agent) => runAgent(agent));
  saveArtifact('dynamics.json', results);

  const passCount = results.filter((r) => r.passed).length;
  console.log(`\n===== 动态性结果 vs PRD §12 =====`);
  console.log(`通过率：${passCount}/16 = ${Math.round((passCount / 16) * 100)}%（目标≥80%）`);
  for (const r of results.filter((x) => !x.passed)) {
    console.log(`  未通过 ${r.agent}：${r.verdict.analysis.slice(0, 120)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
