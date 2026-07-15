import { AGENT_TYPES } from '@persona16/engine';
import { z } from 'zod';
import { json, jsonError, parseJson, storeErrorResponse, withSessionCookie } from '../../../../lib/server/http';
import { RoomCommandError, createRoomCommandModule } from '../../../../lib/server/roomCommand';
import { resolveAnonymousSession } from '../../../../lib/server/session';
import { getPersonaStore } from '../../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  roomVersion: z.number().int().positive(),
  command: z.discriminatedUnion('type', [
    z.object({ type: z.literal('pause_agent'), agent: z.enum(AGENT_TYPES) }).strict(),
    z.object({ type: z.literal('resume_agent'), agent: z.enum(AGENT_TYPES) }).strict(),
    z.object({ type: z.literal('invite_agent'), agent: z.enum(AGENT_TYPES) }).strict(),
    z.object({
      type: z.literal('remove_agent'),
      agent: z.enum(AGENT_TYPES),
      confirmed: z.literal(true).optional(),
    }).strict(),
  ]),
}).strict();

export async function GET(request: Request, context: { params: Promise<{ roomId: string }> }): Promise<Response> {
  const session = resolveAnonymousSession(request);
  try {
    const { roomId } = await context.params;
    const room = await getPersonaStore().getRoom(roomId, session.userId);
    return json(
      { id: room.id, state: room.state, version: room.version, busy: Boolean(room.activeTurnId) },
      200,
      withSessionCookie(new Headers(), session.setCookie),
    );
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ roomId: string }> }): Promise<Response> {
  const body = await parseJson(request, updateSchema);
  if (body instanceof Response) return body;
  const session = resolveAnonymousSession(request);
  try {
    const { roomId } = await context.params;
    const result = await createRoomCommandModule(getPersonaStore()).execute({
      userId: session.userId,
      roomId,
      expectedVersion: body.roomVersion,
      command: body.command,
      authorization: {
        source: 'ui_action',
        confirmed: body.command.type === 'remove_agent' ? body.command.confirmed : undefined,
      },
    });
    return json(
      { id: result.room.id, state: result.room.state, version: result.room.version },
      200,
      withSessionCookie(new Headers(), session.setCookie),
    );
  } catch (error) {
    if (error instanceof RoomCommandError) return jsonError(error.code, error.message, error.status);
    return storeErrorResponse(error);
  }
}
