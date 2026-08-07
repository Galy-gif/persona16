import { createHash, randomUUID } from 'node:crypto';
import {
  DeliveryCallbackError,
  ModelBudgetExceededError,
  RuntimeExecutionError,
  applyConfirmedMemories,
  classifySafety,
  clearInjectedMemories,
  createModelBudget,
  createTurnTimingRecorder,
  decideRecoveryAction,
  extractMemoryCandidate,
  runTurn,
  safetyResponse,
  type AgentRuntime,
  type EngineConfig,
  type ModelBudget,
  type RoomState,
  type SafetyDecision,
  type TurnStopReason,
  type TurnTimingRecorder,
} from '@persona16/engine';
import {
  StoreError,
  type FailedTurnObservability,
  type PersonaStore,
  type TurnReservation,
} from '@persona16/store';
import {
  TURN_EVENT_VERSION,
  turnRecoveryDetails,
  type TurnEvent,
  type TurnRecoveryDetails,
  type TurnRequest,
} from '@persona16/turn-protocol';
import { EventDeliveryClosedError, EventQueue } from './eventQueue';
import { appendDurableEvent } from './durableEvents';
import {
  RELATIONSHIP_PROJECTION_READ_TIMEOUT_MS,
  applyRelationshipBranchContexts,
  observeWithin,
  type RelationshipProjection,
} from './relationshipProjection';

export type TurnApplicationStore = Pick<PersonaStore,
  | 'lookupTurn'
  | 'reserveTurn'
  | 'completeTurn'
  | 'failTurn'
  | 'consumeRateLimit'
  | 'listConfirmedMemories'
  | 'listRelationshipBranches'
>;

export interface TurnApplicationDependencies {
  store: TurnApplicationStore;
  config: EngineConfig;
  promptVersion: string;
  buildVersion: string;
  getRuntime: () => Promise<AgentRuntime | undefined>;
  createTiming?: () => TurnTimingRecorder;
}

export interface ExecuteTurnInput {
  request: TurnRequest;
  userId: string;
  clientIp?: string;
  signal: AbortSignal;
}

export interface TurnApplicationError {
  code: string;
  message: string;
  status: number;
  details: TurnRecoveryDetails;
  retryAfterSeconds?: number;
}

export type TurnExecution =
  | { kind: 'rejected'; error: TurnApplicationError }
  | { kind: 'stream'; replay: boolean; events: AsyncIterable<TurnEvent> };

export interface TurnApplication {
  execute(input: ExecuteTurnInput): Promise<TurnExecution>;
}

interface PreparedTurn {
  reservation: Extract<TurnReservation, { kind: 'accepted' }>;
  room: RoomState;
  safety: SafetyDecision;
  modelBudget: ModelBudget;
  relationshipProjection: RelationshipProjection;
}

function reject(
  code: string,
  message: string,
  status: number,
  options: { outcome?: import('@persona16/engine').FailureOutcome; retryAfterSeconds?: number } = {},
): TurnExecution {
  return {
    kind: 'rejected',
    error: {
      code,
      message,
      status,
      details: turnRecoveryDetails(code, status, {
        outcome: options.outcome,
        ...(options.retryAfterSeconds !== undefined
          ? { retryAfterMs: options.retryAfterSeconds * 1_000 }
          : {}),
      }),
      ...(options.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: options.retryAfterSeconds }
        : {}),
    },
  };
}

function conflict(code: string): TurnExecution {
  const messages: Record<string, string> = {
    TURN_IN_PROGRESS: '这个房间正在生成另一轮回复',
    ROOM_VERSION_CONFLICT: '房间已在其他页面更新，请刷新后重试',
    IDEMPOTENCY_MISMATCH: '同一个 turnId 不能用于不同请求',
    TURN_FAILED: '这个 turnId 已失败，请使用新的 turnId 重试',
  };
  return reject(code, messages[code] ?? '请求冲突', 409);
}

function storeFailure(error: unknown): TurnExecution {
  if (error instanceof StoreError) {
    const status = error.code === 'ROOM_NOT_FOUND'
      || error.code === 'MEMORY_NOT_FOUND'
      || error.code === 'MESSAGE_NOT_FOUND'
      ? 404
      : 409;
    return reject(error.code, error.message, status);
  }
  return reject('INTERNAL_ERROR', '服务暂时不可用', 500, { outcome: 'unknown' });
}

