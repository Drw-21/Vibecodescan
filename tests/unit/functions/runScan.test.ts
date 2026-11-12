import { describe, expect, it } from 'vitest';
import { runScan } from '../../../supabase/functions/_shared/runScan.ts';
import { silentLogger } from '../../../supabase/functions/_shared/log.ts';
import { createSafeFetch } from '../../../supabase/functions/_shared/scanner/safeFetch.ts';
import { REFERENCE_SITES } from '../../../fixtures/reference-apps/sites.ts';
import { fakeNet, type Site } from '../../../fixtures/site.ts';
import { appSite } from '../../../fixtures/sites.ts';
import { MemoryStore } from './memoryStore.ts';

function setup(site: Site, options: { maxDurationMs?: number } = {}) {
  const net = fakeNet(site.routes, site.dns);
  const fetch = createSafeFetch({
    resolve: net.resolve,
    transport: net.transport,
    userAgent: 'test',
    limits: { timeoutMs: 300 },
  });
  const store = new MemoryStore();
  const run = (id: string) => runScan(id, { store, fetch, log: silentLogger, ...options });
  return { store, run };
}

async function queued(store: MemoryStore, url: string): Promise<string> {
  const host = new URL(url).hostname;
  const r = await store.createScan({
    url,
    host,
    userId: null,
    siteId: null,
    kind: 'passive',
    clientIpHash: null,
    dailyLimit: 3,
    hostCooldownSeconds: 600,
  });
  if (r.outcome !== 'ok') throw new Error('not created');
  return r.scanId;
}

