import { z } from 'zod';
import { json, storeErrorResponse, withSessionCookie } from '../../../lib/server/http';
import { resolveAnonymousSession } from '../../../lib/server/session';
import { getPersonaStore } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const statusSchema = z.enum(['candidate', 'confirmed', 'rejected', 'deleted']);
const roomIdSchema = z.string().uuid();

export async function GET(request: Request): Promise<Response> {
  const session = resolveAnonymousSession(request);
  const url = new URL(request.url);
  const rawStatus = url.searchParams.get('status');
  const status = rawStatus ? statusSchema.safeParse(rawStatus) : undefined;
  if (status && !status.success) {
    return Response.json({ error: { code: 'INVALID_STATUS', message: '未知记忆状态' } }, { status: 400 });
  }
  const rawRoomId = url.searchParams.get('roomId');
  const roomId = rawRoomId ? roomIdSchema.safeParse(rawRoomId) : undefined;
  if (roomId && !roomId.success) {
    return Response.json({ error: { code: 'INVALID_ROOM_ID', message: '房间标识无效' } }, { status: 400 });
  }
  try {
    const memories = await getPersonaStore().listMemories(session.userId, status?.data, roomId?.data);
    return json({ memories }, 200, withSessionCookie(new Headers(), session.setCookie));
  } catch (error) {
    return storeErrorResponse(error);
  }
}
