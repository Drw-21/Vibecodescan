import { describe, expect, it } from 'vitest';
import { SAFE_FETCH } from '../../../supabase/functions/_shared/config.ts';
import { createSafeFetch } from '../../../supabase/functions/_shared/scanner/safeFetch.ts';
import type { SafeFetchErrorCode } from '../../../supabase/functions/_shared/scanner/types.ts';
import { endlessStream, fakeNet, type FakeRoute } from './fakes.ts';

const UA = 'ScannerBot/1.0 (+https://scanner.example.test/bot)';

function setup(
  routes: Record<string, FakeRoute>,
  dns: Record<string, string[]> = {},
  limits: { timeoutMs?: number; maxBytesPerResponse?: number } = {},
) {
  const net = fakeNet(routes, dns);
  const safeFetch = createSafeFetch({
    resolve: net.resolve,
    transport: net.transport,
    userAgent: UA,
    limits,
  });
  return { net, safeFetch };
}

async function expectCode(promise: Promise<unknown>, code: SafeFetchErrorCode): Promise<void> {
  await expect(promise).rejects.toMatchObject({ name: 'SafeFetchError', code });
}

describe('safeFetch: private and internal addresses (SSRF)', () => {
  it('blocks the cloud metadata address 169.254.169.254 without sending anything', async () => {
    const { net, safeFetch } = setup({});
    await expectCode(safeFetch('http://169.254.169.254/latest/meta-data/'), 'blocked_address');
    expect(net.requested).toEqual([]);
  });

  it.each([
    'http://127.0.0.1/',
    'http://localhost/',
    'http://2130706433/', // 127.0.0.1 written as one number
    'http://0177.0.0.1/', // octal
    'http://0x7f.1/', // hex
    'http://[::1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[fd00:ec2::254]/',
    'http://0.0.0.0/',
    'http://10.0.0.1/',
    'http://192.168.0.1/',
    'http://172.16.0.1/',
  ])('blocks %s', async (url) => {
    const { net, safeFetch } = setup({}, { localhost: ['127.0.0.1', '::1'] });
    await expectCode(safeFetch(url), 'blocked_address');
    expect(net.requested).toEqual([]);
  });

  it('blocks a domain that resolves to a private address', async () => {
    const { net, safeFetch } = setup({}, { 'evil.example.test': ['10.0.0.5'] });
    await expectCode(safeFetch('https://evil.example.test/'), 'blocked_address');
    expect(net.requested).toEqual([]);
  });

  it('blocks a domain if ANY of its addresses is private', async () => {
    const { safeFetch } = setup({}, { 'mixed.example.test': ['93.184.216.34', '169.254.169.254'] });
    await expectCode(safeFetch('https://mixed.example.test/'), 'blocked_address');
  });

  it('blocks a redirect to a private address (checked after every redirect)', async () => {
    const { net, safeFetch } = setup(
      {
        'https://app.example.test/': {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        },
      },
      {},
    );
    await expectCode(safeFetch('https://app.example.test/'), 'blocked_address');
    expect(net.requested).toEqual(['https://app.example.test/']);
  });

  it('blocks a redirect to a domain that resolves to a private address', async () => {
    const { net, safeFetch } = setup(
      {
        'https://app.example.test/': {
          status: 301,
          headers: { location: 'https://internal.example.test/' },
        },
      },
      { 'internal.example.test': ['fd00::1'] },
    );
    await expectCode(safeFetch('https://app.example.test/'), 'blocked_address');
    expect(net.requested).toEqual(['https://app.example.test/']);
  });

  it('fails safe when DNS fails or returns nothing', async () => {
    const empty = setup({}, { 'nothing.example.test': [] });
    await expectCode(empty.safeFetch('https://nothing.example.test/'), 'dns_failed');

    const net = fakeNet({});
    const failing = createSafeFetch({
      resolve: () => Promise.reject(new Error('NXDOMAIN')),
      transport: net.transport,
      userAgent: UA,
    });
    await expectCode(failing('https://missing.example.test/'), 'dns_failed');
    expect(net.requested).toEqual([]);
  });
});

describe('safeFetch: schemes, ports and credentials', () => {
  it.each(['ftp://app.example.test/', 'file:///etc/passwd', 'javascript:alert(1)', 'data:,hi'])(
    'blocks scheme of %s',
    async (url) => {
      const { safeFetch } = setup({});
      await expectCode(safeFetch(url), 'blocked_scheme');
    },
  );

  it.each(['http://app.example.test:8080/', 'https://app.example.test:22/'])(
    'blocks port in %s',
    async (url) => {
      const { safeFetch } = setup({});
      await expectCode(safeFetch(url), 'blocked_port');
    },
  );

  it('allows explicit ports 80 and 443', async () => {
    const { safeFetch } = setup({
      'http://app.example.test/': { body: 'a' },
      'https://app.example.test/': { body: 'b' },
    });
    await expect(safeFetch('http://app.example.test:80/')).resolves.toMatchObject({ body: 'a' });
    await expect(safeFetch('https://app.example.test:443/')).resolves.toMatchObject({ body: 'b' });
  });

  it('blocks usernames or passwords in the URL', async () => {
    const { safeFetch } = setup({});
    await expectCode(safeFetch('https://user:pass@app.example.test/'), 'blocked_credentials');
  });

  it('rejects text that is not a URL', async () => {
    const { safeFetch } = setup({});
    await expectCode(safeFetch('not a url'), 'invalid_url');
  });

  it('blocks a redirect to a forbidden scheme or port', async () => {
    const { safeFetch } = setup({
      'https://a.example.test/': { status: 302, headers: { location: 'file:///etc/passwd' } },
      'https://b.example.test/': {
        status: 302,
        headers: { location: 'http://b.example.test:6379/' },
      },
    });
    await expectCode(safeFetch('https://a.example.test/'), 'blocked_scheme');
    await expectCode(safeFetch('https://b.example.test/'), 'blocked_port');
  });
});

