import { z } from 'zod';
import { json, parseJson, storeErrorResponse, withSessionCookie } from '../../../lib/server/http';
import { resolveAnonymousSession } from '../../../lib/server/session';
import { getPersonaStore } from '../../../lib/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const feedbackTags = [
  'too_ai', 'stereotyped', 'offensive', 'repetitive', 'not_helpful', 'too_long', 'too_short',
] as const;

const feedbackSchema = z.object({
  roomId: z.string().uuid(),
  messageId: z.string().uuid(),
  rating: z.enum(['positive', 'negative']),
  tags: z.array(z.enum(feedbackTags)).max(4).default([]),
  note: z.string().trim().max(300).optional(),
}).superRefine((value, context) => {
  if (value.rating === 'positive' && value.tags.length > 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tags'], message: '正向反馈不需要原因标签' });
  }
  if (value.rating === 'negative' && value.tags.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['tags'], message: '请选择至少一个原因' });
  }
});

export async function GET(request: Request): Promise<Response> {
  const session = resolveAnonymousSession(request);
  const roomId = new URL(request.url).searchParams.get('roomId');
  if (!roomId || !z.string().uuid().safeParse(roomId).success) {
    return json({ error: { code: 'INVALID_REQUEST', message: '缺少有效 roomId' } }, 400);
  }
  try {
    const feedback = await getPersonaStore().listFeedback(session.userId, roomId);
    return json({ feedback }, 200, withSessionCookie(new Headers(), session.setCookie));
  } catch (error) {
    return storeErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await parseJson(request, feedbackSchema);
  if (body instanceof Response) return body;
  const session = resolveAnonymousSession(request);
  try {
    const feedback = await getPersonaStore().upsertFeedback({ userId: session.userId, ...body, tags: body.tags ?? [] });
    return json({ feedback }, 200, withSessionCookie(new Headers(), session.setCookie));
  } catch (error) {
    return storeErrorResponse(error);
  }
}
