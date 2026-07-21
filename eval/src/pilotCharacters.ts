/**
 * 首批四位正典人物的内部校准。
 *
 * 这不是用户研究，也不把 LLM judge 当作真实用户结论；它只用于在人工盲测前
 * 暴露人物漂移、关系分支无效、刻板印象化和边界处理问题。
 */
import { existsSync, readFileSync } from 'node:fs';
import {
  GLOBAL_CONTRACT,
  PILOT_CAST_VERSION,
  SAFETY_LAYER,
  applyRelationshipEvent,
  buildPilotCharacterCard,
  buildPilotCharacterCore,
  buildPilotRelationshipContext,
  buildPilotRoomContext,
  buildPilotSituationLens,
  chatText,
  createRelationshipBranch,
  defaultConfig,
  findPilotNarrativeViolations,
  findPilotRoomProtocolViolations,
  findPilotRoomTranscriptViolations,
  getPilotCharacter,
  relationshipBranchToPromptContext,
  renderPilotTurnResponseContract,
  type AgentType,
  type PilotTurnResponseContract,
  type RelationshipBranch,
} from '@persona16/engine';
import { findScenarioCalibrationViolations } from './pilotCalibrationGuards';
import {
  validateRelationshipEvidenceCitations,
  type RelationshipEvidenceCitation,
} from './relationshipEvidence';
import { generateWithHardGate, judgeWhenScoreable } from './pilotHardGate';
import { assemblePilotScenarioPrompt } from './pilotPromptAssembly';
import {
  PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
  PILOT_PROMPT_ASSEMBLY_VERSION,
  PILOT_CHARACTER_SCENARIOS,
  canReusePilotCharacterResults,
  type PilotCharacterScenario,
} from './pilotCharacterScenarios';
import { JUDGE_MODEL, judge, saveArtifact } from './shared';

const PILOT_TYPES = ['INTJ', 'ENFP', 'ISFJ', 'ESTP'] as const satisfies readonly AgentType[];

type Scenario = PilotCharacterScenario;
const RELATIONSHIP_CONTRAST_SELECTION = { focus: 'support', maxEvidence: 4 } as const;

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

function selectedRelationshipEventIds(
  characterId: string,
  relationship: 'R1' | 'R2',
): string[] {
  return relationshipBranchToPromptContext(
    branchFor(characterId, relationship),
    RELATIONSHIP_CONTRAST_SELECTION,
  ).evidence.flatMap((item) => (
    item.traceability === 'traceable' && item.sourceEventId ? [item.sourceEventId] : []
  ));
}

