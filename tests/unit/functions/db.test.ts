// The Supabase adapter maps each store method to exactly one SQL function call.

import { describe, expect, it } from 'vitest';
import {
  serviceClient,
  supabaseStore,
  userIdFromRequest,
} from '../../../supabase/functions/_shared/db.ts';

interface Call {
  url: string;
  method: string;
  body: unknown;
  auth: string | null;
}

function fakeSupabase(respond: (url: string) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchFake = ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const headers = new Headers(init?.headers);
    const text = typeof init?.body === 'string' ? init.body : null;
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: text ? (JSON.parse(text) as unknown) : null,
      auth: headers.get('authorization'),
    });
    const r = respond(url);
    return Promise.resolve(Response.json(r.body, { status: r.status ?? 200 }));
  }) as typeof fetch;
  const client = serviceClient('https://proj.supabase.test', 'service-key', fetchFake);
  return { client, store: supabaseStore(client), calls };
}

describe('supabaseStore', () => {
  it('creates a scan through create_scan_with_limits', async () => {
    const { store, calls } = fakeSupabase(() => ({
      body: [{ scan_id: 'scan-1', outcome: 'ok', retry_after_seconds: 0 }],
    }));
    const result = await store.createScan({
      url: 'https://a.example.com/',
      host: 'a.example.com',
      userId: null,
      kind: 'passive',
      clientIpHash: 'f'.repeat(64),
      dailyLimit: 3,
      hostCooldownSeconds: 600,
    });
    expect(result).toEqual({ outcome: 'ok', scanId: 'scan-1' });
    expect(calls[0]).toMatchObject({
      url: 'https://proj.supabase.test/rest/v1/rpc/create_scan_with_limits',
      method: 'POST',
      auth: 'Bearer service-key',
      body: {
        p_url: 'https://a.example.com/',
        p_host: 'a.example.com',
        p_user_id: null,
        p_site_id: null,
        p_kind: 'passive',
        p_client_ip_hash: 'f'.repeat(64),
        p_daily_limit: 3,
        p_host_cooldown_seconds: 600,
      },
    });
  });

  it('passes limit refusals through', async () => {
    const { store } = fakeSupabase(() => ({
      body: [{ scan_id: null, outcome: 'host_cooldown', retry_after_seconds: 420 }],
    }));
    const result = await store.createScan({
      url: 'u',
      host: 'h',
      userId: null,
      kind: 'passive',
      clientIpHash: null,
      dailyLimit: 3,
      hostCooldownSeconds: 600,
    });
    expect(result).toEqual({ outcome: 'host_cooldown', retryAfterSeconds: 420 });
  });

  it('claims, completes and fails scans through their SQL functions', async () => {
    const { store, calls } = fakeSupabase((url) => {
      if (url.endsWith('/claim_scan')) {
        return {
          body: [
            {
              id: 's1',
              url: 'https://a.example.com/',
              host: 'a.example.com',
              kind: 'passive',
              user_id: null,
              site_id: null,
            },
          ],
        };
      }
      return { body: true };
    });
    expect(await store.claimScan('s1')).toMatchObject({ id: 's1', kind: 'passive', userId: null });
    expect(await store.completeScan('s1', [], 'A', 100)).toBe(true);
    expect(await store.failScan('s1', 'internal')).toBe(true);
    expect(calls.map((c) => c.url.split('/rpc/')[1])).toEqual([
      'claim_scan',
      'complete_scan',
      'fail_scan',
    ]);
    expect(calls[1]?.body).toEqual({ p_scan_id: 's1', p_findings: [], p_grade: 'A', p_score: 100 });
  });

  it('returns null when there is nothing to claim', async () => {
    const { store } = fakeSupabase(() => ({ body: [] }));
    expect(await store.claimScan('s1')).toBeNull();
  });

  it('throws on a database error (never treats it as success)', async () => {
    const { store } = fakeSupabase(() => ({
      status: 400,
      body: { code: '42501', message: 'permission denied' },
    }));
    await expect(store.failScan('s1', 'x')).rejects.toThrow(/42501/);
  });
});

describe('userIdFromRequest', () => {
  const req = (auth?: string) =>
    new Request('https://fn.example.test/', { headers: auth ? { authorization: auth } : {} });

  it('returns the signed-in user', async () => {
    const { client, calls } = fakeSupabase(() => ({
      body: {
        id: 'user-1',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '',
      },
    }));
    expect(await userIdFromRequest(client, req('Bearer user-jwt'))).toBe('user-1');
    expect(calls[0]).toMatchObject({
      url: 'https://proj.supabase.test/auth/v1/user',
      auth: 'Bearer user-jwt',
    });
  });

  it('returns null for anonymous visitors and invalid tokens', async () => {
    const { client } = fakeSupabase(() => ({ status: 401, body: { message: 'invalid JWT' } }));
    expect(await userIdFromRequest(client, req())).toBeNull();
    expect(await userIdFromRequest(client, req('Bearer anon-key'))).toBeNull();
  });
});
