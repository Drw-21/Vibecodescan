import { describe, expect, it } from 'vitest';
import { clientIp, hashIp, rateLimitKey } from '../../../supabase/functions/_shared/clientIp.ts';
import { createResolver } from '../../../supabase/functions/_shared/resolver.ts';
import { createTurnstileVerifier } from '../../../supabase/functions/_shared/turnstile.ts';
import { normaliseScanUrl, readJson } from '../../../supabase/functions/_shared/validate.ts';

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
  const req = (headers: Record<string, string>) =>
    new Request('https://fn.example.test/', { headers });

  it('reads the platform-set header', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.7' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('never trusts X-Forwarded-For, which a visitor can set to anything', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7' }))).toBeNull();
  });

  it('ignores missing or junk values', () => {
    expect(clientIp(req({}))).toBeNull();
    expect(clientIp(req({ 'cf-connecting-ip': '<script>' }))).toBeNull();
    expect(clientIp(req({ 'cf-connecting-ip': '1.2.3.4, 5.6.7.8' }))).toBeNull();
  });

  it('treats a whole IPv6 /64 as one visitor', () => {
    expect(rateLimitKey('2001:db8:aaaa:bbbb::1')).toBe('2001:db8:aaaa:bbbb::/64');
    expect(rateLimitKey('2001:db8:aaaa:bbbb:ffff::9')).toBe('2001:db8:aaaa:bbbb::/64');
    expect(rateLimitKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('hashes with a secret: 64 hex characters, stable, and different per secret', async () => {
    const a = await hashIp('203.0.113.7', 'secret-one');
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp('203.0.113.7', 'secret-one')).toBe(a);
    expect(await hashIp('203.0.113.7', 'secret-two')).not.toBe(a);
    expect(await hashIp('203.0.113.8', 'secret-one')).not.toBe(a);
    expect(await hashIp('2001:db8:1:2::1', 's')).toBe(await hashIp('2001:db8:1:2::abcd', 's'));
  });
});

describe('readJson', () => {
  const stream = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of chunks) c.enqueue(new TextEncoder().encode(chunk));
        c.close();
      },
    });

  it('reads a small JSON body', async () => {
    const r = new Request('https://fn.example.test/', {
      method: 'POST',
      body: '{"url":"a.example.com"}',
    });
    expect(await readJson(r)).toEqual({ url: 'a.example.com' });
  });

  it('refuses a declared Content-Length over the limit without reading', async () => {
    const r = new Request('https://fn.example.test/', {
      method: 'POST',
      headers: { 'content-length': '999999' },
      body: '{}',
    });
    await expect(readJson(r, 100)).rejects.toThrow(/too large/);
  });

  it('stops reading a streamed body as soon as it passes the limit', async () => {
    const r = new Request('https://fn.example.test/', {
      method: 'POST',
      body: stream(['{"a":"', 'x'.repeat(80), 'y'.repeat(80), '"}']),
      duplex: 'half',
    });
    await expect(readJson(r, 100)).rejects.toThrow(/too large/);
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