function requestHash(value: TurnRequest): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function preprocessingFailureObservability(
  modelBudget: ModelBudget,
  timing: TurnTimingRecorder,
  errorCode: string,
): FailedTurnObservability {
  const budgetSnapshot = modelBudget.snapshot();
  return {
    stopReason: 'error',
    usage: {
      status: budgetSnapshot.actualUsage.calls > 0 ? 'actual_provider_usage' : 'no_provider_usage',
      ...budgetSnapshot.actualUsage,
    },
    latency: timing.snapshot(),
    trace: { v: 1, stage: 'preprocessing', errorCode },
  };
}

function safetyBypass(
  room: RoomState,
  turnId: string,
  text: string,
  level: 'crisis' | 'blocked',
  responseText: string,
): { events: TurnEvent[]; stopReason: TurnStopReason } {
  const recordedAt = new Date().toISOString();
  room.history.push({ id: randomUUID(), createdAt: recordedAt, turnId, speaker: 'user', text });
  room.history.push({ id: randomUUID(), createdAt: recordedAt, turnId, speaker: 'safety', text: responseText });
  return {
    stopReason: 'safety_redirect',
    events: [
      { v: TURN_EVENT_VERSION, turnId, type: 'turn_start' },
      { v: TURN_EVENT_VERSION, turnId, type: 'safety_notice', level, text: responseText },
    ],
  };
}

async function* replayEvents(events: readonly TurnEvent[]): AsyncIterable<TurnEvent> {
  for (const event of events) yield event;
}

class DefaultTurnApplication implements TurnApplication {
  constructor(private readonly dependencies: TurnApplicationDependencies) {}

  async execute(input: ExecuteTurnInput): Promise<TurnExecution> {
    const timing = this.dependencies.createTiming?.() ?? createTurnTimingRecorder();
    const prepared = await this.prepare(input, timing);
    if ('kind' in prepared) return prepared;

    const executionController = new AbortController();
    const abortFromRequest = () => executionController.abort(input.signal.reason);
    if (input.signal.aborted) abortFromRequest();
    else input.signal.addEventListener('abort', abortFromRequest, { once: true });
    const queue = new EventQueue<TurnEvent>(() => {
      executionController.abort(new Error('Turn event consumer cancelled'));
    });
    void this.runPrepared(input, prepared, timing, executionController.signal, queue)
      .finally(() => {
        input.signal.removeEventListener('abort', abortFromRequest);
        queue.close();
      });
    return { kind: 'stream', replay: false, events: queue };
  }

