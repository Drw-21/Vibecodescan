import { describe, expect, it } from 'vitest';
import { silentLogger } from '../../../supabase/functions/_shared/log.ts';
import type { RunScanResult } from '../../../supabase/functions/_shared/runScan.ts';
import { score } from '../../../supabase/functions/_shared/scanner/score.ts';
import type { Finding } from '../../../supabase/functions/_shared/scanner/types.ts';
import {
  type CreateScanDeps,
  createScanHandler,
} from '../../../supabase/functions/create-scan/handler.ts';
import { runScanHandler } from '../../../supabase/functions/run-scan/handler.ts';
import { MemoryStore } from './memoryStore.ts';

const ORIGIN = 'https://scanner.example.test';

const fail = (title: string, severity: Finding['severity']): Finding => ({
  checkId: 'x',
  status: 'fail',
  severity,
  title,
  explanation: 'secret explanation text',
  evidenceRedacted: 'sk_l…x9Q2 in /assets/a.js',
  fixKey: 'x',
});
const FINDINGS = [
  fail('Low one', 'low'),
  fail('Critical one', 'critical'),
  fail('High one', 'high'),
  fail('Medium one', 'medium'),
];
const DONE: RunScanResult = { status: 'done', findings: FINDINGS, result: score(FINDINGS) };