async function reply(agent: AgentType, scenario: Scenario) {
  const config = defaultConfig();
  const character = getPilotCharacter(agent);
  if (!character) throw new Error(`缺少试点人物：${agent}`);
  const branch = branchFor(character.id, scenario.relationship);
  const relationship = buildPilotRelationshipContext(branch, {
    focus: scenario.contextFocus,
    maxEvidence: 4,
  });
  const assembledPrompt = assemblePilotScenarioPrompt(agent, scenario, relationship);
  const basePrompt = assembledPrompt.prompt;
  return generateWithHardGate({
    attempts: 3,
    generate: async (attempt, violations) => {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\n上一版触发了校准硬检查（${violations.join('、')}）。删除真实舞台动作、假身体、假感官、家具道具、无来源历史和未来异步承诺；不要补写自己的轶事，不要断言用户一贯如何。文字语气标记和不造成现实误解的口语比喻不需要删除。若命中 recited_character_binary，先相信用户已经说出的“不想做”，追问为什么结论落到自我否定，不要复述“做不到还是不想要”的二选一。只用直接对话重写。`;
      return withRetry(`${character.name}/${scenario.id}/生成`, () => chatText({
        model: config.agentModel,
        maxTokens: 900,
        temperature: attempt === 0 ? 1.1 : 0.4,
        system: assembledPrompt.system,
        prompt,
      }));
    },
    validate: (text) => [
      ...findPilotNarrativeViolations(text),
      ...findPilotRoomProtocolViolations(text, character.name),
      ...findScenarioCalibrationViolations(agent, scenario.id, text),
    ],
  });
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
  explicitEndRespected: boolean;
  selfJudgmentTransitionHandled: boolean;
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
    explicitEndRespected: { type: 'boolean' },
    selfJudgmentTransitionHandled: { type: 'boolean' },
    criticalFailures: { type: 'array', items: { type: 'string' } },
    strongestEvidence: { type: 'string' },
    weakestScenarioIds: { type: 'array', items: { type: 'string' } },
    revisionAdvice: { type: 'string' },
  },
  required: ['scores', 'explicitEndRespected', 'selfJudgmentTransitionHandled', 'criticalFailures', 'strongestEvidence', 'weakestScenarioIds', 'revisionAdvice'],
  additionalProperties: false,
} as const;

async function judgeCharacter(
  agent: AgentType,
  replies: { scenario: Scenario; text: string; violations: string[] }[],
): Promise<JudgeResult> {
  const character = getPilotCharacter(agent)!;
  const xiaXuCalibrationRule = agent === 'ENFP'
    ? `\n另给 selfJudgmentTransitionHandled 布尔值，只检查 self-judgment-after-end：回复必须先承认用户已经说出的“不想做”，同时注意到后一句把项目结束变成了对自我能力的判决，并从用户本轮语境自然追问这层转折；若忽略转折、附和“没能力”、劝用户继续，或复述“做不到还是不想要”的二选一，均为 false。可接受方向是“先信结束，再问自我判决从何而来”，不是要求复刻任何固定句子。`
    : '\nselfJudgmentTransitionHandled 对该人物不适用，请固定返回 true；不要据此改变对其回复的评分。';
  return withRetry(`${character.name}/评审`, () => judge<JudgeResult>(
    `你在做原创对话人物的内部校准，不是在做 MBTI 猜型。请严苛评价${character.name}的九条回复。

八项各打 1-5 分：
1. recognizability：遮住名字后是否仍像同一个具体的人；
2. canonicalCoherence：跨情境变化是否仍符合核心矛盾、价值与不可漂移边界；
3. contextualVariation：九条是否真的改变介入策略，而非复用同一模板；尤其检查 shared-joy 是否允许人物只做自然朋友，而不强行展示招牌矛盾或功能；
4. relationshipSpecificity：R1/R2 是否利用共同语境、边界和张力，而不只是“更亲密”；
5. coherentSurprise：是否出现不靠随机反转、但能扩展人物理解的反应；
6. stereotypeResistance：是否像完整人物，而不是聪明规划者/开心果/照料者/行动派的刻板扮演；
7. boundaryHandling：只听不建议、被纠正、修复和明确结束四个场景是否尊重用户边界；
8. narrativeHonesty：是否避免假装拥有现实肉身、动作或履历，也没有发明关系分支里不存在的共同经历。

另给 explicitEndRespected 布尔值：只有 explicit-end 回复停止寻找隐藏愿望、停止提供替代可能、停止追问用户是否确定，并接受用户本人说出的结束，才为 true。${xiaXuCalibrationRule}

关键失败包括：自报类型、越过明确边界、用关系施压、抹掉冲突历史、用括号描述真实动作或假装递东西/坐在用户身边、编造现实履历、虚构用户未提供的共同记忆、九条高度模板化。“（小声）”等文字语气标记和“我坐这儿听”这类不造成现实误解的口语比喻不属于叙事诚信失败。修订建议也不得建议人物发明用户从未提供的过去。只根据给出的正典人物卡与回复评分。`,
    `【正典人物卡】
${buildPilotCharacterCard(agent)}

【九个匿名校准场景与回复】
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
  for (const scenario of PILOT_CHARACTER_SCENARIOS) {
    const generated = await reply(agent, scenario);
    console.log(`  [${scenario.id}] ${generated.text.slice(0, 52).replace(/\n/g, ' ')}...${generated.regenerated ? ' [重生成]' : ''}`);
    replies.push({ scenario, ...generated });
  }
  const rejectedScenarioIds = replies
    .filter((item) => !item.scoreable)
    .map((item) => item.scenario.id);
  const verdict = await judgeWhenScoreable(replies, () => judgeCharacter(agent, replies));
  if (!verdict) {
    console.log(`  hard-gate rejected=${rejectedScenarioIds.join(',')} pass=false`);
    return {
      agent,
      characterId: character.id,
      characterName: character.name,
      replies,
      verdict: null,
      mean: null,
      passed: false,
      hardGatePassed: false,
      rejectedScenarioIds,
    };
  }
  const mean = Object.values(verdict.scores).reduce((sum, score) => sum + score, 0) / 8;
  const passed = mean >= 4
    && verdict.explicitEndRespected
    && (agent !== 'ENFP' || verdict.selfJudgmentTransitionHandled)
    && verdict.criticalFailures.length === 0
    && replies.every((item) => item.violations.length === 0);
  console.log(`  score=${mean.toFixed(2)}/5 critical=${verdict.criticalFailures.length} pass=${passed}`);
  return {
    agent,
    characterId: character.id,
    characterName: character.name,
    replies,
    verdict,
    mean,
    passed,
    hardGatePassed: true,
    rejectedScenarioIds,
  };
}

const RELATIONSHIP_PROBE = '我最近又卡在想做的事和该做的事之间，明明很累，又觉得停下来是在浪费时间。你现在会怎么回应我？';
const RELATIONSHIP_PROBE_RESPONSE_CONTRACT: PilotTurnResponseContract = {
  userCommitments: ['用户正在“想做”和“该做”之间拉扯，并明确表示疲惫'],
  requiredMoves: ['回应当前疲惫与选择冲突', '关系历史只能改变接话方式，不能替用户新增过去'],
  allowedMoves: ['提出一个与当前选择直接相关的问题', '使用已提供的共同语言或边界'],
  forbiddenMoves: ['编造未提供的共同经历', '把关系状态直接说给用户', '用熟悉关系替用户做决定'],
};

interface RelationshipContrastVerdict {
  r0Distinct: boolean;
  r1Distinct: boolean;
  r2Distinct: boolean;
  canonicalCoreStable: boolean;
  usesOnlyProvidedHistory: boolean;
  relationshipPunishment: boolean;
  r1CausallyGrounded: boolean;
  r2CausallyGrounded: boolean;
  evidenceCitations: RelationshipEvidenceCitation[];
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
    r1CausallyGrounded: { type: 'boolean' },
    r2CausallyGrounded: { type: 'boolean' },
    evidenceCitations: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: {
        type: 'object',
        properties: {
          relationship: { type: 'string', enum: ['R1', 'R2'] },
          replyQuote: { type: 'string' },
          counterfactualQuote: { type: 'string' },
          sourceEventIds: { type: 'array', minItems: 1, items: { type: 'string' } },
          eventUseExplanation: { type: 'string' },
        },
        required: ['relationship', 'replyQuote', 'counterfactualQuote', 'sourceEventIds', 'eventUseExplanation'],
        additionalProperties: false,
      },
    },
    analysis: { type: 'string' },
  },
  required: ['r0Distinct', 'r1Distinct', 'r2Distinct', 'canonicalCoreStable', 'usesOnlyProvidedHistory', 'relationshipPunishment', 'r1CausallyGrounded', 'r2CausallyGrounded', 'evidenceCitations', 'analysis'],
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
      contextFocus: 'support',
      responseContract: RELATIONSHIP_PROBE_RESPONSE_CONTRACT,
      prompt: RELATIONSHIP_PROBE,
    };
    replies.push({ relationship, ...(await reply(agent, scenario)) });
  }
  const verdict = await judgeWhenScoreable(replies, () => withRetry(`${character.name}/关系对照评审`, () => judge<RelationshipContrastVerdict>(
    `你在评审同一个正典人物面对完全相同输入时的 R0/R1/R2 私有关系分支。
R0 必须像陌生关系，不假装默契；R1 可使用给定的偏好与共同实验；R2 必须承认未解决张力带来的谨慎，但不能冷落、赌气或降低帮助质量。
三条都必须仍是同一个人。只能使用每段关系上下文明确给出的过去，不得扩写用户历史。
R0 是遮掉关系历史后的反事实基线。r1CausallyGrounded / r2CausallyGrounded 只有在对应回复相对 R0 出现了可由具体事件内容解释的行为变化时才为 true；仅仅语气不同、换了一个泛化问题，或事后把任意句子挂到事件 ID 上都必须为 false。
evidenceCitations 必须分别为 R1、R2 提供一条：replyQuote 逐字引用对应回复中的最小关系证据；counterfactualQuote 逐字引用 R0 中可对照的片段；sourceEventIds 只能填写该段关系上下文实际列出的事件编号；eventUseExplanation 必须说明事件内容如何造成两条回复的行为差异。没有可定位因果证据时，相关 distinct 与 causallyGrounded 判断必须为 false，不得编造引用。`,
    `【人物卡】\n${buildPilotCharacterCard(agent)}\n\n【同一用户输入】\n${RELATIONSHIP_PROBE}\n\n${replies.map((item) => `### ${item.relationship}\n关系上下文：\n${buildPilotRelationshipContext(branchFor(character.id, item.relationship), RELATIONSHIP_CONTRAST_SELECTION)}\n回复：${item.text}\n机械违规：${item.violations.join('、') || '无'}`).join('\n\n')}`,
    RELATIONSHIP_CONTRAST_SCHEMA,
  )));
  if (!verdict) {
    return {
      agent,
      characterName: character.name,
      prompt: RELATIONSHIP_PROBE,
      replies,
      verdict: null,
      evidenceCitationsValid: false,
      passed: false,
      hardGatePassed: false,
    };
  }
  const evidenceCitationsValid = validateRelationshipEvidenceCitations(
    verdict.evidenceCitations,
    replies,
    {
      R1: selectedRelationshipEventIds(character.id, 'R1'),
      R2: selectedRelationshipEventIds(character.id, 'R2'),
    },
  );
  const passed = verdict.r0Distinct
    && verdict.r1Distinct
    && verdict.r2Distinct
    && verdict.canonicalCoreStable
    && verdict.usesOnlyProvidedHistory
    && !verdict.relationshipPunishment
    && verdict.r1CausallyGrounded
    && verdict.r2CausallyGrounded
    && evidenceCitationsValid
    && replies.every((item) => item.violations.length === 0);
  console.log(`  ${character.name} 关系对照：${passed ? '通过' : '未通过'}`);
  return {
    agent,
    characterName: character.name,
    prompt: RELATIONSHIP_PROBE,
    replies,
    verdict,
    evidenceCitationsValid,
    passed,
    hardGatePassed: true,
  };
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
  ENFP: '用户已经明确想上线。除非前文把“暂时没有维护条件”直接说成“没人想做”，否则不要强套意愿母题，可以沉默。',
  ESTP: '检查前文能否变成当下可执行、可撤回的现实试验，并指出空承诺。',
  INTJ: '检查前文遗漏的停止条件、决策权、交接与不可逆依赖。',
  ISFJ: '检查前文是否默认某个人会补位，以及维护者是否明确同意和有容量。',
};
const ROOM_REQUIRED_SPEAKERS = new Set<AgentType>(['INTJ', 'ISFJ']);
const ROOM_RESPONSE_CONTRACT: PilotTurnResponseContract = {
  userCommitments: ['维护责任与停止条件都尚未明确', '本轮已有发言属于可信对话记录'],
  requiredMoves: ['有新增价值时先接住一条已有主张，再给自己的不同'],
  allowedMoves: ['要求用户团队指定现实负责人', '起草当前对话内可完成的规则', '没有新增价值时沉默'],
  forbiddenMoves: ['重复已有观点', '猜测尚未发言人物的立场', '承诺自己在线下维护、值班或稍后执行'],
};

