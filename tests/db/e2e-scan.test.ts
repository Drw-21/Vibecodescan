// Milestone 4 "done when": a URL goes in through create-scan and findings appear in the
// database. Real handler, real runScan, real engine and real SQL functions; only the
// internet (fake reference app) and the captcha are stand-ins.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { silentLogger } from '../../supabase/functions/_shared/log.ts';
import { runScan } from '../../supabase/functions/_shared/runScan.ts';
import { createSafeFetch } from '../../supabase/functions/_shared/scanner/safeFetch.ts';
import { createScanHandler } from '../../supabase/functions/create-scan/handler.ts';
import { REFERENCE_SITES } from '../../fixtures/reference-apps/sites.ts';
import { fakeNet } from '../../fixtures/site.ts';
import { databaseUrl, resetDatabase } from './harness.js';
import { pgStore } from './pgStore.ts';

const client = new pg.Client({ connectionString: databaseUrl() });
beforeAll(async () => {
  await client.connect();
  await resetDatabase(client);
});
afterAll(async () => {
  await client.end();
});

const ORIGIN = 'https://scanner.example.test';

describe('end to end: create-scan -> run-scan -> database', () => {
  it('a URL goes in and its findings appear in the database', async () => {
    const site = REFERENCE_SITES['ref-insecure-lovable'];
    if (!site) throw new Error('missing reference site');
    const net = fakeNet(site.routes, site.dns);
    const fetch = createSafeFetch({
      resolve: net.resolve,
      transport: net.transport,
      userAgent: 'test',
    });
    const store = pgStore(client);
    const handler = createScanHandler({
      store,
      userIdFromRequest: () => Promise.resolve(null),
      verifyTurnstile: () => Promise.resolve(true),
      clientIp: () => '203.0.113.7',
      hashIp: () => Promise.resolve('e'.repeat(64)),
      runScan: (id) => runScan(id, { store, fetch, log: silentLogger }),
      background: () => undefined,
      allowedOrigin: ORIGIN,
      log: silentLogger,
    });

    const res = await handler(
      new Request('https://fn.example.test/create-scan', {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ url: new URL(site.start).host, turnstileToken: 't' }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { scanId: string; grade: string; status: string };
    expect(body).toMatchObject({ status: 'done', grade: 'F' });

    const scans = await client.query<{
      status: string;
      grade: string;
      score: number;
      client_ip_hash: string;
      url: string;
    }>('select status, grade, score, client_ip_hash, url from public.scans where id = $1', [
      body.scanId,
    ]);
    expect(scans.rows[0]).toMatchObject({
      status: 'done',
      grade: 'F',
      client_ip_hash: 'e'.repeat(64),
      url: site.start,
    });

    const findings = await client.query<{
      check_id: string;
      status: string;
      severity: string;
      evidence_redacted: string | null;
    }>(
      'select check_id, status, severity, evidence_redacted from public.findings where scan_id = $1',
      [body.scanId],
    );
    const fails = findings.rows.filter((f) => f.status === 'fail');
    expect(fails.some((f) => f.check_id === 'secret-in-bundle' && f.severity === 'critical')).toBe(
      true,
    );
    expect(fails.filter((f) => f.check_id === 'security-headers')).toHaveLength(5);
    expect(findings.rows.length).toBeGreaterThanOrEqual(9);
    // Evidence is redacted in the database too.
    const leak = fails.find((f) => f.check_id === 'secret-in-bundle')?.evidence_redacted ?? '';
    expect(leak).toMatch(/^sk-p…/);

    // The same host cannot be scanned again straight away.
    const again = await handler(
      new Request('https://fn.example.test/create-scan', {
        method: 'POST',
        headers: { origin: ORIGIN, 'content-type': 'application/json' },
        body: JSON.stringify({ url: new URL(site.start).host, turnstileToken: 't' }),
      }),
    );
    expect(again.status).toBe(429);
  });
});
