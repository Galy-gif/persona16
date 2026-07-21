import { checkUtterance, recordOpening } from './antiTemplate';
import { randomUUID } from 'node:crypto';
import { runDirector } from './director';
import { chatText, defaultConfig } from './llm';
import { buildSystemBlocks, buildTurnPrompt } from './prompt';
import { createLlmRoomController } from './room/roomController';
import { runRoomLoop } from './room/roomLoop';
import type { RoomAction, RoomController, RoomLoopBudget } from './room/types';
import { runRuntimeText } from './runtime/runRuntimeText';
import { RuntimeExecutionError } from './runtime/recoveryPolicy';
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
import type { AgentRuntime } from './runtime/agentRuntime';
import type { SafetyLevel } from './safety/safetyRouter';
import { createModelBudget, type ModelBudget } from './runtime/modelBudget';
import {
  invokeDelivery,
  invokeObserver,
  type ObserverErrorHandler,
} from './lifecycleHooks';
import { relationshipEvidenceProtectsDecisionAutonomy } from './relationship/relationshipContext';

export interface RunTurnOptions {
  /** 用户本轮点名的 Agent */
  calledAgent?: AgentType;
  /** 以下回调是 streaming Delivery Sink；失败会显式终止投递，不按 Observer 吞错。 */
  onDelta?: (speaker: AgentType, delta: string) => void;
  onSpeakerStart?: (speaker: AgentType, plan: SpeakerPlan) => void;
  onSpeakerEnd?: (utterance: AgentUtterance, messageId: string) => void;
  onRoomAction?: (action: RoomAction) => void;
  onTurnEnd?: (stopReason: TurnResult['loop']['stopReason']) => void;
  /** Trace 等非关键观察者失败时的隔离报告。 */
  onObserverError?: ObserverErrorHandler;
  roomId?: string;
  turnId?: string;
  promptVersion?: string;
  signal?: AbortSignal;
  /** 预处理安全级别；sensitive 会降低刺激但保留人格核心。crisis/blocked 应在调用引擎前旁路。 */
  safetyMode?: SafetyLevel;
}

