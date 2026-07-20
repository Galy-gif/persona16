import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIpKey } from '../lib/server/rateLimit';
import { resolveAnonymousSession } from '../lib/server/session';

test('proxy address is ignored unless the deployment explicitly trusts proxy headers', () => {
  const original = process.env.PERSONA16_TRUST_PROXY;
  delete process.env.PERSONA16_TRUST_PROXY;
  const request = new Request('http://localhost', { headers: { 'x-forwarded-for': '203.0.113.9' } });
  assert.equal(clientIpKey(request), undefined);
  process.env.PERSONA16_TRUST_PROXY = '1';
  assert.equal(clientIpKey(request), '203.0.113.9');
  assert.equal(clientIpKey(new Request('http://localhost')), undefined);
  if (original === undefined) delete process.env.PERSONA16_TRUST_PROXY;
  else process.env.PERSONA16_TRUST_PROXY = original;
});

test('anonymous session cookie is signed and tampering creates a new identity', () => {
  const created = resolveAnonymousSession(new Request('http://localhost'));
  assert.ok(created.setCookie);
  const reused = resolveAnonymousSession(new Request('http://localhost', { headers: { Cookie: created.setCookie! } }));
  assert.equal(reused.userId, created.userId);
  assert.equal(reused.setCookie, undefined);

  const tamperedCookie = created.setCookie!.replace(created.userId, crypto.randomUUID());
  const tampered = resolveAnonymousSession(new Request('http://localhost', { headers: { Cookie: tamperedCookie } }));
  assert.notEqual(tampered.userId, created.userId);
  assert.ok(tampered.setCookie);
});
