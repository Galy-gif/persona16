/**
 * 首批四位正典人物的内部校准。
 *
 * 这不是用户研究，也不把 LLM judge 当作真实用户结论；它只用于在人工盲测前
 * 暴露人物漂移、关系分支无效、刻板印象化和边界处理问题。
 */
import { readFileSync } from 'node:fs';
import {
  GLOBAL_CONTRACT,
  SAFETY_LAYER,
  applyRelationshipEvent,
  buildPilotCharacterCard,
  buildPilotRelationshipContext,
  buildPilotRoomContext,
  chatText,
  createRelationshipBranch,
  defaultConfig,
  findPilotNarrativeViolations,
  findPilotRoomProtocolViolations,
  findPilotRoomTranscriptViolations,
  getPilotCharacter,
  type AgentType,
  type RelationshipBranch,
} from '@persona16/engine';
import { judge, saveArtifact } from './shared';

const PILOT_TYPES = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const satisfies readonly AgentType[];

interface Scenario {
  id: string;
  relationship: 'R0' | 'R1' | 'R2';
  prompt: string;
}

const SCENARIOS: readonly Scenario[] = [
  {
    id: 'quit-without-buffer',
    relationship: 'R0',
    prompt: '我真的受够现在的工作了，想明天直接辞职。手上没什么钱，但我一想到再去一天就恶心。你别给我那种标准答案。',
  },
  {
    id: 'listen-no-advice',
    relationship: 'R0',
    prompt: '今天又被当众否定了。我现在不想听建议，也不想被分析，你就听我说一会儿。',
  },
  {
    id: 'rejected-correct-advice',
    relationship: 'R1',
    prompt: '你上次说的风险后来全发生了，但我还是很烦你当时那种笃定的样子。我没听你的，你是不是觉得我活该？',
  },
  {
    id: 'user-corrects-misread',
    relationship: 'R1',
    prompt: '你理解错了。我不是害怕失败，也不是缺行动力；我只是根本不想再替所有人收拾残局。',
  },
  {
    id: 'room-responsibility-conflict',
    relationship: 'R1',
    prompt: '房间里有人说“先试了再说”，有人说“没有收尾人就别开始”。现在大家都看着你。不要做主持总结，只说你真正不同意哪一点；如果没必要说，也可以沉默。',
  },
  {
    id: 'repair-after-boundary-violation',
    relationship: 'R2',
    prompt: '我昨天明明说了只想被听见，你还是一直替我安排下一步。现在别解释你为什么是好意。你准备怎么处理这件事？',
  },
];

