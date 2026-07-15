import { z } from 'zod';
import { json, parseJson, storeErrorResponse, withSessionCookie } from '../../../../lib/server/http';
import { resolveAnonymousSession } from '../../../../lib/server/session';
import { getPersonaStore } from '../../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({ action: z.enum(['confirm', 'reject', 'delete']) });

export async function PATCH(request: Request, context: { params: Promise<{ memoryId: string }> }): Promise<Response> {
  const body = await parseJson(request, schema);
  if (body instanceof Response) return body;
  const session = resolveAnonymousSession(request);
  try {
    const { memoryId } = await context.params;
    const status = body.action === 'confirm' ? 'confirmed' : body.action === 'reject' ? 'rejected' : 'deleted';
    const memory = await getPersonaStore().updateMemoryStatus(session.userId, memoryId, status);
    return json({ memory }, 200, withSessionCookie(new Headers(), session.setCookie));
  } catch (error) {
    return storeErrorResponse(error);
  }
}