describe('runScan', () => {
  it('runs the engine and saves findings, grade and score', async () => {
    const site = REFERENCE_SITES['ref-insecure-lovable'];
    if (!site) throw new Error('missing site');
    const { store, run } = setup(site);
    const id = await queued(store, site.start);
    const result = await run(id);
    expect(result.status).toBe('done');
    const saved = store.scans.get(id);
    expect(saved).toMatchObject({ status: 'done', grade: 'F' });
    expect(
      saved?.findings.some((f) => f.check_id === 'secret-in-bundle' && f.status === 'fail'),
    ).toBe(true);
    expect(saved?.findings.every((f) => f.fix_prompt === null)).toBe(true);
  });

  it('does nothing when the same scan is run twice', async () => {
    const { store, run } = setup(appSite());
    const id = await queued(store, 'https://app.example.test/');
    expect((await run(id)).status).toBe('done');
    expect((await run(id)).status).toBe('skipped');
  });

  it('marks the scan failed with a code when the address is private', async () => {
    const { store, run } = setup(appSite());
    const id = await queued(store, 'http://169.254.169.254/');
    expect(await run(id)).toEqual({ status: 'failed', errorCode: 'fetch_blocked_address' });
    expect(store.scans.get(id)).toMatchObject({
      status: 'failed',
      errorCode: 'fetch_blocked_address',
    });
  });

  it('enforces the whole-scan time limit', async () => {
    const { store, run } = setup(
      appSite({ routes: { 'https://app.example.test/': { hang: true } } }),
      { maxDurationMs: 50 },
    );
    const id = await queued(store, 'https://app.example.test/');
    expect(await run(id)).toEqual({ status: 'failed', errorCode: 'scan_timeout' });
  });

  it('the whole-scan deadline really stops the scan’s requests', async () => {
    const site = appSite({ routes: { 'https://app.example.test/': { hang: true } } });
    const net = fakeNet(site.routes);
    const aborted: string[] = [];
    const transport: typeof net.transport = (url, init) => {
      init.signal.addEventListener('abort', () => aborted.push(url.href));
      return net.transport(url, init);
    };
    const fetch = createSafeFetch({ resolve: net.resolve, transport, userAgent: 'test' });
    const store = new MemoryStore();
    const id = await queued(store, 'https://app.example.test/');
    const started = Date.now();
    expect(await runScan(id, { store, fetch, log: silentLogger, maxDurationMs: 50 })).toEqual({
      status: 'failed',
      errorCode: 'scan_timeout',
    });
    expect(aborted).toEqual(['https://app.example.test/']);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('marks the scan failed (not stuck as queued) if claiming it throws', async () => {
    const { store, run } = setup(appSite());
    const id = await queued(store, 'https://app.example.test/');
    store.claimScan = () => Promise.reject(new Error('connection reset'));
    expect(await run(id)).toEqual({ status: 'failed', errorCode: 'internal' });
    expect(store.scans.get(id)?.status).toBe('failed');
  });

  it('a failed claim never fails a scan that another call is already running', async () => {
    const { store, run } = setup(appSite());
    const id = await queued(store, 'https://app.example.test/');
    const scan = store.scans.get(id);
    if (!scan) throw new Error('missing');
    scan.status = 'running'; // claimed by another call
    store.claimScan = () => Promise.reject(new Error('timeout'));
    expect(await run(id)).toEqual({ status: 'failed', errorCode: 'internal' });
    expect(store.scans.get(id)?.status).toBe('running');
  });

  it('runs deep checks only after ownership is proven again', async () => {
    const site0 = REFERENCE_SITES['ref-open-table'];
    if (!site0) throw new Error('missing site');
    const net = fakeNet(site0.routes, site0.dns);
    const fetch = createSafeFetch({
      resolve: net.resolve,
      transport: net.transport,
      userAgent: 'test',
    });
    const deepRun = async (stillOwned: boolean) => {
      const store = new MemoryStore();
      const site = store.addSite('user-1', {
        url: site0.start,
        verifiedAt: new Date().toISOString(),
      });
      const r = await store.createScan({
        url: site0.start,
        host: site.host,
        userId: 'user-1',
        siteId: site.id,
        kind: 'deep',
        clientIpHash: null,
        dailyLimit: 3,
        hostCooldownSeconds: 600,
      });
      if (r.outcome !== 'ok') throw new Error('not created');
      await runScan(r.scanId, {
        store,
        fetch,
        log: silentLogger,
        verifySite: () => Promise.resolve(stillOwned),
      });
      return { store, site, findings: store.scans.get(r.scanId)?.findings ?? [] };
    };

    const owned = await deepRun(true);
    expect(
      owned.findings.some((f) => f.check_id === 'supabase-public-tables' && f.status === 'fail'),
    ).toBe(true);
    expect(owned.store.sites.get(owned.site.id)?.verifiedAt).not.toBeNull();

    const lost = await deepRun(false);
    expect(lost.findings.some((f) => f.check_id === 'supabase-public-tables')).toBe(false);
    expect(lost.store.sites.get(lost.site.id)?.verifiedAt).toBeNull();
  });

  it('never runs deep checks for a passive scan, even of a verified site', async () => {
    const site0 = REFERENCE_SITES['ref-open-table'];
    if (!site0) throw new Error('missing site');
    const { store, run } = setup(site0);
    const site = store.addSite('user-1', {
      url: site0.start,
      verifiedAt: new Date().toISOString(),
    });
    const r = await store.createScan({
      url: site0.start,
      host: site.host,
      userId: 'user-1',
      siteId: site.id,
      kind: 'passive',
      clientIpHash: null,
      dailyLimit: 3,
      hostCooldownSeconds: 600,
    });
    if (r.outcome !== 'ok') throw new Error('not created');
    await run(r.scanId);
    expect(
      store.scans.get(r.scanId)?.findings.some((f) => f.check_id === 'supabase-public-tables'),
    ).toBe(false);
  });

  it('marks the scan failed if saving the results fails', async () => {
    const { store, run } = setup(appSite());
    store.completeScan = () => Promise.reject(new Error('constraint violated'));
    const id = await queued(store, 'https://app.example.test/');
    expect(await run(id)).toEqual({ status: 'failed', errorCode: 'internal' });
    expect(store.scans.get(id)?.status).toBe('failed');
  });
});
