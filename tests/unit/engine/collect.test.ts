import { describe, expect, it } from 'vitest';
import { collect } from '../../../supabase/functions/_shared/scanner/collect.ts';
import { createSafeFetch } from '../../../supabase/functions/_shared/scanner/safeFetch.ts';
import { fakeNet, type FakeRoute } from './fakes.ts';

const limits = {
  maxBundles: 25,
  maxBytesPerBundle: 2 * 1024 * 1024,
  maxTotalBytes: 5 * 1024 * 1024,
  timeoutMs: 10_000,
  bundleConcurrency: 4,
};

function setup(routes: Record<string, FakeRoute>) {
  const net = fakeNet(routes);
  const fetch = createSafeFetch({
    resolve: net.resolve,
    transport: net.transport,
    userAgent: 'test',
  });
  return { net, fetch };
}

const page = (body: string, headers: Record<string, string> = {}): FakeRoute => ({
  body,
  headers: { 'content-type': 'text/html', ...headers },
});

describe('collect', () => {
  it('loads the page once and its same-host script bundles', async () => {
    const { net, fetch } = setup({
      'https://app.example.test/': page(
        `<html><head>
          <script type="module" crossorigin src="/assets/index-abc.js"></script>
          <link rel="modulepreload" href="/assets/vendor-def.js">
          <script src='https://app.example.test/assets/index-abc.js'></script>
          <script src=chunk.js></script>
          <script>inline()</script>
        </head></html>`,
        { 'x-test': '1' },
      ),
      'https://app.example.test/assets/index-abc.js': { body: 'console.log(1)' },
      'https://app.example.test/assets/vendor-def.js': { body: 'vendor()' },
      'https://app.example.test/chunk.js': { body: 'chunk()' },
    });
    const result = await collect('https://app.example.test/', { fetch, limits });
    expect(result.url.href).toBe('https://app.example.test/');
    expect(result.headers.get('x-test')).toBe('1');
    expect(result.html).toContain('inline()');
    expect(result.bundles.map((b) => b.url).sort()).toEqual([
      'https://app.example.test/assets/index-abc.js',
      'https://app.example.test/assets/vendor-def.js',
      'https://app.example.test/chunk.js',
    ]);
    expect(result.bundlesComplete).toBe(true);
    expect(net.requested.filter((u) => u === 'https://app.example.test/')).toHaveLength(1);
  });

  it('follows redirects and uses the final page as the base URL', async () => {
    const { fetch } = setup({
      'http://app.example.test/': {
        status: 301,
        headers: { location: 'https://app.example.test/home' },
      },
      'https://app.example.test/home': page('<script src="main.js"></script>'),
      'https://app.example.test/main.js': { body: 'main()' },
    });
    const result = await collect('http://app.example.test/', { fetch, limits });
    expect(result.url.href).toBe('https://app.example.test/home');
    expect(result.bundles.map((b) => b.url)).toEqual(['https://app.example.test/main.js']);
  });

  it('skips third-party scripts (not the founder’s code)', async () => {
    const { net, fetch } = setup({
      'https://app.example.test/': page(
        '<script src="https://www.googletagmanager.com/gtag.js"></script><script src="/a.js"></script>',
      ),
      'https://app.example.test/a.js': { body: 'a' },
    });
    const result = await collect('https://app.example.test/', { fetch, limits });
    expect(result.bundles.map((b) => b.url)).toEqual(['https://app.example.test/a.js']);
    expect(net.requested.some((u) => u.includes('googletagmanager'))).toBe(false);
  });

  it('never fetches script URLs with odd schemes', async () => {
    const { net, fetch } = setup({
      'https://app.example.test/': page(
        '<script src="javascript:alert(1)"></script><script src="data:text/javascript,1"></script>',
      ),
    });
    const result = await collect('https://app.example.test/', { fetch, limits });
    expect(result.bundles).toEqual([]);
    expect(result.bundlesComplete).toBe(true);
    expect(net.requested).toEqual(['https://app.example.test/']);
  });

  it('fetches at most 25 bundles and marks the set incomplete', async () => {
    const routes: Record<string, FakeRoute> = {};
    let html = '';
    for (let i = 0; i < 30; i++) {
      html += `<script src="/b${String(i)}.js"></script>`;
      routes[`https://app.example.test/b${String(i)}.js`] = { body: `b${String(i)}` };
    }
    routes['https://app.example.test/'] = page(html);
    const { fetch } = setup(routes);
    const result = await collect('https://app.example.test/', { fetch, limits });
    expect(result.bundles).toHaveLength(25);
    expect(result.bundlesComplete).toBe(false);
  });

  it('never READS more than the 5 MB total, even with parallel downloads', async () => {
    let served = 0;
    const counting = (): ReadableStream<Uint8Array> => {
      const chunk = new Uint8Array(64 * 1024).fill(120);
      return new ReadableStream({
        pull(controller) {
          served += chunk.byteLength;
          controller.enqueue(chunk);
        },
      });
    };
    const routes: Record<string, FakeRoute> = {};
    let html = '';
    for (let i = 0; i < 8; i++) {
      html += `<script src="/big${String(i)}.js"></script>`;
      routes[`https://app.example.test/big${String(i)}.js`] = { body: counting() };
    }
    routes['https://app.example.test/'] = page(html);
    const { fetch } = setup(routes);
    const result = await collect('https://app.example.test/', { fetch, limits });
    const kept = result.html.length + result.bundles.reduce((n, b) => n + b.body.length, 0);
    expect(kept).toBeLessThanOrEqual(limits.maxTotalBytes);
    // A stream may buffer one chunk ahead per download, nothing more.
    expect(served).toBeLessThanOrEqual(limits.maxTotalBytes + 8 * 2 * 64 * 1024);
    expect(result.bundlesComplete).toBe(false);
  });

  it('marks the set incomplete when a bundle fails to load', async () => {
    const { fetch } = setup({
      'https://app.example.test/': page(
        '<script src="/ok.js"></script><script src="/missing.js"></script>',
      ),
      'https://app.example.test/ok.js': { body: 'ok' },
      'https://app.example.test/missing.js': { status: 500, body: 'error' },
    });
    const result = await collect('https://app.example.test/', { fetch, limits });
    expect(result.bundles.map((b) => b.url)).toEqual(['https://app.example.test/ok.js']);
    expect(result.bundlesComplete).toBe(false);
  });

  it('fails the scan when the page itself cannot be loaded', async () => {
    const { fetch } = setup({});
    await expect(collect('http://169.254.169.254/', { fetch, limits })).rejects.toMatchObject({
      code: 'blocked_address',
    });
  });

  it('gives up on slow bundles when the 10-second collect budget runs out', async () => {
    const { fetch } = setup({
      'https://app.example.test/': page('<script src="/slow.js"></script>'),
      'https://app.example.test/slow.js': { hang: true },
    });
    const result = await collect('https://app.example.test/', {
      fetch,
      limits: { ...limits, timeoutMs: 50 },
    });
    expect(result.bundles).toEqual([]);
    expect(result.bundlesComplete).toBe(false);
  });
});