export interface EngineDependencies {
  runtime?: AgentRuntime;
  roomController?: RoomController;
  roomLoopBudget?: Partial<RoomLoopBudget>;
  modelBudget?: ModelBudget;
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
  runtime: AgentRuntime | undefined,
  turnId: string,
  modelBudget: ModelBudget,
  maxCharacters: number,
): Promise<AgentUtterance> {
  const agentState = room.agents.find((a) => a.type === speaker.type)!;
  const relationshipContext = agentState.relationship.promptContext;
  const protectsDecisionAutonomy = relationshipContext
    ? relationshipEvidenceProtectsDecisionAutonomy(relationshipContext.evidence)
    : false;
  const system = buildSystemBlocks(speaker.type);
  const requestedTokens = speaker.speechType === '长发言' ? 1200 : 400;

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
      safetyMode: opts.safetyMode,
    });
    tracer.emit('agent_prompt', { agent: speaker.type, attempt, prompt });

    const isFinalAttempt = attempt === 1;
    const reservation = modelBudget.reserve(`persona:${speaker.type}:attempt:${attempt}`, requestedTokens);
    let streamedCharacters = 0;
    const onDelta = isFinalAttempt && !protectsDecisionAutonomy
      ? (delta: string) => {
          const remaining = maxCharacters - streamedCharacters;
          if (remaining <= 0) return;
          const bounded = delta.slice(0, remaining);
          streamedCharacters += bounded.length;
          if (bounded) invokeDelivery('delta', opts.onDelta, [speaker.type, bounded]);
        }
      : undefined;
    const text = runtime
      ? await runRuntimeText(runtime, {
          runId: `${turnId}:${speaker.type}:${attempt}:${randomUUID()}`,
          model: { provider: config.provider, id: config.agentModel },
          system,
          messages: [{ role: 'user', content: prompt }],
          temperature: 1.25,
          limits: { maxTurns: 1, maxTokens: reservation.maxTokens, timeoutMs: 60_000 },
          metadata: {
            roomId: opts.roomId ?? 'ephemeral-room',
            turnId,
            agent: speaker.type,
            promptVersion: opts.promptVersion ?? 'unversioned',
          },
        }, {
          signal: reservation.signal(opts.signal),
          onDelta,
          onEvent: (event) => {
            if (event.type === 'usage') {
              reservation.recordUsage({
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                estimatedCostUsd: event.estimatedCostUsd,
              });
            }
            if (event.type !== 'text_delta') {
              tracer.emit('runtime_event', { agent: speaker.type, attempt, runtimeEvent: event });
            }
          },
        })
      : await chatText({
          model: config.agentModel,
          maxTokens: reservation.maxTokens,
          system,
          prompt,
          onDelta,
          signal: reservation.signal(opts.signal),
          onUsage: reservation.recordUsage,
        });
    const boundedText = text.slice(0, maxCharacters);
    tracer.emit('agent_output', { agent: speaker.type, attempt, text: boundedText });

    const verdict = checkUtterance(
      boundedText,
      agentState.recentOpenings,
      relationshipContext,
    );
    if (verdict.ok || (isFinalAttempt && verdict.kind !== 'relationship_boundary')) {
      if (!isFinalAttempt) invokeDelivery('delta', opts.onDelta, [speaker.type, boundedText]);
      else if (streamedCharacters < boundedText.length) {
        invokeDelivery('delta', opts.onDelta, [speaker.type, boundedText.slice(streamedCharacters)]);
      }
      agentState.recentOpenings = recordOpening(boundedText, agentState.recentOpenings);
      return { type: speaker.type, speechType: speaker.speechType, text: boundedText, regenerated };
    }
    if (isFinalAttempt) {
      throw new RuntimeExecutionError({
        code: 'relationship_boundary_violation',
        message: verdict.reason ?? '回复违反已确认的关系边界',
        recoverable: true,
        stopReason: 'error',
        hadPartialText: false,
      });
    }
    tracer.emit('anti_template_reject', { agent: speaker.type, reason: verdict.reason });
    antiTemplateNote = verdict.kind === 'relationship_boundary'
      ? `硬约束重写：上一版回复因为“${verdict.reason}”被拒绝。不能说“选 X”“就选 X”或“你应该选 X”；改为指出关键变量、比较标准、条件性后果或提出一个问题，把决定权留给用户。`
      : `反模板警告：你上一版回复因为"${verdict.reason}"被驳回。换一种完全不同的开场和结构重说，保持人格不变。`;
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
  dependencies: EngineDependencies = {},
): Promise<TurnResult> {
  if (config.runtime === 'pi' && !dependencies.runtime) {
    throw new Error('PERSONA16_RUNTIME=pi requires an AgentRuntime dependency');
  }
  const tracer = createTracer(config.traceFile, (failure) => {
    invokeObserver(
      'observer_error',
      opts.onObserverError,
      [{ hook: `trace_${failure.operation}`, error: failure.error }],
    );
  });
  const turnId = opts.turnId ?? randomUUID();
  const modelBudget = dependencies.modelBudget ?? createModelBudget();
  room.calledAgent = opts.calledAgent;
  room.history.push({ speaker: 'user', text: userMessage });

  const decision = await runDirector(config.directorModel, room, userMessage, { budget: modelBudget, signal: opts.signal });
  tracer.emit('director_decision', { decision });

  const plan = resolveTurnPlan(decision, room);
  tracer.emit('turn_plan', {
    scene: plan.scene,
    userEmotion: plan.userEmotion,
    forceSummary: plan.forceSummary,
    speakers: plan.speakers,
    scores: plan.scores,
  });

  const earlierThisTurn: { type: AgentType; text: string }[] = [];
  const controller = dependencies.roomController ?? createLlmRoomController(config.directorModel, { budget: modelBudget, signal: opts.signal });
  const loop = await runRoomLoop({
    room,
    userMessage,
    plan,
    controller,
    budget: dependencies.roomLoopBudget,
    onAction: (action) => {
      tracer.emit('room_action', { turnId, action });
    },
    onActionEvent: (action) => invokeDelivery('room_action', opts.onRoomAction, [action]),
    onObserverError: opts.onObserverError,
    async execute({ action, speaker, forceSummary, remainingCharacters }) {
      invokeDelivery('speaker_start', opts.onSpeakerStart, [speaker.type, speaker]);
      const effectivePlan = forceSummary ? { ...plan, forceSummary: true } : plan;
      const utterance = await generateUtterance(
        config, room, effectivePlan, speaker, earlierThisTurn, userMessage, tracer, opts,
        dependencies.runtime, turnId, modelBudget, remainingCharacters,
      );
      earlierThisTurn.push({ type: utterance.type, text: utterance.text });
      const messageId = randomUUID();
      room.history.push({ id: messageId, speaker: utterance.type, text: utterance.text, speechType: utterance.speechType });
      invokeDelivery('speaker_end', opts.onSpeakerEnd, [utterance, messageId]);
      tracer.emit('room_action_done', { turnId, action, utterance: { type: utterance.type, speechType: utterance.speechType } });
      return utterance;
    },
  });

  const actualPlan: TurnPlan = {
    ...plan,
    forceSummary: plan.forceSummary || loop.report.stopReason === 'summary_complete',
    speakers: loop.speakers,
  };
  advanceRoomState(room, actualPlan, decision.conflictTopic, loop.report.summaryCount > 0);
  invokeDelivery('turn_end', opts.onTurnEnd, [loop.report.stopReason]);
  tracer.emit('turn_done', {
    stopReason: loop.report.stopReason,
    loop: loop.report,
    utterances: loop.utterances.map((utterance) => ({
      type: utterance.type,
      speechType: utterance.speechType,
      regenerated: utterance.regenerated,
    })),
    modelBudget: modelBudget.snapshot(),
  });

  return { plan: actualPlan, utterances: loop.utterances, loop: loop.report };
}
