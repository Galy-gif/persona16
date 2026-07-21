import { defaultConfig, type AgentRuntime } from '@persona16/engine';
import { parseJson } from '../../../lib/server/http';
import { resolveAnonymousSession } from '../../../lib/server/session';
import { getPersonaStore } from '../../../lib/server/store';
import { executeTurn } from '../../../lib/server/turnExecution';
import { prepareTurn } from '../../../lib/server/turnPreflight';
import { turnRecoveryDetails, turnRequestSchema } from '../../../lib/server/turnProtocol';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const engineConfig = defaultConfig();
let piRuntimePromise: Promise<AgentRuntime | undefined> | undefined;

function getRuntime(): Promise<AgentRuntime | undefined> {
  if (engineConfig.runtime !== 'pi') return Promise.resolve(undefined);
  piRuntimePromise ??= import('@persona16/runtime-pi').then(({ PiAgentRuntime }) => new PiAgentRuntime());
  return piRuntimePromise;
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseJson(
    request,
    turnRequestSchema,
    turnRecoveryDetails('INVALID_REQUEST', 400),
  );
  if (body instanceof Response) return body;

  const turnStartedAt = Date.now();
  const session = resolveAnonymousSession(request);
  const store = getPersonaStore();
  const prepared = await prepareTurn({
    body,
    request,
    userId: session.userId,
    setCookie: session.setCookie,
    store,
    config: engineConfig,
    turnStartedAt,
  });
  if (prepared instanceof Response) return prepared;

  return executeTurn({
    body,
    userId: session.userId,
    setCookie: session.setCookie,
    store,
    config: engineConfig,
    prepared,
    signal: request.signal,
    turnStartedAt,
    getRuntime,
  });
}