  private async prepare(
    input: ExecuteTurnInput,
    timing: TurnTimingRecorder,
  ): Promise<PreparedTurn | TurnExecution> {
    const { request, userId } = input;
    const { store, config, promptVersion, buildVersion } = this.dependencies;
    const hash = requestHash(request);

    try {
      const lookup = await timing.measure('idempotency_lookup', () => store.lookupTurn({
        userId,
        roomId: request.roomId,
        turnId: request.turnId,
        requestHash: hash,
      }));
      if (lookup.kind === 'replay') {
        return { kind: 'stream', replay: true, events: replayEvents(lookup.events) };
      }
      if (lookup.kind === 'conflict') return conflict(lookup.code);
    } catch (error) {
      return storeFailure(error);
    }

    let userRate: { allowed: boolean; retryAfterSeconds: number } | undefined;
    let ipRate: { allowed: boolean; retryAfterSeconds: number } | undefined;
    try {
      await timing.measure('rate_limit', async () => {
        ipRate = input.clientIp
          ? await store.consumeRateLimit(`ip:${input.clientIp}`, 100, 60_000)
          : undefined;
        if (ipRate?.allowed !== false) {
          userRate = await store.consumeRateLimit(`user:${userId}`, 20, 60_000);
        }
      });
    } catch {
      return reject('RATE_LIMIT_UNAVAILABLE', '请求预处理失败，请稍后重试', 503);
    }
    if (ipRate?.allowed === false || !userRate?.allowed) {
      const retryAfterSeconds = Math.max(
        userRate?.retryAfterSeconds ?? 0,
        ipRate?.retryAfterSeconds ?? 0,
      );
      return reject('RATE_LIMITED', '发送得太快，请稍后再试', 429, { retryAfterSeconds });
    }

    let reservation: TurnReservation;
    try {
      reservation = await timing.measure('turn_reservation', () => store.reserveTurn({
        userId,
        roomId: request.roomId,
        turnId: request.turnId,
        roomVersion: request.roomVersion,
        requestHash: hash,
        promptVersion,
        buildVersion,
        provider: config.provider,
        model: `agent=${config.provider}:${config.agentModel};director=${config.provider}:${config.directorModel}`,
      }));
    } catch (error) {
      return storeFailure(error);
    }
    if (reservation.kind === 'replay') {
      return { kind: 'stream', replay: true, events: replayEvents(reservation.events) };
    }
    if (reservation.kind === 'conflict') return conflict(reservation.code);

    const modelBudget = createModelBudget();
    try {
      const room = structuredClone(reservation.room.state);
      const safety = await timing.measure('safety', () => classifySafety(
        request.command.text,
        config.directorModel,
        undefined,
        modelBudget,
        input.signal,
      ));
      if (safety.bypassRoom) {
        return {
          reservation,
          room,
          safety,
          modelBudget,
          relationshipProjection: {
            mode: 'active_projection',
            status: 'bypassed',
            branches: [],
          },
        };
      }
      if (request.command.calledAgent
        && !room.agents.some((agent) => agent.type === request.command.calledAgent)) {
        await store.failTurn(
          userId,
          request.roomId,
          request.turnId,
          preprocessingFailureObservability(modelBudget, timing, 'UNKNOWN_AGENT'),
        );
        return reject('UNKNOWN_AGENT', '该 Agent 不在房间中', 400);
      }
      const roomAgentTypes = room.agents.map((agent) => agent.type);
      const [confirmed, branchResult] = await Promise.all([
        timing.measure(
          'confirmed_memory_read',
          () => store.listConfirmedMemories(userId, roomAgentTypes),
        ),
        timing.measure(
          'relationship_branch_read',
          () => observeWithin(
            (signal) => store.listRelationshipBranches(userId, roomAgentTypes, {
              timeoutMs: RELATIONSHIP_PROJECTION_READ_TIMEOUT_MS,
              signal,
            }),
            RELATIONSHIP_PROJECTION_READ_TIMEOUT_MS,
          ),
        ),
      ]);
      applyConfirmedMemories(room, confirmed);
      if (!branchResult.ok) throw new Error('relationship projection unavailable');
      applyRelationshipBranchContexts(room, branchResult.value);
      return {
        reservation,
        room,
        safety,
        modelBudget,
        relationshipProjection: {
          mode: 'active_projection',
          status: 'loaded',
          branches: branchResult.value.map(({ agent, version, branch }) => ({
            agent,
            version,
            climate: branch.recentClimate,
            eventCount: branch.eventLog.length,
            boundaryCount: branch.boundaries.length,
            tensionCount: branch.tensions.filter((tension) => tension.status !== 'resolved').length,
          })),
        },
      };
    } catch {
      await store.failTurn(
        userId,
        request.roomId,
        request.turnId,
        preprocessingFailureObservability(modelBudget, timing, 'PREPROCESSING_FAILED'),
      ).catch(() => undefined);
      return reject('PREPROCESSING_FAILED', '请求预处理失败，请稍后重试', 503);
    }
  }

