import { createHash, randomUUID } from 'node:crypto';
import {
  AGENT_TYPES,
  DeliveryCallbackError,
  TURN_EVENT_VERSION,
  applyConfirmedMemories,
  classifySafety,
  clearInjectedMemories,
  createModelBudget,
  defaultConfig,
  extractMemoryCandidate,
  runTurn,
  safetyResponse,
  type AgentType,
  type AgentRuntime,
  type RoomState,
  type TurnStopReason,
} from '@persona16/engine';
import type { PersistedTurnEvent } from '@persona16/store';
import { z } from 'zod';
import { jsonError, parseJson, storeErrorResponse, withSessionCookie } from '../../../lib/server/http';
import { clientIpKey } from '../../../lib/server/rateLimit';
import { resolveAnonymousSession } from '../../../lib/server/session';
import { getPersonaStore } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const requestSchema = z.object({
  roomId: z.string().uuid(),
  turnId: z.string().uuid(),
  roomVersion: z.number().int().positive(),
  command: z.object({
    type: z.literal('message'),
    text: z.string().trim().min(1).max(2_000),
    calledAgent: z.enum(AGENT_TYPES).optional(),
  }),
});

const engineConfig = defaultConfig();
const PROMPT_VERSION = 'web-mvp-v2';
const BUILD_VERSION = (process.env.PERSONA16_BUILD_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'development').slice(0, 80);
const RELATIONSHIP_SHADOW_READ_TIMEOUT_MS = 100;
let piRuntimePromise: Promise<AgentRuntime | undefined> | undefined;

async function observeWithin<T>(promise: Promise<T>, timeoutMs: number): Promise<
  { ok: true; value: T } | { ok: false }
> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observed = promise
    .then((value) => ({ ok: true as const, value }))
    .catch(() => ({ ok: false as const }));
  const timeout = new Promise<{ ok: false }>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false }), timeoutMs);
  });
  try {
    return await Promise.race([observed, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function getRuntime(): Promise<AgentRuntime | undefined> {
  if (engineConfig.runtime !== 'pi') return Promise.resolve(undefined);
  piRuntimePromise ??= import('@persona16/runtime-pi').then(({ PiAgentRuntime }) => new PiAgentRuntime());
  return piRuntimePromise;
}

function requestHash(value: z.infer<typeof requestSchema>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function ndjsonHeaders(setCookie?: string): Headers {
  return withSessionCookie(new Headers({
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Content-Type-Options': 'nosniff',
  }), setCookie);
}

function replayResponse(events: PersistedTurnEvent[], setCookie?: string): Response {
  const body = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  const headers = ndjsonHeaders(setCookie);
  headers.set('X-Persona16-Replay', '1');
  return new Response(body, { headers });
}

function conflictResponse(code: string, setCookie?: string): Response {
  const messages: Record<string, string> = {
    TURN_IN_PROGRESS: '这个房间正在生成另一轮回复',
    ROOM_VERSION_CONFLICT: '房间已在其他页面更新，请刷新后重试',
    IDEMPOTENCY_MISMATCH: '同一个 turnId 不能用于不同请求',
    TURN_FAILED: '这个 turnId 已失败，请使用新的 turnId 重试',
  };
  const response = jsonError(code, messages[code] ?? '请求冲突', 409);
  if (setCookie) response.headers.set('Set-Cookie', setCookie);
  return response;
}

function safetyBypass(
  room: RoomState,
  turnId: string,
  text: string,
  level: 'crisis' | 'blocked',
  responseText: string,
): { events: PersistedTurnEvent[]; stopReason: TurnStopReason } {
  room.history.push({ id: randomUUID(), speaker: 'user', text });
  room.history.push({ id: randomUUID(), speaker: 'safety', text: responseText });
  return {
    stopReason: 'safety_redirect',
    events: [
      { v: TURN_EVENT_VERSION, turnId, type: 'turn_start' },
      { v: TURN_EVENT_VERSION, turnId, type: 'safety_notice', level, text: responseText },
    ],
  };
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseJson(request, requestSchema);
  if (body instanceof Response) return body;
  const turnStartedAt = Date.now();
  const session = resolveAnonymousSession(request);
  const store = getPersonaStore();
  const hash = requestHash(body);
  let lookup;
  try {
    lookup = await store.lookupTurn({
      userId: session.userId,
      roomId: body.roomId,
      turnId: body.turnId,
      requestHash: hash,
    });
  } catch (error) {
    const response = storeErrorResponse(error);
    if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
    return response;
  }
  if (lookup.kind === 'replay') return replayResponse(lookup.events, session.setCookie);
  if (lookup.kind === 'conflict') return conflictResponse(lookup.code, session.setCookie);

  let userRate: { allowed: boolean; retryAfterSeconds: number } | undefined;
  let ipRate: { allowed: boolean; retryAfterSeconds: number };
  try {
    // 先挡共享 IP；被拒绝的匿名 Cookie 不创建新的 user:* 限流行。
    ipRate = await store.consumeRateLimit(`ip:${clientIpKey(request)}`, 100, 60_000);
    if (ipRate.allowed) userRate = await store.consumeRateLimit(`user:${session.userId}`, 20, 60_000);
  } catch {
    const response = jsonError('RATE_LIMIT_UNAVAILABLE', '请求预处理失败，请稍后重试', 503);
    if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
    return response;
  }
  if (!ipRate.allowed || !userRate?.allowed) {
    const retryAfterSeconds = Math.max(userRate?.retryAfterSeconds ?? 0, ipRate.retryAfterSeconds);
    const response = jsonError('RATE_LIMITED', '发送得太快，请稍后再试', 429, { 'Retry-After': String(retryAfterSeconds) });
    if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
    return response;
  }

  let reservation;
  try {
    // lookup 与 reserve 之间可能有并发竞争，因此 reserve 仍需再次处理重放与冲突。
    reservation = await store.reserveTurn({
      userId: session.userId,
      roomId: body.roomId,
      turnId: body.turnId,
      roomVersion: body.roomVersion,
      requestHash: hash,
      promptVersion: PROMPT_VERSION,
      buildVersion: BUILD_VERSION,
      provider: engineConfig.provider,
      model: `agent=${engineConfig.provider}:${engineConfig.agentModel};director=${engineConfig.provider}:${engineConfig.directorModel}`,
    });
  } catch (error) {
    const response = storeErrorResponse(error);
    if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
    return response;
  }
  if (reservation.kind === 'replay') return replayResponse(reservation.events, session.setCookie);
  if (reservation.kind === 'conflict') return conflictResponse(reservation.code, session.setCookie);

  let room: RoomState;
  let safety: Awaited<ReturnType<typeof classifySafety>>;
  let relationshipShadow: {
    mode: 'observe_only';
    status: 'loaded' | 'unavailable';
    branches: Array<{
      agent: string;
      version: number;
      climate: string;
      eventCount: number;
      boundaryCount: number;
      tensionCount: number;
    }>;
  } = { mode: 'observe_only', status: 'loaded', branches: [] };
  const modelBudget = createModelBudget();
  try {
    room = structuredClone(reservation.room.state);
    if (body.command.calledAgent && !room.agents.some((agent) => agent.type === body.command.calledAgent)) {
      await store.failTurn(session.userId, body.roomId, body.turnId);
      const response = jsonError('UNKNOWN_AGENT', '该 Agent 不在房间中', 400);
      if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
      return response;
    }
    const roomAgentTypes = room.agents.map((agent) => agent.type);
    const [confirmed, shadowResult] = await Promise.all([
      store.listConfirmedMemories(session.userId, roomAgentTypes),
      observeWithin(
        store.listRelationshipBranches(session.userId, roomAgentTypes),
        RELATIONSHIP_SHADOW_READ_TIMEOUT_MS,
      ),
    ]);
    applyConfirmedMemories(room, confirmed);
    relationshipShadow = {
      mode: 'observe_only',
      status: shadowResult.ok ? 'loaded' : 'unavailable',
      branches: (shadowResult.ok ? shadowResult.value : []).map(({ agent, branch, version }) => ({
        agent,
        version,
        climate: branch.recentClimate,
        eventCount: branch.eventLog.length,
        boundaryCount: branch.boundaries.length,
        tensionCount: branch.tensions.filter((tension) => tension.status !== 'resolved').length,
      })),
    };
    safety = await classifySafety(body.command.text, engineConfig.directorModel, undefined, modelBudget, request.signal);
  } catch {
    const budgetSnapshot = modelBudget.snapshot();
    await store.failTurn(session.userId, body.roomId, body.turnId, {
      stopReason: 'error',
      usage: {
        status: budgetSnapshot.actualUsage.calls > 0 ? 'actual_provider_usage' : 'no_provider_usage',
        ...budgetSnapshot.actualUsage,
      },
      latency: { totalMs: Math.max(0, Date.now() - turnStartedAt), firstTokenMs: null },
      trace: { v: 1, stage: 'preprocessing', errorCode: 'PREPROCESSING_FAILED' },
    }).catch(() => undefined);
    const response = jsonError('PREPROCESSING_FAILED', '请求预处理失败，请稍后重试', 503);
    if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
    return response;
  }
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const events: PersistedTurnEvent[] = [];
      const roomActions: unknown[] = [];
      const observerFailures: Array<{ hook: string; errorType: string }> = [];
      let sentEventCount = 0;
      let firstTokenAt: number | undefined;
      let closed = false;
      const send = (event: PersistedTurnEvent, persist = true) => {
        if (persist) events.push(event);
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

        if (safety.bypassRoom) {
          const bypass = safetyBypass(
            room, body.turnId, body.command.text, safety.level as 'crisis' | 'blocked', safetyResponse(safety),
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
            promptVersion: PROMPT_VERSION,
            safetyMode: safety.level,
            signal: request.signal,
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
              v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'speaker_start', agent, speechType: plan.speechType,
            }),
            onDelta: (agent, delta) => {
              firstTokenAt ??= Date.now();
              send({ v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'delta', agent, delta });
            },
            onSpeakerEnd: (utterance, messageId) => {
              send({
                v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'speaker_end', messageId,
                agent: utterance.type, speechType: utterance.speechType, text: utterance.text,
              });
            },
          }, engineConfig, {
            runtime: runtimeDependency,
            modelBudget,
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
            const draft = extractMemoryCandidate(body.command.text, memoryAgent);
            if (draft) {
              const [candidate] = await store.createMemoryCandidates({
                userId: session.userId, sourceTurnId: body.turnId, candidates: [draft],
              });
              if (candidate) events.push({
                v: TURN_EVENT_VERSION,
                turnId: body.turnId,
                type: 'memory_candidate',
                candidate: { id: candidate.id, agent: candidate.agent, kind: candidate.kind, content: candidate.content },
              });
            }
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
          latency: {
            totalMs: Math.max(0, Date.now() - turnStartedAt),
            firstTokenMs: firstTokenAt ? Math.max(0, firstTokenAt - turnStartedAt) : null,
          },
          trace: {
            v: 1,
            safety: { level: safety.level, reason: safety.reason, bypassRoom: safety.bypassRoom },
            plan: tracePlan,
            roomActions,
            relationshipShadow,
            observerFailures,
            loop,
          },
        };
        events.push({ v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'turn_end', stopReason, roomVersion: nextVersion });
        events.push({
          v: TURN_EVENT_VERSION, turnId: body.turnId, type: 'done', room, roomVersion: nextVersion,
          plan: planSummary, loop, safetyLevel: safety.level,
          modelBudget: budgetSnapshot,
        });
        await store.completeTurn({
          userId: session.userId,
          roomId: body.roomId,
          turnId: body.turnId,
          state: room,
          stopReason,
          events,
          observability,
        });

        for (let index = sentEventCount; index < events.length; index++) send(events[index]!, false);
      } catch (error) {
        const cancelled = request.signal.aborted || (error instanceof Error && error.name === 'AbortError');
        const deliveryFailed = error instanceof DeliveryCallbackError;
        const errorCode = cancelled ? 'CANCELLED' : deliveryFailed ? 'DELIVERY_FAILED' : 'TURN_FAILED';
        const budgetSnapshot = modelBudget.snapshot();
        await store.failTurn(session.userId, body.roomId, body.turnId, {
          stopReason: cancelled ? 'cancelled' : 'error',
          usage: {
            status: budgetSnapshot.actualUsage.calls > 0 ? 'actual_provider_usage' : 'no_provider_usage',
            ...budgetSnapshot.actualUsage,
            budgetUpperBound: {
              reservedCalls: budgetSnapshot.reservedCalls,
              reservedOutputTokens: budgetSnapshot.reservedOutputTokens,
            },
          },
          latency: {
            totalMs: Math.max(0, Date.now() - turnStartedAt),
            firstTokenMs: firstTokenAt ? Math.max(0, firstTokenAt - turnStartedAt) : null,
          },
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
          message: cancelled
            ? '生成已取消'
            : deliveryFailed
              ? '回复投递失败，请刷新房间查看最终状态'
              : '生成失败，请使用新的请求重试',
          recoverable: true,
        }, false);
      } finally {
        close();
      }
    },
  });

  return new Response(stream, { headers: ndjsonHeaders(session.setCookie) });
}
