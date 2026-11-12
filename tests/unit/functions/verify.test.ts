import { describe, expect, it } from 'vitest';
import { createSafeFetch } from '../../../supabase/functions/_shared/scanner/safeFetch.ts';
import { type TxtLookup, verifyOwnership } from '../../../supabase/functions/_shared/verify.ts';
import { type FakeRoute, fakeNet } from '../../../fixtures/site.ts';

const TOKEN = 'c'.repeat(64);
const SITE = { url: 'https://myapp.example.test/', host: 'myapp.example.test', token: TOKEN };
const FILE = 'https://myapp.example.test/.well-known/scanner-verify.txt';

function deps(routes: Record<string, FakeRoute>, txt: TxtLookup = () => Promise.resolve([])) {
  const net = fakeNet(routes);
  return {
    net,
    deps: {
      fetch: createSafeFetch({ resolve: net.resolve, transport: net.transport, userAgent: 'test' }),
      lookupTxt: txt,
      timeoutMs: 500,
    },
  };
}

describe('verifyOwnership', () => {
  it('accepts the DNS TXT record', async () => {
    const { deps: d } = deps({}, () => Promise.resolve(['v=spf1 -all', `scanner-verify=${TOKEN}`]));
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: true, method: 'dns' });
  });

  it.each([`scanner-verify=${TOKEN}`, `${TOKEN}\n`, `  scanner-verify=${TOKEN}  `])(
    'accepts the file %#',
    async (body) => {
      const { deps: d } = deps({ [FILE]: { body } });
      expect(await verifyOwnership(SITE, d)).toEqual({ verified: true, method: 'file' });
    },
  );

  it('refuses a wrong or another site’s token', async () => {
    const { deps: d } = deps({ [FILE]: { body: `scanner-verify=${'d'.repeat(64)}` } }, () =>
      Promise.resolve([`scanner-verify=${'d'.repeat(64)}`]),
    );
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: false });
  });

  it('refuses a page that only contains the token among other text', async () => {
    const { deps: d } = deps({ [FILE]: { body: `<html>${TOKEN}</html>` } });
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: false });
  });

  it('false-positive trap: a catch-all app page is not the file', async () => {
    const { deps: d } = deps({
      'https://myapp.example.test/*': { body: '<!doctype html><div id="root"></div>' },
    });
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: false });
  });

  it('refuses a file reached by redirecting to another host (verification bypass)', async () => {
    const { deps: d } = deps({
      [FILE]: { status: 302, headers: { location: 'https://attacker.example.test/token.txt' } },
      'https://attacker.example.test/token.txt': { body: `scanner-verify=${TOKEN}` },
    });
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: false });
  });

  it('accepts a redirect that stays on the same host', async () => {
    const { deps: d } = deps({
      [FILE]: { status: 301, headers: { location: '/.well-known/scanner-verify.txt?v=2' } },
      'https://myapp.example.test/.well-known/scanner-verify.txt?v=2': { body: TOKEN },
    });
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: true, method: 'file' });
  });

  it('refuses when the stored host does not match the stored URL', async () => {
    const { deps: d, net } = deps({ [FILE]: { body: TOKEN } }, () =>
      Promise.resolve([`scanner-verify=${TOKEN}`]),
    );
    expect(await verifyOwnership({ ...SITE, host: 'victim.example.test' }, d)).toEqual({
      verified: false,
    });
    expect(net.requested).toEqual([]);
  });

  it('fails closed when DNS and the website both fail', async () => {
    const { deps: d } = deps({ [FILE]: { refuse: true } }, () =>
      Promise.reject(new Error('SERVFAIL')),
    );
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: false });
  });

  it('gives up on a website that never answers', async () => {
    const { deps: d } = deps({ [FILE]: { hang: true } });
    expect(await verifyOwnership(SITE, d)).toEqual({ verified: false });
  });
});
