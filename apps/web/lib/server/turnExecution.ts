import { randomUUID } from 'node:crypto';
import {
  DeliveryCallbackError,
  ModelBudgetExceededError,
  RuntimeExecutionError,
  TURN_EVENT_VERSION,
  clearInjectedMemories,
  decideRecoveryAction,
  extractMemoryCandidate,
  runTurn,
  safetyResponse,
  type AgentRuntime,
  type EngineConfig,
  type RoomState,
  type TurnStopReason,
  type TurnTimingRecorder,
} from '@persona16/engine';
import type { PersistedTurnEvent, PersonaStore } from '@persona16/store';
import { appendPersistedTurnEvent } from './turnPersistence';
import { ndjsonHeaders, TURN_PROMPT_VERSION, type TurnRequest } from './turnProtocol';
import type { PreparedTurn } from './turnPreflight';

function safetyBypass(
  room: RoomState,
  turnId: string,
  text: string,
  level: 'crisis' | 'blocked',
  responseText: string,
): { events: PersistedTurnEvent[]; stopReason: TurnStopReason } {
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

export function executeTurn(input: {
  body: TurnRequest;
  userId: string;
  setCookie?: string;
  store: PersonaStore;
  config: EngineConfig;
  prepared: PreparedTurn;
  signal: AbortSignal;
  timing: TurnTimingRecorder;
  getRuntime: () => Promise<AgentRuntime | undefined>;
}): Response {
  const {
    body, userId, setCookie, store, config, prepared, signal, timing, getRuntime,
  } = input;
  const { reservation, room, safety, modelBudget, relationshipProjection } = prepared;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const events: PersistedTurnEvent[] = [];
      const roomActions: unknown[] = [];
      const observerFailures: Array<{ hook: string; errorType: string }> = [];
      let sentEventCount = 0;
      let mutterCount = 0;
      let closed = false;
      let completionAttempted = false;
      const send = (event: PersistedTurnEvent, persist = true) => {
        if (persist) appendPersistedTurnEvent(events, event);
        if (!closed) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        if (persist) sentEventCount = events.length;
      };
      const close = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      try {
        let stopReason: TurnStopReason;
        let planSummary: { scene: string; userEmotion: string } | undefined;
        let tracePlan: Record<string, unknown> | undefined;
        let loop: unknown;
        const memoryCandidates: NonNullable<Parameters<PersonaStore['completeTurn']>[0]['memoryCandidates']> = [];

        if (safety.bypassRoom) {
          const bypass = safetyBypass(
            room,
            body.turnId,
            body.command.text,
            safety.level as 'crisis' | 'blocked',
            safetyResponse(safety),
          );
          stopReason = bypass.stopReason;
          for (const event of bypass.events) send(event);
        } else {
          send({ v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'turn_start' });
          const runtimeDependency = await getRuntime();
          const result = await runTurn(room, body.command.text, {
            calledAgent: body.command.calledAgent,
            roomId: body.roomId,
            turnId: body.turnId,
            promptVersion: TURN_PROMPT_VERSION,
            safetyMode: safety.level,
            mutterEnabled: body.command.mutterEnabled,
            signal,
            onObserverError: ({ hook, error }) => {
              observerFailures.push({
                hook,
                errorType: error instanceof Error ? error.name : 'UnknownError',
              });
            },
            onRoomAction: (action) => {
              roomActions.push(action);
              send({ v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'room_action', action });
            },
            onSpeakerStart: (agent, plan) => send({
              v: TURN_EVENT_VERSION,
              turnId: body.turnId,
              type: 'speaker_start',
              agent,
              speechType: plan.speechType,
            }),
            onMutter: (agent, text) => {
              mutterCount += 1;
              send({ v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'mutter', agent, text });
              timing.markValidatedOutput();
            },
            onDelta: (agent, delta) => {
              send({ v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'delta', agent, delta });
              timing.markValidatedOutput();
            },
            onSpeakerEnd: (utterance, messageId) => {
              send({
                v: TURN_EVENT_VERSION,
                turnId: body.turnId,
                type: 'speaker_end',
                messageId,
                agent: utterance.type,
                speechType: utterance.speechType,
                text: utterance.text,
                ...(utterance.mutter ? { mutter: utterance.mutter } : {}),
              });
            },
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
            const memoryAgent = body.command.calledAgent ?? result.utterances[0]?.type ?? room.agents[0]!.type;
            await timing.measure('candidate_memory', async () => {
              const draft = extractMemoryCandidate(body.command.text, memoryAgent);
              if (!draft) return;
              const candidate = { id: randomUUID(), ...draft };
              memoryCandidates.push(candidate);
              events.push({
                v: TURN_EVENT_VERSION,
                turnId: body.turnId,
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
            status: budgetSnapshot.actualUsage.calls > 0 ? 'actual_provider_usage' : 'no_provider_usage',
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
              version: TURN_PROMPT_VERSION,
              mutterEnabled: body.command.mutterEnabled !== false,
              mutterCount,
            },
          },
        };
        events.push({
          v: TURN_EVENT_VERSION,
          turnId: body.turnId,
          type: 'turn_end',
          stopReason,
          roomVersion: nextVersion,
        });
        events.push({
          v: TURN_EVENT_VERSION,
          turnId: body.turnId,
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
          roomId: body.roomId,
          turnId: body.turnId,
          state: room,
          stopReason,
          events,
          memoryCandidates,
          observability,
        }));

        for (let index = sentEventCount; index < events.length; index++) send(events[index]!, false);
      } catch (error) {
        const cancelled = signal.aborted || (error instanceof Error && error.name === 'AbortError');
        const deliveryFailed = error instanceof DeliveryCallbackError;
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
        const recoverable = effectiveCancellation || budgetExceeded ? false : runtimeFailure?.recoverable ?? true;
        const failureOutcome = resultUnknown ? 'unknown' : 'known_failed';
        const recoveryAction = decideRecoveryAction({
          code: errorCode,
          recoverable,
          outcome: failureOutcome,
          stopReason: runtimeFailure?.stopReason,
          userCancelled: effectiveCancellation,
        });
        const budgetSnapshot = modelBudget.snapshot();
        await store.failTurn(userId, body.roomId, body.turnId, {
          stopReason: effectiveCancellation ? 'cancelled' : 'error',
          usage: {
            status: budgetSnapshot.actualUsage.calls > 0 ? 'actual_provider_usage' : 'no_provider_usage',
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
        send({
          v: TURN_EVENT_VERSION,
          turnId: body.turnId,
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
      } finally {
        close();
      }
    },
  });

  return new Response(stream, { headers: ndjsonHeaders(setCookie) });
}