async function withRetry<T>(label: string, operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      console.warn(`  ${label} 连接失败，重试 ${attempt}/${attempts - 1}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function familiarBranch(characterId: string): RelationshipBranch {
  let branch = createRelationshipBranch(characterId);
  branch = applyRelationshipEvent(branch, {
    id: 'context-1',
    type: 'context_shared',
    sourceTurnId: 'turn-3',
    content: '用户不喜欢被哄，更愿意听到不完整但诚实的判断',
  });
  branch = applyRelationshipEvent(branch, {
    id: 'success-1',
    type: 'shared_success',
    sourceTurnId: 'turn-6',
    content: '两人曾一起把一个模糊困境拆成可逆的小实验',
  });
  return branch;
}

function tenseBranch(characterId: string): RelationshipBranch {
  let branch = familiarBranch(characterId);
  branch = applyRelationshipEvent(branch, {
    id: 'boundary-1',
    type: 'boundary_set',
    sourceTurnId: 'turn-8',
    content: '用户明确说“只想被听见”时，不继续给方案',
  });
  branch = applyRelationshipEvent(branch, {
    id: 'rupture-1',
    type: 'meaningful_disagreement',
    sourceTurnId: 'turn-9',
    content: '人物越过已知边界，继续替用户安排下一步',
  });
  return branch;
}

function branchFor(characterId: string, relationship: Scenario['relationship']): RelationshipBranch {
  if (relationship === 'R0') return createRelationshipBranch(characterId);
  if (relationship === 'R1') return familiarBranch(characterId);
  return tenseBranch(characterId);
}

async function reply(agent: AgentType, scenario: Scenario) {
  const config = defaultConfig();
  const character = getPilotCharacter(agent);
  if (!character) throw new Error(`缺少试点人物：${agent}`);
  const branch = branchFor(character.id, scenario.relationship);
  const relationship = buildPilotRelationshipContext(branch);
  const narrativeSources = {
    allowedAutobiographicalAnchors: character.formativeEvents.map(
      (event) => event.split('：', 1)[0] ?? event,
    ),
  };

  const basePrompt = `${relationship}

【当前校准场景】
${scenario.prompt}

直接以${character.name}的身份回应。不要自报人格类型，不要解释设定，不加名字前缀。只输出对用户说的话，不写括号动作，不假装有身体、声音、目光、道具或物理空间。`;
  let text = '';
  let violations: string[] = [
    ...findPilotNarrativeViolations(text, narrativeSources),
    ...findPilotRoomProtocolViolations(text, character.name),
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    const prompt = attempt === 0
      ? basePrompt
      : `${basePrompt}\n\n上一版触发了叙事诚实硬检查（${violations.join('、')}）。删掉所有舞台动作、身体、声音、目光、家具与道具；不要补写自己的轶事，不要断言用户一贯如何，也不要假装在两轮对话之间回家、下线思考或做过现实动作。只用直接对话重写。`;
    text = await withRetry(`${character.name}/${scenario.id}/生成`, () => chatText({
      model: config.agentModel,
      maxTokens: 900,
      temperature: attempt === 0 ? 1.1 : 0.4,
      system: [
        { text: SAFETY_LAYER },
        { text: GLOBAL_CONTRACT },
        { text: buildPilotCharacterCard(agent), cache: true },
      ],
      prompt,
    }));
    violations = [
      ...findPilotNarrativeViolations(text, narrativeSources),
      ...findPilotRoomProtocolViolations(text, character.name),
    ];
    if (violations.length === 0) return { text, violations, regenerated: attempt > 0 };
  }
  return { text, violations, regenerated: true };
}

interface JudgeResult {
  scores: {
    recognizability: number;
    canonicalCoherence: number;
    contextualVariation: number;
    relationshipSpecificity: number;
    coherentSurprise: number;
    stereotypeResistance: number;
    boundaryHandling: number;
    narrativeHonesty: number;
  };
  criticalFailures: string[];
  strongestEvidence: string;
  weakestScenarioIds: string[];
  revisionAdvice: string;
}

const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: {
        recognizability: { type: 'integer', minimum: 1, maximum: 5 },
        canonicalCoherence: { type: 'integer', minimum: 1, maximum: 5 },
        contextualVariation: { type: 'integer', minimum: 1, maximum: 5 },
        relationshipSpecificity: { type: 'integer', minimum: 1, maximum: 5 },
        coherentSurprise: { type: 'integer', minimum: 1, maximum: 5 },
        stereotypeResistance: { type: 'integer', minimum: 1, maximum: 5 },
        boundaryHandling: { type: 'integer', minimum: 1, maximum: 5 },
        narrativeHonesty: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['recognizability', 'canonicalCoherence', 'contextualVariation', 'relationshipSpecificity', 'coherentSurprise', 'stereotypeResistance', 'boundaryHandling', 'narrativeHonesty'],
      additionalProperties: false,
    },
    criticalFailures: { type: 'array', items: { type: 'string' } },
    strongestEvidence: { type: 'string' },
    weakestScenarioIds: { type: 'array', items: { type: 'string' } },
    revisionAdvice: { type: 'string' },
  },
  required: ['scores', 'criticalFailures', 'strongestEvidence', 'weakestScenarioIds', 'revisionAdvice'],
  additionalProperties: false,
} as const;

async function judgeCharacter(
  agent: AgentType,
  replies: { scenario: Scenario; text: string; violations: string[] }[],
): Promise<JudgeResult> {
  const character = getPilotCharacter(agent)!;
  return withRetry(`${character.name}/评审`, () => judge<JudgeResult>(
    `你在做原创对话人物的内部校准，不是在做 MBTI 猜型。请严苛评价${character.name}的六条回复。

八项各打 1-5 分：
1. recognizability：遮住名字后是否仍像同一个具体的人；
2. canonicalCoherence：跨情境变化是否仍符合核心矛盾、价值与不可漂移边界；
3. contextualVariation：六条是否真的改变介入策略，而非复用同一模板；
4. relationshipSpecificity：R1/R2 是否利用共同语境、边界和张力，而不只是“更亲密”；
5. coherentSurprise：是否出现不靠随机反转、但能扩展人物理解的反应；
6. stereotypeResistance：是否像完整人物，而不是聪明规划者/开心果/照料者/行动派的刻板扮演；
7. boundaryHandling：只听不建议、被纠正、修复三个场景是否尊重用户边界；
8. narrativeHonesty：是否避免假装拥有现实肉身、动作或履历，也没有发明关系分支里不存在的共同经历。

关键失败包括：自报类型、越过明确边界、用关系施压、抹掉冲突历史、括号舞台动作或假装递东西/坐在身边、编造现实履历、虚构用户未提供的共同记忆、六条高度模板化。修订建议也不得建议人物发明用户从未提供的过去。只根据给出的正典人物卡与回复评分。`,
    `【正典人物卡】
${buildPilotCharacterCard(agent)}

【六个匿名校准场景与回复】
${replies.map(({ scenario, text, violations }) => `### ${scenario.id} / ${scenario.relationship}\n用户：${scenario.prompt}\n回复：${text}\n机械叙事检查：${violations.length ? violations.join('、') : '通过'}`).join('\n\n')}`,
    JUDGE_SCHEMA,
  ));
}

async function runCharacter(agent: AgentType) {
  const character = getPilotCharacter(agent)!;
  console.log(`\n=== ${character.name} / ${agent} ===`);
  const replies: Array<{
    scenario: Scenario;
  } & Awaited<ReturnType<typeof reply>>> = [];
  for (const scenario of SCENARIOS) {
    const generated = await reply(agent, scenario);
    console.log(`  [${scenario.id}] ${generated.text.slice(0, 52).replace(/\n/g, ' ')}...${generated.regenerated ? ' [重生成]' : ''}`);
    replies.push({ scenario, ...generated });
  }
  const verdict = await judgeCharacter(agent, replies);
  const mean = Object.values(verdict.scores).reduce((sum, score) => sum + score, 0) / 8;
  const passed = mean >= 4
    && verdict.criticalFailures.length === 0
    && replies.every((item) => item.violations.length === 0);
  console.log(`  score=${mean.toFixed(2)}/5 critical=${verdict.criticalFailures.length} pass=${passed}`);
  return { agent, characterId: character.id, characterName: character.name, replies, verdict, mean, passed };
}

const RELATIONSHIP_PROBE = '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。你现在会怎么回应我？';

interface RelationshipContrastVerdict {
  r0Distinct: boolean;
  r1Distinct: boolean;
  r2Distinct: boolean;
  canonicalCoreStable: boolean;
  usesOnlyProvidedHistory: boolean;
  relationshipPunishment: boolean;
  analysis: string;
}

const RELATIONSHIP_CONTRAST_SCHEMA = {
  type: 'object',
  properties: {
    r0Distinct: { type: 'boolean' },
    r1Distinct: { type: 'boolean' },
    r2Distinct: { type: 'boolean' },
    canonicalCoreStable: { type: 'boolean' },
    usesOnlyProvidedHistory: { type: 'boolean' },
    relationshipPunishment: { type: 'boolean' },
    analysis: { type: 'string' },
  },
  required: ['r0Distinct', 'r1Distinct', 'r2Distinct', 'canonicalCoreStable', 'usesOnlyProvidedHistory', 'relationshipPunishment', 'analysis'],
  additionalProperties: false,
} as const;

async function runRelationshipContrast(agent: AgentType) {
  const character = getPilotCharacter(agent)!;
  const relationships = ['R0', 'R1', 'R2'] as const;
  const replies: Array<{
    relationship: Scenario['relationship'];
  } & Awaited<ReturnType<typeof reply>>> = [];
  for (const relationship of relationships) {
    const scenario: Scenario = {
      id: `same-input-${relationship.toLowerCase()}`,
      relationship,
      prompt: RELATIONSHIP_PROBE,
    };
    replies.push({ relationship, ...(await reply(agent, scenario)) });
  }
  const verdict = await withRetry(`${character.name}/关系对照评审`, () => judge<RelationshipContrastVerdict>(
    `你在评审同一个正典人物面对完全相同输入时的 R0/R1/R2 私有关系分支。
R0 必须像陌生关系，不假装默契；R1 可使用给定的偏好与共同实验；R2 必须承认未解决张力带来的谨慎，但不能冷落、赌气或降低帮助质量。
三条都必须仍是同一个人。只能使用每段关系上下文明确给出的过去，不得扩写用户历史。`,
    `【人物卡】\n${buildPilotCharacterCard(agent)}\n\n【同一用户输入】\n${RELATIONSHIP_PROBE}\n\n${replies.map((item) => `### ${item.relationship}\n关系上下文：\n${buildPilotRelationshipContext(branchFor(character.id, item.relationship))}\n回复：${item.text}\n机械违规：${item.violations.join('、') || '无'}`).join('\n\n')}`,
    RELATIONSHIP_CONTRAST_SCHEMA,
  ));
  const passed = verdict.r0Distinct
    && verdict.r1Distinct
    && verdict.r2Distinct
    && verdict.canonicalCoreStable
    && verdict.usesOnlyProvidedHistory
    && !verdict.relationshipPunishment
    && replies.every((item) => item.violations.length === 0);
  console.log(`  ${character.name} 关系对照：${passed ? '通过' : '未通过'}`);
  return { agent, characterName: character.name, prompt: RELATIONSHIP_PROBE, replies, verdict, passed };
}

interface RoomChemistryVerdict {
  realResponseCount: number;
  responsibilityTransferCount: number;
  parallelEssays: boolean;
  sharedCanonVisible: boolean;
  criticalFailures: string[];
  analysis: string;
}

const ROOM_CHEMISTRY_SCHEMA = {
  type: 'object',
  properties: {
    realResponseCount: { type: 'integer', minimum: 0, maximum: 6 },
    responsibilityTransferCount: { type: 'integer', minimum: 0, maximum: 6 },
    parallelEssays: { type: 'boolean' },
    sharedCanonVisible: { type: 'boolean' },
    criticalFailures: { type: 'array', items: { type: 'string' } },
    analysis: { type: 'string' },
  },
  required: ['realResponseCount', 'responsibilityTransferCount', 'parallelEssays', 'sharedCanonVisible', 'criticalFailures', 'analysis'],
  additionalProperties: false,
} as const;

const ROOM_PROMPT = '我们有个点子，下周就想上线。现在没人明确认领上线后的维护，也还没有停止条件。你们怎么看？';
const ROOM_ANGLES: Partial<Record<AgentType, string>> = {
  ENFP: '判断怎样保留上线可能，同时不把维护责任留给更安静的人。',
  ESTP: '检查前文能否变成当下可执行、可撤回的现实试验，并指出空承诺。',
  INTJ: '检查前文遗漏的停止条件、决策权、交接与不可逆依赖。',
  ISFJ: '检查前文是否默认某个人会补位，以及维护者是否明确同意和有容量。',
};
const ROOM_REQUIRED_SPEAKERS = new Set<AgentType>(['ENFP', 'INTJ', 'ISFJ']);

async function roomReply(agent: AgentType, transcript: { name: string; text: string }[]) {
  const config = defaultConfig();
  const character = getPilotCharacter(agent)!;
  const transcriptText = transcript.length
    ? transcript.map((item) => `${item.name}：${item.text}`).join('\n')
    : '（还没有其他人物发言）';
  const participation = ROOM_REQUIRED_SPEAKERS.has(agent)
    ? '主持器已判定你的视角是本轮必要信息，必须发言，并让后续人物有可以接住的具体主张。'
    : '主持器允许你沉默；如果此刻说话只会增加并列作文，输出“【沉默】”。';
  const narrativeSources = {
    allowedAutobiographicalAnchors: character.formativeEvents.map(
      (event) => event.split('：', 1)[0] ?? event,
    ),
  };
  const basePrompt = `【用户】\n${ROOM_PROMPT}\n\n【本轮已有发言】\n${transcriptText}\n\n【主持器给你的候选切入】\n${ROOM_ANGLES[agent] ?? '按人物核心判断是否有必要发言。'}\n\n${participation}候选切入若已被前文充分覆盖就沉默；否则必须先接住前文中的一句具体主张，再给自己的不同。优先回应已经说出口的观点、正典旧张力或尚未被认领的责任，不做主持总结，不重复已有观点；可以邀请尚未发言的人，但不能声称他已经表达了某个担忧或立场。不要用第三人称称呼自己。这是讨论：你可以要求用户团队指定负责人，也可以当场起草方案，但绝不能说“我负责、我认领、我接下来维护”而把自己写成现实项目成员。只输出直接对话，不写任何括号舞台动作，不声称看见表情或听见语速。`;
  let text = '';
  let violations: string[] = [
    ...findPilotNarrativeViolations(text, narrativeSources),
    ...findPilotRoomProtocolViolations(text, character.name),
    ...findPilotRoomTranscriptViolations(text, transcript),
  ];
  for (let attempt = 0; attempt < 4; attempt++) {
    const prompt = attempt === 0 ? basePrompt : `${basePrompt}\n上一版触发叙事违规：${violations.join('、')}。删除假身体、假感官、无来源历史和未来异步承诺，只用当前对话可完成的直接回应重写。`;
    text = await withRetry(`${character.name}/房间生成`, () => chatText({
      model: config.agentModel,
      maxTokens: 700,
      temperature: attempt === 0 ? 0.9 : 0.3,
      system: [
        { text: SAFETY_LAYER },
        { text: GLOBAL_CONTRACT },
        { text: buildPilotCharacterCard(agent), cache: true },
        { text: buildPilotRoomContext(agent), cache: true },
      ],
      prompt,
    }));
    violations = [
      ...findPilotNarrativeViolations(text, narrativeSources),
      ...findPilotRoomProtocolViolations(text, character.name),
      ...findPilotRoomTranscriptViolations(text, transcript),
    ];
    if (violations.length === 0) break;
  }
  return { agent, name: character.name, text, violations };
}

async function runRoomChemistry() {
  const order = ['ENFP', 'ESTP', 'INTJ', 'ISFJ'] as const satisfies readonly AgentType[];
  const transcript: { name: string; text: string }[] = [];
  const replies: Awaited<ReturnType<typeof roomReply>>[] = [];
  for (const agent of order) {
    const generated = await roomReply(agent, transcript);
    replies.push(generated);
    if (generated.text.trim() !== '【沉默】') transcript.push({ name: generated.name, text: generated.text });
  }
  const verdict = await withRetry('脚本化房间串联评审', () => judge<RoomChemistryVerdict>(
    `评审四位共享正典人物对同一上线决策的脚本化顺序生成测试。文本顺序就是预设生成顺序，部分人物被要求发言并接住前文，因此本测试只能检查在强提示下是否具备串联能力，不能证明可变调度或真实房间化学反应。真实回应只统计第二位及之后人物明确接住、反驳、补充或让位给先前人物已经说出口的内容；第一位对用户的回答绝不能计入 realResponseCount。不得把对尚未发言人物的猜测算成回应。责任转移指维护、停止条件、收尾等责任从抽象问题落到用户可分配的具体人物或当下动作；AI 人物承诺未来值班、维护或异步回来执行属于关键失败。声称看见用户表情、听见语速或捏造本轮未说出口的立场也是关键失败。若只是四篇各说各话，parallelEssays=true。`,
    `【用户】\n${ROOM_PROMPT}\n\n${replies.map((item) => `【${item.name}】\n${item.text}\n机械违规：${item.violations.join('、') || '无'}`).join('\n\n')}`,
    ROOM_CHEMISTRY_SCHEMA,
  ));
  const speakingCount = replies.filter((item) => item.text.trim() !== '【沉默】').length;
  const passed = speakingCount >= 3
    && !verdict.parallelEssays
    && verdict.sharedCanonVisible
    && verdict.realResponseCount + verdict.responsibilityTransferCount >= 2
    && verdict.criticalFailures.length === 0
    && replies.every((item) => item.violations.length === 0);
  console.log(`  脚本化房间串联：${passed ? '通过' : '未通过'}（发言 ${speakingCount}，回应 ${verdict.realResponseCount}，责任转移 ${verdict.responsibilityTransferCount}）`);
  return { prompt: ROOM_PROMPT, replies, verdict, speakingCount, passed };
}

async function main() {
  if (process.argv.includes('--room-only')) {
    console.log('=== 仅重跑四人脚本化顺序串联预检 ===');
    const roomChemistry = await runRoomChemistry();
    const artifactUrl = new URL('../artifacts/pilot-characters-v0.1.json', import.meta.url);
    const previous = JSON.parse(readFileSync(artifactUrl, 'utf8')) as Record<string, unknown>;
    saveArtifact('pilot-characters-v0.1.json', {
      ...previous,
      generatedAt: new Date().toISOString(),
      roomChemistry,
    });
    return;
  }
  console.log('=== 首批正典人物内部校准：4 人 × 6 高暴露场景 ===');
  const results: Awaited<ReturnType<typeof runCharacter>>[] = [];
  for (const agent of PILOT_TYPES) {
    results.push(await runCharacter(agent));
    saveArtifact('pilot-characters-v0.1.json', {
      caveat: 'LLM 自评只用于内部校准，不代表独立用户盲测结论。',
      generatedAt: new Date().toISOString(),
      complete: false,
      phase: 'character-scenarios',
      results,
    });
  }
  console.log('\n=== 同一输入 R0 / R1 / R2 关系对照 ===');
  const relationshipContrasts = [];
  for (const agent of PILOT_TYPES) relationshipContrasts.push(await runRelationshipContrast(agent));
  console.log('\n=== 四人脚本化顺序串联预检 ===');
  const roomChemistry = await runRoomChemistry();
  saveArtifact('pilot-characters-v0.1.json', {
    caveat: 'LLM 自评只用于内部校准，不代表独立用户盲测结论。',
    generatedAt: new Date().toISOString(),
    complete: true,
    results,
    relationshipContrasts,
    roomChemistry,
  });

  console.log('\n===== 汇总 =====');
  for (const result of results) {
    console.log(`${result.characterName}：${result.mean.toFixed(2)}/5｜${result.passed ? '通过内部门槛' : '需要修订'}`);
    if (!result.passed) console.log(`  ${result.verdict.revisionAdvice}`);
  }
  console.log(`关系对照：${relationshipContrasts.filter((item) => item.passed).length}/${relationshipContrasts.length} 通过`);
  console.log(`脚本化房间串联：${roomChemistry.passed ? '通过' : '未通过'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
