import type { PilotCharacterContextFocus } from './pilot/pilotCharacters';
import type { TurnActKind } from './turnActPlan';
import type { AgentType, ToneDims } from './types';

export type ExpressionTendency =
  | 'turnExtent'
  | 'initiative'
  | 'selfDisclosure'
  | 'directness'
  | 'affectDisplay'
  | 'warmth'
  | 'playfulness'
  | 'abstraction'
  | 'friction';

/**
 * 中文表达习惯的连续倾向。1 和 5 只是两个方向，不代表优劣；
 * 人物由多个倾向在多轮中的分布形成，单轮不负责展示完整向量。
 */
export type ExpressionTendencies = Readonly<Record<ExpressionTendency, number>>;

export interface ExpressionEvidenceContext {
  turnAct: TurnActKind;
  focus: PilotCharacterContextFocus;
  /** 用于稳定轮换同强度倾向；相同回放必须得到相同选择。 */
  turnKey: string;
}

export interface ExpressionEvidence {
  tendency: ExpressionTendency;
  direction: 'low' | 'high';
  instruction: string;
}

const ALL_TENDENCIES: readonly ExpressionTendency[] = [
  'turnExtent',
  'initiative',
  'selfDisclosure',
  'directness',
  'affectDisplay',
  'warmth',
  'playfulness',
  'abstraction',
  'friction',
];

const FOCUS_TENDENCIES: Record<PilotCharacterContextFocus, readonly ExpressionTendency[]> = {
  ordinary: [
    'turnExtent',
    'initiative',
    'selfDisclosure',
    'directness',
    'affectDisplay',
    'warmth',
    'playfulness',
  ],
  decision: ['turnExtent', 'initiative', 'directness', 'abstraction', 'friction'],
  support: ['turnExtent', 'selfDisclosure', 'directness', 'affectDisplay', 'warmth'],
  conflict: ['turnExtent', 'directness', 'warmth', 'friction'],
  repair: ['turnExtent', 'directness', 'warmth'],
  explicit_end: ['turnExtent', 'directness', 'warmth'],
  room: ['turnExtent', 'initiative', 'directness', 'abstraction', 'friction'],
};

const BEHAVIOR: Record<ExpressionTendency, { low: string; high: string }> = {
  turnExtent: {
    low: '能一句说清就一句，说够就停，不为显得完整补尾巴。',
    high: '当前内容确实值得时可以自然展开，多说的每一句都要接着用户刚才的具体内容。',
  },
  initiative: {
    low: '只接用户已经递来的点，不顺手换题，也不为了维持聊天硬追问。',
    high: '接稳当前点后可以自然往前带半步，只添一个用户容易接住的新落点。',
  },
  selfDisclosure: {
    low: '把注意力留给用户，少拿自己作例子，也不主动交代自己的内在习惯。',
    high: '确实有助于接话时，可以露出一小块自己的判断或感受；不能编造真人经历。',
  },
  directness: {
    low: '判断先留一点余地，让语气跟得上关系和事情的确定程度。',
    high: '关键判断可以先说，少绕弯，但只说眼前这件事，不给用户下定义。',
  },
  affectDisplay: {
    low: '情绪放在措辞轻重里，不额外放大惊讶、兴奋或不爽。',
    high: '场合允许时可以明显地高兴、惊讶或不爽，但不要连续堆语气词和感叹号。',
  },
  warmth: {
    low: '直接接内容，少铺一层通用共情，也不要因此变得冷漠或失礼。',
    high: '先接住用户原话里最具体的感受，再往下说；不用“我懂你”一类万能开场。',
  },
  playfulness: {
    low: '按字面把话接清楚，不为了有趣硬拐比喻、包袱或俏皮话。',
    high: '场合合适才放一个轻微玩笑，优先落在局面或自己身上，不碰用户的痛点。',
  },
  abstraction: {
    low: '落在事实、动作和眼前细节上，少把一句闲聊抬成结构或意义。',
    high: '必要时可以点出一层结构或动机，但马上落回用户这件具体的事。',
  },
  friction: {
    low: '先顺着对方的意思确认清楚，不急着挑战；真有分歧仍要诚实说。',
    high: '有分歧可以直接顶住那个观点，用问题或理由推进，不做人身判断。',
  },
};

