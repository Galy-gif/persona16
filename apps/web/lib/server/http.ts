import { StoreError } from '@persona16/store';
import type { ZodType } from 'zod';

type ErrorDetails = Record<string, unknown>;

export async function parseJson<T>(
  request: Request,
  schema: ZodType<T>,
  errorDetails?: ErrorDetails,
): Promise<T | Response> {
  try {
    const result = schema.safeParse(await request.json());
    if (!result.success) return jsonError('INVALID_REQUEST', '请求格式不正确', 400, undefined, errorDetails);
    return result.data;
  } catch {
    return jsonError('INVALID_JSON', '请求不是有效 JSON', 400, undefined, errorDetails);
  }
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, { status, headers });
}

export function jsonError(
  code: string,
  message: string,
  status: number,
  headers?: HeadersInit,
  details: ErrorDetails = {},
): Response {
  return json({ error: { code, message, ...details } }, status, headers);
}

export function storeErrorResponse(
  error: unknown,
  detailsFor?: (code: string, status: number) => ErrorDetails,
): Response {
  if (error instanceof StoreError) {
    if (error.code === 'ROOM_NOT_FOUND' || error.code === 'MEMORY_NOT_FOUND' || error.code === 'MESSAGE_NOT_FOUND') {
      return jsonError(error.code, error.message, 404, undefined, detailsFor?.(error.code, 404));
    }
    return jsonError(error.code, error.message, 409, undefined, detailsFor?.(error.code, 409));
  }
  return jsonError('INTERNAL_ERROR', '服务暂时不可用', 500, undefined, detailsFor?.('INTERNAL_ERROR', 500));
}

export function withSessionCookie(headers: Headers, setCookie?: string): Headers {
  if (setCookie) headers.set('Set-Cookie', setCookie);
  return headers;
}
