import { AGENT_TYPES, createRoom } from '@persona16/engine';
import { z } from 'zod';
import { json, jsonError, parseJson, storeErrorResponse, withSessionCookie } from '../../../lib/server/http';
import { resolveAnonymousSession } from '../../../lib/server/session';
import { getPersonaStore } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  agents: z.array(z.enum(AGENT_TYPES)).min(1).max(3).refine((agents) => new Set(agents).size === agents.length),
  roomGoal: z.enum(['听见反方', '陪我想清楚', '更有行动感', '安静一点', '自由碰撞']).optional(),
});

export async function POST(request: Request): Promise<Response> {
  const body = await parseJson(request, schema);
  if (body instanceof Response) return body;
  const session = resolveAnonymousSession(request);
  try {
    const room = await getPersonaStore().createRoom({
      userId: session.userId,
      state: createRoom(body.agents, body.roomGoal),
    });
    const headers = withSessionCookie(new Headers(), session.setCookie);
    return json({ id: room.id, state: room.state, version: room.version }, 201, headers);
  } catch (error) {
    const response = storeErrorResponse(error);
    if (session.setCookie) response.headers.set('Set-Cookie', session.setCookie);
    return response;
  }
}
