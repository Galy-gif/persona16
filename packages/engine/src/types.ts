export const AGENT_TYPES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];
export type Group = 'NT' | 'NF' | 'SJ' | 'SP';

/** 语气引擎的 7 个采样维度，1-5 分（对应 persona spec 的语气基线） */
export interface ToneDims {
  /** 回合长度：1 短句补充 → 5 连续展开 */
  turnLength: number;
  /** 延展欲：1 问一句答一句 → 5 主动拉旁支 */
  expansion: number;
  /** 刺感：1 顺着说 → 5 调侃反问拆台 */
  bite: number;
  /** 温柔度：1 直接硬 → 5 先接住情绪 */
  warmth: number;
  /** 呆感：1 反应快 → 5 停顿卡壳抓奇怪细节 */
  daze: number;
  /** 抽象度：1 讲动作事实 → 5 讲结构意义隐喻 */
  abstraction: number;
  /** 主动性：1 等用户继续 → 5 自己推进点名别人 */
  initiative: number;
}

export interface PersonaSpec {
  type: AgentType;
  group: Group;
  /** 工作称号（原创名未定前的外显名） */
  title: string;
  /** 首屏人格钩子，一句话 */
  hook: string;
  coreIdentity: string;
  toneBaseline: ToneDims;
  /** 触发后的语气变化说明 */
  toneTriggerNote: string;
  attentionFilters: string[];
  interpretationHabits: string[];
  actionImpulses: string[];
  speakWhen: string[];
  silentWhen: string[];
  relationshipMemory: string[];
  dynamicShifts: string[];
  roomInteractions: string[];
  /** 内部 prompt 片段（spec 原文） */
  innerPrompt: string;
  forbidden: string[];
}

export type Scene = '求助' | '吐槽' | '冲突' | '决策' | '陪伴' | '创作' | '复盘' | '闲聊';
export type UserEmotion = '稳定' | '低落' | '脆弱' | '激动' | '危险';
export type SpeechType = '长发言' | '短句' | '追问' | '反驳' | '沉默';
export type RoomGoal = '听见反方' | '陪我想清楚' | '更有行动感' | '安静一点' | '自由碰撞';

export interface RelationshipMemory {
  /** 0-5，亲密度 */
  intimacy: number;
  userPrefers: string[];
  repeatedPatterns: string[];
  knownBoundaries: string[];
}

export interface TurnMessage {
  speaker: 'user' | AgentType;
  text: string;
  speechType?: SpeechType;
}

export interface RoomAgentState {
  type: AgentType;
  paused: boolean;
  /** 距离上次发言过了几轮；999 表示从未发言 */
  turnsSinceSpoke: number;
  /** 加入房间后经过的轮数（0 = 本轮刚加入） */
  turnsInRoom: number;
  /** 最近几次发言的开头，用于反模板检测 */
  recentOpenings: string[];
  relationship: RelationshipMemory;
}

export interface RoomState {
  agents: RoomAgentState[];
  history: TurnMessage[];
  roomGoal?: RoomGoal;
  /** 当前争论话题（无争论为 null） */
  conflictTopic: string | null;
  /** 同一争论持续的轮数 */
  conflictRounds: number;
  /** 用户本轮点名的 Agent */
  calledAgent?: AgentType;
}

/** 导演模型对单个 Agent 的原始评估（确定性调整前） */
export interface DirectorAgentAssessment {
  type: AgentType;
  /** 0-85：话题相关性+独特洞察+分歧+需求匹配+关系牵引+人格主动性 的综合 */
  baseImpulse: number;
  /** 想说什么角度，一句话 */
  angle: string;
  suggestedSpeechType: SpeechType;
  /** 相对基线的语气偏移，最多 2 个维度 */
  toneShift?: Partial<ToneDims>;
}

export interface DirectorDecision {
  scene: Scene;
  userEmotion: UserEmotion;
  /** 本轮是否存在需要收束的争论 */
  conflictTopic: string | null;
  /** 争论超限时导演要求先收束 */
  forceSummary: boolean;
  assessments: DirectorAgentAssessment[];
}

/** 确定性评分后的最终发言安排 */
export interface SpeakerPlan {
  type: AgentType;
  speechType: SpeechType;
  finalScore: number;
  angle: string;
  toneShift?: Partial<ToneDims>;
}

export interface TurnPlan {
  scene: Scene;
  userEmotion: UserEmotion;
  forceSummary: boolean;
  speakers: SpeakerPlan[];
  /** 全部评分明细，供 tracing */
  scores: { type: AgentType; base: number; adjusted: number; detail: string }[];
}

export interface AgentUtterance {
  type: AgentType;
  speechType: SpeechType;
  text: string;
  regenerated: boolean;
}

export interface TurnResult {
  plan: TurnPlan;
  utterances: AgentUtterance[];
}

export interface EngineConfig {
  provider: 'anthropic' | 'deepseek';
  agentModel: string;
  directorModel: string;
  /** JSONL trace 文件路径，不设则不落盘 */
  traceFile?: string;
}