function setup(overrides: Partial<CreateScanDeps> = {}) {
  const store = new MemoryStore();
  const ran: string[] = [];
  const backgrounded: Promise<unknown>[] = [];
  const hashed: string[] = [];
  const deps: CreateScanDeps = {
    store,
    userIdFromRequest: () => Promise.resolve(null),
    verifyTurnstile: (token) => Promise.resolve(token === 'good-token'),
    clientIp: (req) => req.headers.get('x-forwarded-for'),
    hashIp: (ip) => {
      hashed.push(ip);
      return Promise.resolve('f'.repeat(64));
    },
    runScan: (id) => {
      ran.push(id);
      return Promise.resolve(DONE);
    },
    background: (work) => backgrounded.push(work),
    allowedOrigin: ORIGIN,
    log: silentLogger,
    ...overrides,
  };
  return { handler: createScanHandler(deps), store, ran, backgrounded, hashed };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://fn.example.test/create-scan', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      'x-forwarded-for': '203.0.113.7',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function read(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe('create-scan', () => {
  it('answers the CORS preflight for our site only', async () => {
    const res = await setup().handler(
      new Request('https://fn.example.test/', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });

  it('refuses other methods and other websites', async () => {
    const { handler } = setup();
    expect((await handler(new Request('https://fn.example.test/'))).status).toBe(405);
    const res = await handler(
      post(
        { url: 'a.example.com', turnstileToken: 'good-token' },
        { origin: 'https://evil.example' },
      ),
    );
    expect(res.status).toBe(403);
    expect(await read(res)).toMatchObject({ error: 'forbidden_origin' });
  });

  it.each([['not json{'], [{}], [{ url: 123 }], [{ url: 'x'.repeat(3000) }]])(
    'refuses a bad body %#',
    async (body) => {
      const res = await setup().handler(post(body));
      expect(res.status).toBe(400);
      expect(await read(res)).toMatchObject({ error: 'invalid_body' });
    },
  );

  it('refuses a body over the size limit', async () => {
    const res = await setup().handler(post({ url: 'a.example.com', pad: 'x'.repeat(10_000) }));
    expect(res.status).toBe(400);
  });

  it.each(['http://localhost', 'http://169.254.169.254/', 'ftp://a.example.com'])(
    'refuses address %s',
    async (url) => {
      const { handler, store } = setup();
      const res = await handler(post({ url, turnstileToken: 'good-token' }));
      expect(res.status).toBe(400);
      expect(await read(res)).toMatchObject({ error: 'invalid_url' });
      expect(store.inputs).toEqual([]);
    },
  );

  it('requires the captcha from anonymous visitors', async () => {
    const { handler, store } = setup();
    for (const body of [
      { url: 'a.example.com' },
      { url: 'a.example.com', turnstileToken: 'bad' },
    ]) {
      const res = await handler(post(body));
      expect(res.status).toBe(403);
      expect(await read(res)).toMatchObject({ error: 'captcha_failed' });
    }
    expect(store.inputs).toEqual([]);
  });

  it('returns the Free summary once to an anonymous visitor — nothing more', async () => {
    const { handler, store, ran, hashed } = setup();
    const res = await handler(
      post({ url: 'https://MyApp.example.com/?ref=ad', turnstileToken: 'good-token' }),
    );
    expect(res.status).toBe(200);
    const body = await read(res);
    expect(body).toMatchObject({
      status: 'done',
      grade: 'F',
      counts: { critical: 1, high: 1, medium: 1, low: 1, info: 0 },
      topIssues: ['Critical one', 'High one', 'Medium one'],
    });
    expect(Object.keys(body).sort()).toEqual([
      'counts',
      'grade',
      'partial',
      'scanId',
      'score',
      'status',
      'topIssues',
    ]);
    const text = JSON.stringify(body);
    expect(text).not.toContain('secret explanation');
    expect(text).not.toContain('sk_l');
    expect(ran).toHaveLength(1);
    // Stored: clean URL (no query string), the IP only as a hash.
    expect(store.inputs[0]).toMatchObject({
      url: 'https://myapp.example.com/',
      host: 'myapp.example.com',
      userId: null,
      clientIpHash: 'f'.repeat(64),
      dailyLimit: 3,
      hostCooldownSeconds: 600,
    });
    expect(hashed).toEqual(['203.0.113.7']);
    expect(JSON.stringify(store.inputs)).not.toContain('203.0.113.7');
  });

  it('tells an anonymous visitor plainly when the scan failed', async () => {
    const { handler } = setup({
      runScan: () => Promise.resolve({ status: 'failed', errorCode: 'fetch_dns_failed' }),
    });
    const body = await read(
      await handler(post({ url: 'a.example.com', turnstileToken: 'good-token' })),
    );
    expect(body).toMatchObject({ status: 'failed', error: 'fetch_dns_failed' });
    expect(String(body['message'])).toMatch(/could not find a public website/);
  });

  it('starts a signed-in user’s scan in the background, without a captcha', async () => {
    const { handler, store, ran, backgrounded } = setup({
      userIdFromRequest: () => Promise.resolve('user-1'),
    });
    const res = await handler(post({ url: 'a.example.com' }));
    expect(res.status).toBe(202);
    expect(await read(res)).toMatchObject({ status: 'queued' });
    expect(backgrounded).toHaveLength(1);
    expect(ran).toHaveLength(1);
    expect(store.inputs[0]?.userId).toBe('user-1');
  });

  it.each([
    ['daily_limit', 3600],
    ['host_cooldown', 420],
  ] as const)('refuses with 429 and Retry-After on %s', async (outcome, retry) => {
    const res0 = setup();
    res0.store.nextOutcome = { outcome, retryAfterSeconds: retry };
    const res = await res0.handler(post({ url: 'a.example.com', turnstileToken: 'good-token' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe(String(retry));
    expect(await read(res)).toMatchObject({ error: outcome });
    expect(res0.ran).toEqual([]);
  });

  it('refuses an anonymous scan when the visitor’s IP is unknown (no per-IP limit possible)', async () => {
    const { handler, store } = setup({ clientIp: () => null });
    const res = await handler(post({ url: 'a.example.com', turnstileToken: 'good-token' }));
    expect(res.status).toBe(403);
    expect(await read(res)).toMatchObject({ error: 'no_client_ip' });
    expect(store.inputs).toEqual([]);
  });

  it('lets a signed-in user scan without a known IP (account limit still applies)', async () => {
    const { handler, store } = setup({
      clientIp: () => null,
      userIdFromRequest: () => Promise.resolve('user-1'),
    });
    const res = await handler(post({ url: 'a.example.com' }));
    expect(res.status).toBe(202);
    expect(store.inputs[0]).toMatchObject({ userId: 'user-1', clientIpHash: null });
  });

  it('turns an unexpected error into a readable 500 with CORS, leaking nothing', async () => {
    const logged: string[] = [];
    const { handler, store } = setup({
      log: {
        info: () => undefined,
        error: (msg, fields) => logged.push(JSON.stringify({ msg, ...fields })),
      },
    });
    store.createScan = () =>
      Promise.reject(new Error('create_scan_with_limits: 42P01 relation "x" does not exist'));
    const res = await handler(post({ url: 'a.example.com', turnstileToken: 'good-token' }));
    expect(res.status).toBe(500);
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const text = JSON.stringify(await read(res));
    expect(text).not.toContain('42P01');
    expect(logged.join('')).not.toContain('relation');
  });
});

describe('run-scan endpoint', () => {
  const KEY = 'service-role-key-for-tests';
  const handler = runScanHandler({
    serviceRoleKey: KEY,
    runScan: () => Promise.resolve({ status: 'skipped' }),
  });
  const req = (auth: string | null, body: unknown) =>
    new Request('https://fn.example.test/run-scan', {
      method: 'POST',
      headers: auth ? { authorization: auth } : {},
      body: JSON.stringify(body),
    });
  const id = '00000000-0000-4000-8000-000000000001';

  it('refuses callers without the service role key', async () => {
    expect((await handler(req(null, { scanId: id }))).status).toBe(401);
    expect((await handler(req('Bearer anon-key', { scanId: id }))).status).toBe(401);
  });

  it('refuses a bad body', async () => {
    expect((await handler(req(`Bearer ${KEY}`, { scanId: 'nope' }))).status).toBe(400);
  });

  it('runs the scan for the service role', async () => {
    const res = await handler(req(`Bearer ${KEY}`, { scanId: id }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'skipped' });
  });

  it('answers 500 instead of crashing when the scan step throws', async () => {
    const broken = runScanHandler({
      serviceRoleKey: KEY,
      runScan: () => Promise.reject(new Error('db down')),
    });
    expect((await broken(req(`Bearer ${KEY}`, { scanId: id }))).status).toBe(500);
  });

  it('never accepts an empty key, even if configured empty', async () => {
    const open = runScanHandler({
      serviceRoleKey: '',
      runScan: () => Promise.resolve({ status: 'skipped' }),
    });
    expect((await open(req('Bearer ', { scanId: id }))).status).toBe(401);
  });
});