  private async runPrepared(
    input: ExecuteTurnInput,
    prepared: PreparedTurn,
    timing: TurnTimingRecorder,
    signal: AbortSignal,
    queue: EventQueue<TurnEvent>,
  ): Promise<void> {
    const { request, userId } = input;
    const { store, config, getRuntime, promptVersion } = this.dependencies;
    const { reservation, room, safety, modelBudget, relationshipProjection } = prepared;
    const events: TurnEvent[] = [];
    const roomActions: unknown[] = [];
    const observerFailures: Array<{ hook: string; errorType: string }> = [];
    let deliveredEventCount = 0;
    let mutterCount = 0;
    let completionAttempted = false;
    const send = (event: TurnEvent, persist = true) => {
      if (persist) appendDurableEvent(events, event);
      queue.push(event);
      if (persist) deliveredEventCount = events.length;
    };

    try {
      let stopReason: TurnStopReason;
      let planSummary: { scene: string; userEmotion: string } | undefined;
      let tracePlan: Record<string, unknown> | undefined;
      let loop: unknown;
      const memoryCandidates: NonNullable<Parameters<TurnApplicationStore['completeTurn']>[0]['memoryCandidates']> = [];

      if (safety.bypassRoom) {
        const bypass = safetyBypass(
          room,
          request.turnId,
          request.command.text,
          safety.level as 'crisis' | 'blocked',
          safetyResponse(safety),
        );
        stopReason = bypass.stopReason;
        for (const event of bypass.events) send(event);
      } else {
        send({ v: TURN_EVENT_VERSION, turnId: request.turnId, type: 'turn_start' });
        const runtimeDependency = await getRuntime();
        const result = await runTurn(room, request.command.text, {
          calledAgent: request.command.calledAgent,
          roomId: request.roomId,
          turnId: request.turnId,
          promptVersion,
          safetyMode: safety.level,
          mutterEnabled: request.command.mutterEnabled,
          signal,
          onObserverError: ({ hook, error }) => {
            observerFailures.push({
              hook,
              errorType: error instanceof Error ? error.name : 'UnknownError',
            });
          },
          onRoomAction: (action) => {
            roomActions.push(action);
            send({ v: TURN_EVENT_VERSION, turnId: request.turnId, type: 'room_action', action });
          },
          onSpeakerStart: (agent, plan) => send({
            v: TURN_EVENT_VERSION,
            turnId: request.turnId,
            type: 'speaker_start',
            agent,
            speechType: plan.speechType,
          }),
          onMutter: (agent, text) => {
            mutterCount += 1;
            send({ v: TURN_EVENT_VERSION, turnId: request.turnId, type: 'mutter', agent, text });
            timing.markValidatedOutput();
          },
          onDelta: (agent, delta) => {
            send({ v: TURN_EVENT_VERSION, turnId: request.turnId, type: 'delta', agent, delta });
            timing.markValidatedOutput();
          },
          onSpeakerEnd: (utterance, messageId) => send({
            v: TURN_EVENT_VERSION,
            turnId: request.turnId,
            type: 'speaker_end',
            messageId,
            agent: utterance.type,
            speechType: utterance.speechType,
            text: utterance.text,
            ...(utterance.mutter ? { mutter: utterance.mutter } : {}),
          }),
        }, config, {
          runtime: runtimeDependency,
          modelBudget,
          timing,
          roomLoopBudget: safety.level === 'sensitive'
            ? { maxNormalSpeakers: 1, maxControllerCalls: 0, maxGeneratedCharacters: 1_500 }
            : undefined,
        });
        stopReason = result.loop.stopReason;
        planSummary = { scene: result.plan.scene, userEmotion: result.plan.userEmotion };
        tracePlan = {
          scene: result.plan.scene,
          userEmotion: result.plan.userEmotion,
          forceSummary: result.plan.forceSummary,
          speakers: result.plan.speakers,
          scores: result.plan.scores,
        };
        loop = result.loop;

        if (safety.level === 'normal') {
          const memoryAgent = request.command.calledAgent
            ?? result.utterances[0]?.type
            ?? room.agents[0]!.type;
          await timing.measure('candidate_memory', async () => {
            const draft = extractMemoryCandidate(request.command.text, memoryAgent);
            if (!draft) return;
            const candidate = { id: randomUUID(), ...draft };
            memoryCandidates.push(candidate);
            events.push({
              v: TURN_EVENT_VERSION,
              turnId: request.turnId,
              type: 'memory_candidate',
              candidate: {
                id: candidate.id,
                agent: candidate.agent,
                kind: candidate.kind,
                content: candidate.content,
              },
            });
          });
        }
      }

      for (let index = reservation.room.state.history.length; index < room.history.length; index++) {
        room.history[index]!.id ??= randomUUID();
      }
      clearInjectedMemories(room);
      const nextVersion = reservation.room.version + 1;
      const budgetSnapshot = modelBudget.snapshot();
      const observability = {
        usage: {
          status: budgetSnapshot.actualUsage.calls > 0
            ? 'actual_provider_usage'
            : 'no_provider_usage',
          ...budgetSnapshot.actualUsage,
          budgetUpperBound: {
            reservedCalls: budgetSnapshot.reservedCalls,
            reservedOutputTokens: budgetSnapshot.reservedOutputTokens,
          },
        },
        latency: timing.snapshot(),
        trace: {
          v: 1,
          safety: { level: safety.level, reason: safety.reason, bypassRoom: safety.bypassRoom },
          plan: tracePlan,
          roomActions,
          relationshipProjection,
          observerFailures,
          loop,
          prompt: {
            version: promptVersion,
            mutterEnabled: request.command.mutterEnabled !== false,
            mutterCount,
          },
        },
      };
      events.push({
        v: TURN_EVENT_VERSION,
        turnId: request.turnId,
        type: 'turn_end',
        stopReason,
        roomVersion: nextVersion,
      });
      events.push({
        v: TURN_EVENT_VERSION,
        turnId: request.turnId,
        type: 'done',
        room,
        roomVersion: nextVersion,
        plan: planSummary,
        loop,
        safetyLevel: safety.level,
        modelBudget: budgetSnapshot,
      });
      completionAttempted = true;
      await timing.measure('turn_persistence', () => store.completeTurn({
        userId,
        roomId: request.roomId,
        turnId: request.turnId,
        state: room,
        stopReason,
        events,
        memoryCandidates,
        observability,
      }));
      for (let index = deliveredEventCount; index < events.length; index++) {
        send(events[index]!, false);
      }
    } catch (error) {
      const cancelled = signal.aborted || (error instanceof Error && error.name === 'AbortError');
      const deliveryFailed = queue.wasCancelled
        || error instanceof DeliveryCallbackError
        || error instanceof EventDeliveryClosedError;
      const resultUnknown = deliveryFailed || completionAttempted;
      const effectiveCancellation = cancelled && !resultUnknown;
      const runtimeFailure = error instanceof RuntimeExecutionError ? error : undefined;
      const budgetExceeded = error instanceof ModelBudgetExceededError;
      const errorCode = resultUnknown
        ? 'TURN_RESULT_UNKNOWN'
        : effectiveCancellation
          ? 'CANCELLED'
          : budgetExceeded
            ? 'MODEL_BUDGET_EXHAUSTED'
            : runtimeFailure?.code.toUpperCase() ?? 'TURN_FAILED';
      const recoverable = effectiveCancellation || budgetExceeded
        ? false
        : runtimeFailure?.recoverable ?? true;
      const failureOutcome = resultUnknown ? 'unknown' : 'known_failed';
      const recoveryAction = decideRecoveryAction({
        code: errorCode,
        recoverable,
        outcome: failureOutcome,
        stopReason: runtimeFailure?.stopReason,
        userCancelled: effectiveCancellation,
      });
      const budgetSnapshot = modelBudget.snapshot();
      await store.failTurn(userId, request.roomId, request.turnId, {
        stopReason: effectiveCancellation ? 'cancelled' : 'error',
        usage: {
          status: budgetSnapshot.actualUsage.calls > 0
            ? 'actual_provider_usage'
            : 'no_provider_usage',
          ...budgetSnapshot.actualUsage,
          budgetUpperBound: {
            reservedCalls: budgetSnapshot.reservedCalls,
            reservedOutputTokens: budgetSnapshot.reservedOutputTokens,
          },
        },
        latency: timing.snapshot(),
        trace: {
          v: 1,
          safety: { level: safety.level, reason: safety.reason, bypassRoom: safety.bypassRoom },
          roomActions,
          observerFailures,
          errorCode,
        },
      }).catch(() => undefined);
      try {
        send({
          v: TURN_EVENT_VERSION,
          turnId: request.turnId,
          type: 'error',
          code: errorCode,
          message: resultUnknown
            ? '本轮结果尚未确认，请先检查原 Turn 的最终状态'
            : effectiveCancellation
              ? '生成已取消'
              : budgetExceeded
                ? '本轮已达到运行预算，已停止生成'
                : recoveryAction === 'transform'
                  ? '本轮输出未完整生成，请调整内容后重试'
                  : recoveryAction === 'retry'
                    ? '生成失败，可以重新发起这一轮'
                    : '生成失败，当前请求不能原样重试',
          recoverable,
          recoveryAction,
          outcome: failureOutcome,
        }, false);
      } catch {
        // 消费者已经关闭时没有可投递目标；Store 仍保留权威状态。
      }
    }
  }
}

export function createTurnApplication(
  dependencies: TurnApplicationDependencies,
): TurnApplication {
  return new DefaultTurnApplication(dependencies);
}
