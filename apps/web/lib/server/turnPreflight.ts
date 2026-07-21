import {
  applyConfirmedMemories,
  classifySafety,
  createModelBudget,
  type EngineConfig,
  type ModelBudget,
  type RoomState,
  type SafetyDecision,
} from '@persona16/engine';
import type { PersonaStore, TurnReservation } from '@persona16/store';
import { jsonError, storeErrorResponse } from './http';
import { clientIpKey } from './rateLimit';
import {
  TURN_BUILD_VERSION,
  TURN_PROMPT_VERSION,
  replayTurnResponse,
  turnRecoveryDetails,
  turnConflictResponse,
  turnRequestHash,
  unknownTurnStoreRecovery,
  type TurnRequest,
} from './turnProtocol';

const RELATIONSHIP_SHADOW_READ_TIMEOUT_MS = 100;

export interface RelationshipShadow {
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
}

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

export interface PreparedTurn {
  reservation: Extract<TurnReservation, { kind: 'accepted' }>;
  room: RoomState;
  safety: SafetyDecision;
  modelBudget: ModelBudget;
  relationshipShadow: RelationshipShadow;
}

export async function prepareTurn(input: {
  body: TurnRequest;
  request: Request;
  userId: string;
  setCookie?: string;
  store: PersonaStore;
  config: EngineConfig;
  turnStartedAt: number;
}): Promise<PreparedTurn | Response> {
  const { body, request, userId, setCookie, store, config, turnStartedAt } = input;
  const hash = turnRequestHash(body);

  try {
    const lookup = await store.lookupTurn({
      userId,
      roomId: body.roomId,
      turnId: body.turnId,
      requestHash: hash,
    });
    if (lookup.kind === 'replay') return replayTurnResponse(lookup.events, setCookie);
    if (lookup.kind === 'conflict') return turnConflictResponse(lookup.code, setCookie);
  } catch (error) {
    const response = storeErrorResponse(error, unknownTurnStoreRecovery);
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  }

  let userRate: { allowed: boolean; retryAfterSeconds: number } | undefined;
  let ipRate: { allowed: boolean; retryAfterSeconds: number } | undefined;
  try {
    const ipKey = clientIpKey(request);
    ipRate = ipKey ? await store.consumeRateLimit(`ip:${ipKey}`, 100, 60_000) : undefined;
    if (ipRate?.allowed !== false) {
      userRate = await store.consumeRateLimit(`user:${userId}`, 20, 60_000);
    }
  } catch {
    const response = jsonError(
      'RATE_LIMIT_UNAVAILABLE',
      '请求预处理失败，请稍后重试',
      503,
      undefined,
      turnRecoveryDetails('RATE_LIMIT_UNAVAILABLE', 503),
    );
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  }
  if (ipRate?.allowed === false || !userRate?.allowed) {
    const retryAfterSeconds = Math.max(userRate?.retryAfterSeconds ?? 0, ipRate?.retryAfterSeconds ?? 0);
    const response = jsonError(
      'RATE_LIMITED',
      '发送得太快，请稍后再试',
      429,
      { 'Retry-After': String(retryAfterSeconds) },
      turnRecoveryDetails('RATE_LIMITED', 429, { retryAfterMs: retryAfterSeconds * 1_000 }),
    );
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  }

  let reservation: TurnReservation;
  try {
    // lookup 与 reserve 之间可能有并发竞争，因此 reserve 仍需再次处理重放与冲突。
    reservation = await store.reserveTurn({
      userId,
      roomId: body.roomId,
      turnId: body.turnId,
      roomVersion: body.roomVersion,
      requestHash: hash,
      promptVersion: TURN_PROMPT_VERSION,
      buildVersion: TURN_BUILD_VERSION,
      provider: config.provider,
      model: `agent=${config.provider}:${config.agentModel};director=${config.provider}:${config.directorModel}`,
    });
  } catch (error) {
    const response = storeErrorResponse(error, unknownTurnStoreRecovery);
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  }
  if (reservation.kind === 'replay') return replayTurnResponse(reservation.events, setCookie);
  if (reservation.kind === 'conflict') return turnConflictResponse(reservation.code, setCookie);

  const modelBudget = createModelBudget();
  let relationshipShadow: RelationshipShadow = {
    mode: 'observe_only',
    status: 'loaded',
    branches: [],
  };
  try {
    const room = structuredClone(reservation.room.state);
    if (body.command.calledAgent && !room.agents.some((agent) => agent.type === body.command.calledAgent)) {
      await store.failTurn(userId, body.roomId, body.turnId);
      const response = jsonError(
        'UNKNOWN_AGENT',
        '该 Agent 不在房间中',
        400,
        undefined,
        turnRecoveryDetails('UNKNOWN_AGENT', 400),
      );
      if (setCookie) response.headers.set('Set-Cookie', setCookie);
      return response;
    }
    const roomAgentTypes = room.agents.map((agent) => agent.type);
    const [confirmed, shadowResult] = await Promise.all([
      store.listConfirmedMemories(userId, roomAgentTypes),
      observeWithin(
        store.listRelationshipBranches(userId, roomAgentTypes),
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
    const safety = await classifySafety(
      body.command.text,
      config.directorModel,
      undefined,
      modelBudget,
      request.signal,
    );
    return { reservation, room, safety, modelBudget, relationshipShadow };
  } catch {
    const budgetSnapshot = modelBudget.snapshot();
    await store.failTurn(userId, body.roomId, body.turnId, {
      stopReason: 'error',
      usage: {
        status: budgetSnapshot.actualUsage.calls > 0 ? 'actual_provider_usage' : 'no_provider_usage',
        ...budgetSnapshot.actualUsage,
      },
      latency: { totalMs: Math.max(0, Date.now() - turnStartedAt), firstTokenMs: null },
      trace: { v: 1, stage: 'preprocessing', errorCode: 'PREPROCESSING_FAILED' },
    }).catch(() => undefined);
    const response = jsonError(
      'PREPROCESSING_FAILED',
      '请求预处理失败，请稍后重试',
      503,
      undefined,
      turnRecoveryDetails('PREPROCESSING_FAILED', 503),
    );
    if (setCookie) response.headers.set('Set-Cookie', setCookie);
    return response;
  }
}