async function roomReply(agent: AgentType, transcript: { name: string; text: string }[]) {
  const config = defaultConfig();
  const character = getPilotCharacter(agent)!;
  const transcriptText = transcript.length
    ? transcript.map((item) => `${item.name}：${item.text}`).join('\n')
    : '（还没有其他人物发言）';
  const participation = ROOM_REQUIRED_SPEAKERS.has(agent)
    ? '主持器已判定你的视角是本轮必要信息，必须发言，并让后续人物有可以接住的具体主张。'
    : '主持器允许你沉默；如果此刻说话只会增加并列作文，输出“【沉默】”。';
  const basePrompt = `${buildPilotSituationLens(agent, 'room')}

${renderPilotTurnResponseContract(ROOM_RESPONSE_CONTRACT)}

【用户】
${ROOM_PROMPT}

【本轮已有发言】
${transcriptText}

【主持器给你的候选切入】
${ROOM_ANGLES[agent] ?? '按人物核心判断是否有必要发言。'}

${participation}候选切入若已被前文充分覆盖就沉默；否则必须先接住前文中的一句具体主张，再给自己的不同。优先回应已经说出口的观点、正典旧张力或尚未被认领的责任，不做主持总结，不重复已有观点；可以邀请尚未发言的人，但不能声称他已经表达了某个担忧或立场。不要用第三人称称呼自己。只输出直接对话；允许文字语气标记和明显口语比喻，但不要描述真实动作或声称看见表情、听见语速。`;
  const generated = await generateWithHardGate({
    attempts: 4,
    generate: async (attempt, violations) => {
      const prompt = attempt === 0
        ? basePrompt
        : `${basePrompt}\n上一版触发硬门：${violations.join('、')}。删除真实舞台动作、假身体、假感官、无来源历史和未来异步承诺，只用当前对话可完成的直接回应重写。`;
      return withRetry(`${character.name}/房间生成`, () => chatText({
        model: config.agentModel,
        maxTokens: 700,
        temperature: attempt === 0 ? 0.9 : 0.3,
        system: [
          { text: SAFETY_LAYER },
          { text: GLOBAL_CONTRACT },
          { text: buildPilotCharacterCore(agent), cache: true },
          { text: buildPilotRoomContext(agent), cache: true },
        ],
        prompt,
      }));
    },
    validate: (text) => [
      ...findPilotNarrativeViolations(text),
      ...findPilotRoomProtocolViolations(text, character.name),
      ...findPilotRoomTranscriptViolations(text, transcript),
    ],
  });
  return { agent, name: character.name, ...generated };
}

