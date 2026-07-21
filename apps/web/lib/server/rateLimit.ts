import { isIP } from 'node:net';

/** 只有部署层明确声明会清洗代理头时才信任 forwarded-for。 */
export function clientIpKey(request: Request): string | undefined {
  if (process.env.PERSONA16_TRUST_PROXY !== '1') return undefined;
  const candidate = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? request.headers.get('x-real-ip')?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}
