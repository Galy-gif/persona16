import { checkUtterance, recordOpening } from './antiTemplate';
import { runDirector } from './director';
import { chatText, defaultConfig } from './llm';
import { buildSystemBlocks, buildTurnPrompt } from './prompt';
import { advanceRoomState, resolveTurnPlan } from './scoring';
import { createTracer, type Tracer } from './trace';
import type {
  AgentType,
  AgentUtterance,
  EngineConfig,
  RoomGoal,
  RoomState,
  SpeakerPlan,
  TurnPlan,
  TurnResult,
} from './types';

export interface RunTurnOptions {
  /** 用户本轮点名的 Agent */
  calledAgent?: AgentType;
  /** 每个 token 片段的回调（speaker + delta），用于 streaming UI */
  onDelta?: (speaker: AgentType, delta: string) => void;
  /** 某个 Agent 开始/结束发言 */
  onSpeakerStart?: (speaker: AgentType, plan: SpeakerPlan) => void;
  onSpeakerEnd?: (utterance: AgentUtterance) => void;
}

export function createRoom(agents: AgentType[], roomGoal?: RoomGoal): RoomState {
  return {
    agents: agents.map((type) => ({
      type,
      paused: false,
      turnsSinceSpoke: 999,
      turnsInRoom: 999, // 创建时即在场的不吃"新入场"加分；后续 addAgent 会设 0
      recentOpenings: [],
      relationship: { intimacy: 0, userPrefers: [], repeatedPatterns: [], knownBoundaries: [] },
    })),
    history: [],
    roomGoal,
    conflictTopic: null,
    conflictRounds: 0,
  };
}

export function addAgent(room: RoomState, type: AgentType): void {
  if (room.agents.some((a) => a.type === type)) return;
  if (room.agents.filter((a) => !a.paused).length >= 3) {
    throw new Error('房间最多 3 个 Agent');
  }
  room.agents.push({
    type,
    paused: false,
    turnsSinceSpoke: 999,
    turnsInRoom: 0,
    recentOpenings: [],
    relationship: { intimacy: 0, userPrefers: [], repeatedPatterns: [], knownBoundaries: [] },
  });
}

export function removeAgent(room: RoomState, type: AgentType): void {
  room.agents = room.agents.filter((a) => a.type !== type);
}

export function setPaused(room: RoomState, type: AgentType, paused: boolean): void {
  const a = room.agents.find((x) => x.type === type);
  if (a) a.paused = paused;
}

async function generateUtterance(
  config: EngineConfig,
  room: RoomState,
  plan: TurnPlan,
  speaker: SpeakerPlan,
  earlierThisTurn: { type: AgentType; text: string }[],
  userMessage: string,
  tracer: Tracer,
  opts: RunTurnOptions,
): Promise<AgentUtterance> {
  const agentState = room.agents.find((a) => a.type === speaker.type)!;
  const system = buildSystemBlocks(speaker.type);
  const maxTokens = speaker.speechType === '长发言' ? 1200 : 400;

  let antiTemplateNote: string | undefined;
  let regenerated = false;

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildTurnPrompt({
      plan,
      room,
      speaker,
      earlierThisTurn,
      userMessage,
      antiTemplateNote,
    });
    tracer.emit('agent_prompt', { agent: speaker.type, attempt, prompt });

    // 第一次尝试先缓冲不外发，通过反模板检查后再整体回放；
    // 重生成的这次直接边生成边外发。
    const isFinalAttempt = attempt === 1;
    const text = await chatText({
      model: config.agentModel,
      maxTokens,
      system,
      prompt,
      onDelta: isFinalAttempt ? (delta) => opts.onDelta?.(speaker.type, delta) : undefined,
    });
    tracer.emit('agent_output', { agent: speaker.type, attempt, text });

    const verdict = checkUtterance(text, agentState.recentOpenings);
    if (verdict.ok || isFinalAttempt) {
      if (!isFinalAttempt) opts.onDelta?.(speaker.type, text);
      agentState.recentOpenings = recordOpening(text, agentState.recentOpenings);
      return { type: speaker.type, speechType: speaker.speechType, text, regenerated };
    }
    tracer.emit('anti_template_reject', { agent: speaker.type, reason: verdict.reason });
    antiTemplateNote = `反模板警告：你上一版回复因为"${verdict.reason}"被驳回。换一种完全不同的开场和结构重说，保持人格不变。`;
    regenerated = true;
  }
  throw new Error('unreachable');
}

/**
 * 跑一轮对话：导演决策 → 确定性评分 → 依次生成发言 → 更新房间状态。
 * 单聊就是只有一个 Agent 的房间。
 */
export async function runTurn(
  room: RoomState,
  userMessage: string,
  opts: RunTurnOptions = {},
  config: EngineConfig = defaultConfig(),
): Promise<TurnResult> {
  const tracer = createTracer(config.traceFile);
  room.calledAgent = opts.calledAgent;
  room.history.push({ speaker: 'user', text: userMessage });

  const decision = await runDirector(config.directorModel, room, userMessage);
  tracer.emit('director_decision', { decision });

  const plan = resolveTurnPlan(decision, room);
  tracer.emit('turn_plan', {
    scene: plan.scene,
    userEmotion: plan.userEmotion,
    forceSummary: plan.forceSummary,
    speakers: plan.speakers,
    scores: plan.scores,
  });

  const utterances: AgentUtterance[] = [];
  const earlierThisTurn: { type: AgentType; text: string }[] = [];

  for (const speaker of plan.speakers) {
    opts.onSpeakerStart?.(speaker.type, speaker);
    const utterance = await generateUtterance(
      config, room, plan, speaker, earlierThisTurn, userMessage, tracer, opts,
    );
    utterances.push(utterance);
    earlierThisTurn.push({ type: utterance.type, text: utterance.text });
    room.history.push({ speaker: utterance.type, text: utterance.text, speechType: utterance.speechType });
    opts.onSpeakerEnd?.(utterance);
  }

  advanceRoomState(room, plan, decision.conflictTopic);
  tracer.emit('turn_done', { utterances: utterances.map((u) => ({ type: u.type, speechType: u.speechType, regenerated: u.regenerated })) });

  return { plan, utterances };
}