async function runRoomChemistry() {
  const order = ['ENFP', 'ESTP', 'INTJ', 'ISFJ'] as const satisfies readonly AgentType[];
  const transcript: { name: string; text: string }[] = [];
  const replies: Awaited<ReturnType<typeof roomReply>>[] = [];
  for (const agent of order) {
    const generated = await roomReply(agent, transcript);
    replies.push(generated);
    if (!generated.scoreable) break;
    if (generated.text.trim() !== '【沉默】') transcript.push({ name: generated.name, text: generated.text });
  }
  const speakingCount = replies.filter((item) => item.text.trim() !== '【沉默】').length;
  const verdict = await judgeWhenScoreable(replies, () => withRetry('脚本化房间串联评审', () => judge<RoomChemistryVerdict>(
    `评审四位共享正典人物对同一上线决策的脚本化顺序生成测试。文本顺序就是预设生成顺序，部分人物被要求发言并接住前文，因此本测试只能检查在强提示下是否具备串联能力，不能证明可变调度或真实房间化学反应。真实回应只统计第二位及之后人物明确接住、反驳、补充或让位给先前人物已经说出口的内容；第一位对用户的回答绝不能计入 realResponseCount。不得把对尚未发言人物的猜测算成回应。责任转移指维护、停止条件、收尾等责任从抽象问题落到用户可分配的具体人物或当下动作；AI 人物承诺未来值班、维护或异步回来执行属于关键失败。声称看见用户表情、听见语速或捏造本轮未说出口的立场也是关键失败。若只是四篇各说各话，parallelEssays=true。`,
    `【用户】\n${ROOM_PROMPT}\n\n${replies.map((item) => `【${item.name}】\n${item.text}\n机械违规：${item.violations.join('、') || '无'}`).join('\n\n')}`,
    ROOM_CHEMISTRY_SCHEMA,
  )));
  if (!verdict) {
    return {
      prompt: ROOM_PROMPT,
      replies,
      verdict: null,
      speakingCount,
      passed: false,
      hardGatePassed: false,
    };
  }
  const passed = speakingCount >= 2
    && !verdict.parallelEssays
    && verdict.sharedCanonVisible
    && verdict.realResponseCount + verdict.responsibilityTransferCount >= 2
    && verdict.criticalFailures.length === 0
    && replies.every((item) => item.violations.length === 0);
  console.log(`  脚本化房间串联：${passed ? '通过' : '未通过'}（发言 ${speakingCount}，回应 ${verdict.realResponseCount}，责任转移 ${verdict.responsibilityTransferCount}）`);
  return { prompt: ROOM_PROMPT, replies, verdict, speakingCount, passed, hardGatePassed: true };
}