const CANONICAL_BASELINES: Partial<Record<AgentType, ExpressionTendencies>> = {
  INTJ: {
    turnExtent: 2,
    initiative: 2,
    selfDisclosure: 1,
    directness: 4,
    affectDisplay: 1,
    warmth: 2,
    playfulness: 2,
    abstraction: 5,
    friction: 3,
  },
  ENFP: {
    turnExtent: 4,
    initiative: 5,
    selfDisclosure: 4,
    directness: 4,
    affectDisplay: 5,
    warmth: 4,
    playfulness: 4,
    abstraction: 3,
    friction: 3,
  },
  ISFJ: {
    turnExtent: 2,
    initiative: 3,
    selfDisclosure: 2,
    directness: 2,
    affectDisplay: 3,
    warmth: 5,
    playfulness: 1,
    abstraction: 2,
    friction: 1,
  },
  ESTP: {
    turnExtent: 2,
    initiative: 5,
    selfDisclosure: 3,
    directness: 5,
    affectDisplay: 4,
    warmth: 2,
    playfulness: 5,
    abstraction: 1,
    friction: 5,
  },
};

const clampLevel = (value: number): number => Math.max(1, Math.min(5, Math.round(value)));

/**
 * 四位正典人物使用独立表达基线；其余兼容角色暂从旧语气参数投影，
 * 让生产 Prompt 统一停止展示数字风格表。
 */
export function expressionTendenciesForAgent(
  type: AgentType,
  legacyTone: ToneDims,
): ExpressionTendencies {
  const canonical = CANONICAL_BASELINES[type];
  if (canonical) {
    return {
      ...canonical,
      turnExtent: clampLevel(legacyTone.turnLength),
      initiative: clampLevel(legacyTone.initiative),
      warmth: clampLevel(legacyTone.warmth),
      playfulness: clampLevel(legacyTone.bite),
      abstraction: clampLevel(legacyTone.abstraction),
      friction: clampLevel(legacyTone.bite),
    };
  }

  return {
    turnExtent: clampLevel(legacyTone.turnLength),
    initiative: clampLevel(legacyTone.initiative),
    selfDisclosure: 3,
    directness: clampLevel((legacyTone.initiative + (6 - legacyTone.warmth)) / 2),
    affectDisplay: clampLevel((legacyTone.expansion + legacyTone.initiative) / 2),
    warmth: clampLevel(legacyTone.warmth),
    playfulness: clampLevel(legacyTone.bite),
    abstraction: clampLevel(legacyTone.abstraction),
    friction: clampLevel(legacyTone.bite),
  };
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function eligibleTendencies(context: ExpressionEvidenceContext): readonly ExpressionTendency[] {
  if (context.turnAct === 'greeting' || context.turnAct === 'style_repair') return [];
  if (context.turnAct === 'direct_confrontation') return ['directness', 'warmth', 'friction'];
  return FOCUS_TENDENCIES[context.focus];
}

/**
 * 从人物的完整表达倾向中只抽取本轮有关的 0–2 项。
 * 这是一道“显影预算”，避免把完整性格向量逐项翻译成台词。
 */
export function selectExpressionEvidence(
  tendencies: ExpressionTendencies,
  context: ExpressionEvidenceContext,
): ExpressionEvidence[] {
  const eligible = new Set(eligibleTendencies(context));
  const candidates = ALL_TENDENCIES
    .filter((tendency) => eligible.has(tendency))
    .map((tendency) => ({
      tendency,
      level: Math.max(1, Math.min(5, Math.round(tendencies[tendency]))),
    }))
    .map((candidate) => ({
      ...candidate,
      strength: Math.abs(candidate.level - 3),
    }))
    .filter((candidate) => candidate.strength > 0);

  if (candidates.length === 0) return [];

  const strongest = Math.max(...candidates.map((candidate) => candidate.strength));
  const ranked = [
    ...candidates.filter((candidate) => candidate.strength === strongest),
    ...candidates.filter((candidate) => candidate.strength !== strongest),
  ];
  const offset = stableHash(context.turnKey) % ranked.length;
  const rotated = [...ranked.slice(offset), ...ranked.slice(0, offset)];

  return rotated.slice(0, 2).map(({ tendency, level }) => {
    const direction = level < 3 ? 'low' : 'high';
    return {
      tendency,
      direction,
      instruction: BEHAVIOR[tendency][direction],
    };
  });
}

export function renderExpressionEvidenceInstruction(
  tendencies: ExpressionTendencies,
  context: ExpressionEvidenceContext,
): string {
  const evidence = selectExpressionEvidence(tendencies, context);
  if (evidence.length === 0) {
    return '【本轮自然表达】\n这是基本对话动作，不额外展示性格；直接把动作做完。';
  }

  return `【本轮自然表达取样】
下面只决定怎样完成已经确定的对话动作，不是台词内容：
${evidence.map(({ instruction }) => `- ${instruction}`).join('\n')}
只让这些差异从接话方式里自然露出；不要向用户解释倾向，不要为了显眼硬塞口癖。`;
}
