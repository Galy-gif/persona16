import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'p16_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function secret(): string {
  const configured = process.env.PERSONA16_SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PERSONA16_SESSION_SECRET is required in production');
  }
  return 'persona16-local-development-session-secret';
}

function signature(id: string): string {
  return createHmac('sha256', secret()).update(id).digest('base64url');
}

function parseCookies(header: string | null): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey && rawValue.length) result.set(rawKey, decodeURIComponent(rawValue.join('=')));
  }
  return result;
}

function verify(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const separator = value.lastIndexOf('.');
  if (separator <= 0) return undefined;
  const id = value.slice(0, separator);
  const supplied = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signature(id));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return undefined;
  return /^[0-9a-f-]{36}$/iu.test(id) ? id : undefined;
}

export interface AnonymousSession {
  userId: string;
  setCookie?: string;
}

export function resolveAnonymousSession(request: Request): AnonymousSession {
  const existing = verify(parseCookies(request.headers.get('cookie')).get(COOKIE_NAME));
  if (existing) return { userId: existing };
  const userId = randomUUID();
  const value = `${userId}.${signature(userId)}`;
  return {
    userId,
    setCookie: `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  };
}
