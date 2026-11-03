import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifiedIdentity } from '../lib/identity.mts';

test('verification uses the authoritative Identity profile when JWT claims omit confirmation', async () => {
 const globals = globalThis as typeof globalThis & { netlifyIdentityContext?: unknown };
 const previousContext = globals.netlifyIdentityContext;
 const previousFetch = globalThis.fetch;
 globals.netlifyIdentityContext = { url: 'https://identity.example.test', user: { sub: 'member-1', email: 'member@example.test' } };
 let profile: Record<string, unknown> = { id: 'member-1', email: 'member@example.test', confirmed_at: '2026-11-03T00:00:00Z', app_metadata: { roles: ['member'] } };
 let status = 200;
 globalThis.fetch = async (input, init) => {
  assert.equal(input, 'https://identity.example.test/user');
  assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-session');
  return Response.json(profile, { status });
 };
 const request = new Request('https://site.example.test/api/me', { headers: { cookie: 'other=value; nf_jwt=test-session' } });
 try {
  const user = await verifiedIdentity(request);
  assert.equal(user?.id, 'member-1');
  assert.ok(user?.confirmedAt);
  assert.deepEqual(user?.roles, ['member']);
  profile = { ...profile, confirmed_at: undefined };
  assert.equal(await verifiedIdentity(request), null);
  profile = { ...profile, confirmed_at: '2026-11-03T00:00:00Z', id: 'different-member' };
  assert.equal(await verifiedIdentity(request), null);
  status = 401;
  assert.equal(await verifiedIdentity(request), null);
  assert.equal(await verifiedIdentity(new Request('https://site.example.test/api/me')), null);
 } finally {
  globals.netlifyIdentityContext = previousContext;
  globalThis.fetch = previousFetch;
 }
});
