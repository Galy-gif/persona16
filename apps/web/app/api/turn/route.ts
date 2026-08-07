import {
  defaultConfig,
  type AgentRuntime,
} from '@persona16/engine';
import { createTurnApplication } from '@persona16/turn-application';
import { parseJson } from '../../../lib/server/http';
import { clientIpKey } from '../../../lib/server/rateLimit';
import { resolveAnonymousSession } from '../../../lib/server/session';
import { getPersonaStore } from '../../../lib/server/store';
import {
  TURN_BUILD_VERSION,
  TURN_PROMPT_VERSION,
  turnExecutionResponse,
  turnRecoveryDetails,
  turnRequestSchema,
} from '../../../lib/server/turnProtocol';

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

  const session = resolveAnonymousSession(request);
  const store = getPersonaStore();
  const application = createTurnApplication({
    store,
    config: engineConfig,
    promptVersion: TURN_PROMPT_VERSION,
    buildVersion: TURN_BUILD_VERSION,
    getRuntime,
  });
  const execution = await application.execute({
    request: body,
    userId: session.userId,
    clientIp: clientIpKey(request),
    signal: request.signal,
  });
  return turnExecutionResponse(execution, session.setCookie);
}
