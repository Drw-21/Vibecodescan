import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../../supabase/functions/_shared/log.ts';
import type { VerifyResult } from '../../../supabase/functions/_shared/verify.ts';
import { verifySiteHandler } from '../../../supabase/functions/verify-site/handler.ts';
import { MemoryStore } from './memoryStore.ts';

const ORIGIN = 'https://scanner.example.test';

function setup(
  result: VerifyResult = { verified: true, method: 'file' },
  userId: string | null = 'user-1',
) {
  const store = new MemoryStore();
  const site = store.addSite('user-1', { url: 'https://myapp.example.test/' });
  const checked: string[] = [];
  const handler = verifySiteHandler({
    store,
    userIdFromRequest: () => Promise.resolve(userId),
    verifyOwnership: (s) => {
      checked.push(s.host);
      return Promise.resolve(result);
    },
    allowedOrigin: ORIGIN,
    log: silentLogger,
  });
  return { store, site, checked, handler };
}

const post = (body: unknown) =>
  new Request('https://fn.example.test/verify-site', {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('verify-site', () => {
  it('verifies the owner’s site when the code is found', async () => {
    const { handler, store, site } = setup();
    const res = await handler(post({ siteId: site.id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: true, method: 'file' });
    expect(store.sites.get(site.id)?.verifiedAt).not.toBeNull();
  });

  it('explains when the code is not found yet, without changing anything', async () => {
    const { handler, store, site } = setup({ verified: false });
    const body = (await (await handler(post({ siteId: site.id }))).json()) as {
      verified: boolean;
      message: string;
    };
    expect(body.verified).toBe(false);
    expect(body.message).toMatch(/could not find your code/);
    expect(store.sites.get(site.id)?.verifiedAt).toBeNull();
  });

  it('requires signing in', async () => {
    const { handler, site } = setup(undefined, null);
    expect((await handler(post({ siteId: site.id }))).status).toBe(401);
  });

  it('never checks or reveals someone else’s site', async () => {
    const { handler, store, checked } = setup();
    const other = store.addSite('user-2', { url: 'https://other.example.test/' });
    const res = await handler(post({ siteId: other.id }));
    expect(res.status).toBe(404);
    expect(checked).toEqual([]);
  });

  it('allows one check per cooldown (cannot be used to hammer a server)', async () => {
    const { handler, site, checked } = setup({ verified: false });
    expect((await handler(post({ siteId: site.id }))).status).toBe(200);
    const again = await handler(post({ siteId: site.id }));
    expect(again.status).toBe(429);
    expect(checked).toHaveLength(1);
  });

  it('replaces an expired code instead of checking it', async () => {
    const { handler, store, site, checked } = setup();
    const stored = store.sites.get(site.id);
    if (stored) stored.verifyTokenExpiresAt = new Date(Date.now() - 1000).toISOString();
    const res = await handler(post({ siteId: site.id }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'token_expired' });
    expect(store.rotated).toEqual([site.id]);
    expect(checked).toEqual([]);
  });

  it('refuses bad bodies and other websites', async () => {
    const { handler } = setup();
    expect((await handler(post({ siteId: 'nope' }))).status).toBe(400);
    const foreign = new Request('https://fn.example.test/verify-site', {
      method: 'POST',
      headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
      body: '{}',
    });
    expect((await handler(foreign)).status).toBe(403);
  });
});