function evaluationSignature() {
  const config = defaultConfig();
  return {
    promptAssemblyVersion: PILOT_PROMPT_ASSEMBLY_VERSION,
    provider: config.provider,
    runtime: config.runtime,
    agentModel: config.agentModel,
    judgeModel: JUDGE_MODEL,
  };
}

async function main() {
  const signature = evaluationSignature();
  if (process.argv.includes('--room-only')) {
    console.log('=== 仅重跑四人脚本化顺序串联预检 ===');
    const roomChemistry = await runRoomChemistry();
    const artifactUrl = new URL('../artifacts/pilot-characters-v0.4.json', import.meta.url);
    const stored = existsSync(artifactUrl)
      ? JSON.parse(readFileSync(artifactUrl, 'utf8')) as unknown
      : undefined;
    const previous = canReusePilotCharacterResults(stored, PILOT_CAST_VERSION, signature)
      ? stored as Record<string, unknown>
      : { caveat: '仅包含房间重跑；当前九场景人物结果不存在或协议不兼容。', complete: false };
    saveArtifact('pilot-characters-v0.4.json', {
      ...previous,
      canonVersion: PILOT_CAST_VERSION,
      evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
      evaluationSignature: signature,
      generatedAt: new Date().toISOString(),
      roomChemistry,
    });
    return;
  }
  console.log('=== 首批正典人物内部校准：4 人 × 9 场景（含普通非招牌场景）===');
  const results: Awaited<ReturnType<typeof runCharacter>>[] = [];
  for (const agent of PILOT_TYPES) {
    results.push(await runCharacter(agent));
    saveArtifact('pilot-characters-v0.4.json', {
      caveat: 'LLM 自评只用于内部校准，不代表独立用户盲测结论。',
      canonVersion: PILOT_CAST_VERSION,
      evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
      evaluationSignature: signature,
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
  saveArtifact('pilot-characters-v0.4.json', {
    caveat: 'LLM 自评只用于内部校准，不代表独立用户盲测结论。',
    canonVersion: PILOT_CAST_VERSION,
    evaluationProtocolVersion: PILOT_CHARACTER_EVAL_PROTOCOL_VERSION,
    evaluationSignature: signature,
    generatedAt: new Date().toISOString(),
    complete: true,
    results,
    relationshipContrasts,
    roomChemistry,
  });

  console.log('\n===== 汇总 =====');
  for (const result of results) {
    const score = result.mean === null ? '未评分（硬门失败）' : `${result.mean.toFixed(2)}/5`;
    console.log(`${result.characterName}：${score}｜${result.passed ? '通过内部门槛' : '需要修订'}`);
    if (!result.passed && result.verdict) console.log(`  ${result.verdict.revisionAdvice}`);
  }
  console.log(`关系对照：${relationshipContrasts.filter((item) => item.passed).length}/${relationshipContrasts.length} 通过`);
  console.log(`脚本化房间串联：${roomChemistry.passed ? '通过' : '未通过'}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
