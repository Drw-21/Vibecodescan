import { describe, expect, it } from 'vitest';
import { clientIp, hashIp } from '../../../supabase/functions/_shared/clientIp.ts';
import { createResolver } from '../../../supabase/functions/_shared/resolver.ts';
import { createTurnstileVerifier } from '../../../supabase/functions/_shared/turnstile.ts';
import { normaliseScanUrl } from '../../../supabase/functions/_shared/validate.ts';

describe('normaliseScanUrl', () => {
  it.each([
    ['myapp.lovable.app', 'https://myapp.lovable.app/', 'myapp.lovable.app'],
    ['  https://MyApp.com/dashboard?ref=x#top ', 'https://myapp.com/dashboard', 'myapp.com'],
    ['http://example.co.uk', 'http://example.co.uk/', 'example.co.uk'],
    ['xn--bcher-kva.example', 'https://xn--bcher-kva.example/', 'xn--bcher-kva.example'],
  ])('accepts %j', (input, url, host) => {
    expect(normaliseScanUrl(input)).toEqual({ url, host });
  });

  it.each([
    '',
    'not a url',
    'javascript:alert(1)',
    'ftp://example.com',
    'file:///etc/passwd',
    'http://localhost',
    'http://127.0.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/',
    'http://2130706433/',
    'https://example.com:8443/',
    'https://user:pass@example.com/',
    'https://intranet/',
    'https://example.123/',
  ])('refuses %j', (input) => {
    expect(normaliseScanUrl(input)).toBeNull();
  });
});

describe('clientIp and hashIp', () => {
  const req = (xff?: string) =>
    new Request('https://fn.example.test/', { headers: xff ? { 'x-forwarded-for': xff } : {} });

  it('takes the first address in X-Forwarded-For', () => {
    expect(clientIp(req('203.0.113.7, 10.0.0.1'))).toBe('203.0.113.7');
    expect(clientIp(req('2001:db8::1'))).toBe('2001:db8::1');
  });

  it('ignores missing or junk values', () => {
    expect(clientIp(req())).toBeNull();
    expect(clientIp(req('<script>'))).toBeNull();
  });

  it('hashes with a secret: 64 hex characters, stable, and different per secret', async () => {
    const a = await hashIp('203.0.113.7', 'secret-one');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('203.0.113.7', 'secret-one')).toBe(a);
    expect(await hashIp('203.0.113.7', 'secret-two')).not.toBe(a);
    expect(a).not.toContain('203');
  });
});

describe('createTurnstileVerifier', () => {
  function verifier(respond: () => Promise<Response>) {
    const sent: URLSearchParams[] = [];
    const fetchFake = ((_url: string, init?: RequestInit) => {
      sent.push(init?.body as URLSearchParams);
      return respond();
    }) as typeof fetch;
    return { verify: createTurnstileVerifier({ secret: 's3cret', fetch: fetchFake }), sent };
  }

  it('accepts a token Cloudflare confirms, sending the secret and IP', async () => {
    const { verify, sent } = verifier(() => Promise.resolve(Response.json({ success: true })));
    expect(await verify('tok', '203.0.113.7')).toBe(true);
    expect(sent[0]?.get('secret')).toBe('s3cret');
    expect(sent[0]?.get('response')).toBe('tok');
    expect(sent[0]?.get('remoteip')).toBe('203.0.113.7');
  });

  it.each([
    ['Cloudflare says no', () => Promise.resolve(Response.json({ success: false }))],
    ['an error status', () => Promise.resolve(new Response('oops', { status: 500 }))],
    ['a malformed answer', () => Promise.resolve(Response.json({ ok: 1 }))],
    ['not JSON', () => Promise.resolve(new Response('<html>'))],
    ['a network failure', () => Promise.reject(new TypeError('offline'))],
  ])('refuses on %s (fails closed)', async (_name, respond) => {
    expect(await verifier(respond).verify('tok', null)).toBe(false);
  });
});

describe('createResolver', () => {
  class NotFound extends Error {}
  const isNoRecords = (e: unknown) => e instanceof NotFound;
  const signal = new AbortController().signal;

  it('returns every A and AAAA address', async () => {
    const resolve = createResolver(
      (_h, type) => Promise.resolve(type === 'A' ? ['93.184.216.34'] : ['2606:2800::1']),
      isNoRecords,
    );
    expect((await resolve('a.test', signal)).sort()).toEqual(['2606:2800::1', '93.184.216.34']);
  });

  it('treats "no records of this type" as empty', async () => {
    const resolve = createResolver(
      (_h, type) =>
        type === 'A' ? Promise.resolve(['93.184.216.34']) : Promise.reject(new NotFound()),
      isNoRecords,
    );
    expect(await resolve('a.test', signal)).toEqual(['93.184.216.34']);
  });

  it('fails when a lookup fails for any other reason (never guesses)', async () => {
    const resolve = createResolver(
      (_h, type) =>
        type === 'A' ? Promise.resolve(['93.184.216.34']) : Promise.reject(new Error('SERVFAIL')),
      isNoRecords,
    );
    await expect(resolve('a.test', signal)).rejects.toThrow('SERVFAIL');
  });

  it('passes the abort signal to every lookup', async () => {
    const seen: AbortSignal[] = [];
    const resolve = createResolver((_h, _t, s) => {
      seen.push(s);
      return Promise.resolve([]);
    }, isNoRecords);
    await resolve('a.test', signal);
    expect(seen).toEqual([signal, signal]);
  });
});