describe('safeFetch: redirects', () => {
  it('follows up to 5 redirects, resolving relative locations', async () => {
    const routes: Record<string, FakeRoute> = {};
    for (let i = 0; i < 5; i++) {
      routes[`https://app.example.test/${String(i)}`] = {
        status: 302,
        headers: { location: `/${String(i + 1)}` },
      };
    }
    routes['https://app.example.test/5'] = { body: 'done' };
    const { safeFetch } = setup(routes);
    const res = await safeFetch('https://app.example.test/0');
    expect(res).toMatchObject({ url: 'https://app.example.test/5', status: 200, body: 'done' });
    expect(res.redirects).toHaveLength(5);
  });

  it('stops at the 6th redirect', async () => {
    const routes: Record<string, FakeRoute> = {};
    for (let i = 0; i < 10; i++) {
      routes[`https://app.example.test/${String(i)}`] = {
        status: 302,
        headers: { location: `/${String(i + 1)}` },
      };
    }
    const { net, safeFetch } = setup(routes);
    await expectCode(safeFetch('https://app.example.test/0'), 'too_many_redirects');
    expect(net.requested).toHaveLength(SAFE_FETCH.maxRedirects + 1);
  });

  it('returns a redirect with no Location as the final response', async () => {
    const { safeFetch } = setup({ 'https://app.example.test/': { status: 302 } });
    await expect(safeFetch('https://app.example.test/')).resolves.toMatchObject({ status: 302 });
  });
});

describe('safeFetch: size and time limits', () => {
  it('cuts an endless body at the byte cap instead of reading it all', async () => {
    const { safeFetch } = setup(
      { 'https://app.example.test/big.js': { body: endlessStream() } },
      {},
      { maxBytesPerResponse: 100_000 },
    );
    const res = await safeFetch('https://app.example.test/big.js');
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBe(100_000);
  });

  it('never raises the cap above the configured maximum', async () => {
    const { safeFetch } = setup(
      { 'https://app.example.test/big.js': { body: endlessStream() } },
      {},
      { maxBytesPerResponse: 1000 },
    );
    const res = await safeFetch('https://app.example.test/big.js', { maxBytes: 10_000_000 });
    expect(res.body.length).toBe(1000);
  });

  it('lets a caller lower the cap for one request', async () => {
    const { safeFetch } = setup({ 'https://app.example.test/': { body: 'abcdefghij' } });
    const res = await safeFetch('https://app.example.test/', { maxBytes: 4 });
    expect(res).toMatchObject({ body: 'abcd', truncated: true });
  });

  it('reports a small body as complete', async () => {
    const { safeFetch } = setup({ 'https://app.example.test/': { body: 'hello' } });
    await expect(safeFetch('https://app.example.test/')).resolves.toMatchObject({
      body: 'hello',
      truncated: false,
      redirects: [],
    });
  });

  it('gives up after the time limit', async () => {
    const { safeFetch } = setup(
      { 'https://slow.example.test/': { hang: true } },
      {},
      { timeoutMs: 50 },
    );
    await expectCode(safeFetch('https://slow.example.test/'), 'timeout');
  });

  it('stops when the caller aborts', async () => {
    const { safeFetch } = setup({ 'https://slow.example.test/': { hang: true } });
    const controller = new AbortController();
    const pending = safeFetch('https://slow.example.test/', { signal: controller.signal });
    controller.abort();
    await expectCode(pending, 'aborted');
  });

  it('wraps transport failures as network errors', async () => {
    const net = fakeNet({});
    const safeFetch = createSafeFetch({
      resolve: net.resolve,
      transport: () => Promise.reject(new TypeError('connection reset')),
      userAgent: UA,
    });
    await expectCode(safeFetch('https://app.example.test/'), 'network');
  });
});

describe('safeFetch: identity', () => {
  it('identifies itself and cannot be made to impersonate a browser', async () => {
    const { net, safeFetch } = setup({ 'https://app.example.test/': { body: 'ok' } });
    await safeFetch('https://app.example.test/', {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' },
    });
    const headers = net.seenHeaders.get('https://app.example.test/');
    expect(headers?.get('user-agent')).toBe(UA);
    expect(headers?.get('accept')).toBe('text/html');
  });
});
