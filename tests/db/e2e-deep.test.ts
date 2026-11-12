// Milestone 6 "done when": deep checks run only on verified sites. Real create-scan handler,
// runScan, engine and SQL functions on Postgres; only the internet is a stand-in. Both
// reference apps have the same open "profiles" table; only the verified one is checked.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { silentLogger } from '../../supabase/functions/_shared/log.ts';
import { runScan } from '../../supabase/functions/_shared/runScan.ts';
import { createSafeFetch } from '../../supabase/functions/_shared/scanner/safeFetch.ts';
import { verifyOwnership } from '../../supabase/functions/_shared/verify.ts';
import { createScanHandler } from '../../supabase/functions/create-scan/handler.ts';
import { REFERENCE_SITES } from '../../fixtures/reference-apps/sites.ts';
import { fakeNet } from '../../fixtures/site.ts';
import { databaseUrl, firstId, resetDatabase } from './harness.js';
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

/** fileInPlace: whether the owner's verification file is still on the site at scan time. */
async function scanSavedSite(appId: string, verified: boolean, fileInPlace = true) {
  const app = REFERENCE_SITES[appId];
  if (!app) throw new Error(`missing ${appId}`);
  const user = firstId(
    (
      await client.query<{ id: string }>(
        `insert into auth.users (id, aud, role, email) values (gen_random_uuid(), 'authenticated', 'authenticated', $1) returning id`,
        [`${appId}@example.test`],
      )
    ).rows,
  );
  const site = firstId(
    (
      await client.query<{ id: string }>(
        `insert into public.sites (user_id, url, verified_at) values ($1, $2, ${verified ? 'now()' : 'null'}) returning id`,
        [user, app.start],
      )
    ).rows,
  );

  const [{ verify_token: token } = { verify_token: '' }] = (
    await client.query<{ verify_token: string }>(
      'select verify_token from public.sites where id = $1',
      [site],
    )
  ).rows;
  const fileUrl = `${new URL(app.start).origin}/.well-known/scanner-verify.txt`;
  const routes = fileInPlace
    ? { ...app.routes, [fileUrl]: { body: `scanner-verify=${token}` } }
    : app.routes;
  const net = fakeNet(routes, app.dns);
  const fetch = createSafeFetch({
    resolve: net.resolve,
    transport: net.transport,
    userAgent: 'test',
  });
  const store = pgStore(client);
  const work: Promise<unknown>[] = [];
  const handler = createScanHandler({
    store,
    userIdFromRequest: () => Promise.resolve(user),
    verifyTurnstile: () => Promise.resolve(false),
    clientIp: () => null,
    hashIp: () => Promise.resolve('e'.repeat(64)),
    // The real ownership re-check, against the (fake) website and no DNS record.
    runScan: (id) =>
      runScan(id, {
        store,
        fetch,
        log: silentLogger,
        verifySite: async (s) =>
          (
            await verifyOwnership(
              { url: s.url, host: s.host, token: s.verifyToken },
              { fetch, lookupTxt: () => Promise.resolve([]) },
            )
          ).verified,
      }),
    background: (p) => work.push(p),
    allowedOrigin: ORIGIN,
    log: silentLogger,
  });

  const res = await handler(
    new Request('https://fn.example.test/create-scan', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: JSON.stringify({ siteId: site }),
    }),
  );
  expect(res.status).toBe(202);
  const { scanId } = (await res.json()) as { scanId: string };
  await Promise.all(work);

  const scan = await client.query<{
    kind: string;
    status: string;
    site_id: string;
    user_id: string;
  }>('select kind, status, site_id, user_id from public.scans where id = $1', [scanId]);
  const findings = await client.query<{
    check_id: string;
    status: string;
    evidence_redacted: string | null;
  }>('select check_id, status, evidence_redacted from public.findings where scan_id = $1', [
    scanId,
  ]);
  const verifiedNow = (
    await client.query<{ verified_at: string | null }>(
      'select verified_at from public.sites where id = $1',
      [site],
    )
  ).rows[0]?.verified_at;
  return {
    scan: scan.rows[0],
    findings: findings.rows,
    requested: net.requested,
    site,
    user,
    verifiedNow,
  };
}

describe('end to end: deep checks run only on verified sites', () => {
  it('a verified site gets a deep scan that finds the open table', async () => {
    const r = await scanSavedSite('ref-open-table', true);
    expect(r.scan).toMatchObject({
      kind: 'deep',
      status: 'done',
      site_id: r.site,
      user_id: r.user,
    });
    const deep = r.findings.find((f) => f.check_id === 'supabase-public-tables');
    expect(deep).toMatchObject({
      status: 'fail',
      evidence_redacted: 'table profiles: readable while logged out',
    });
    // No row data is ever stored.
    expect(JSON.stringify(r.findings)).not.toContain('someone@example.test');
  });

  it('an unverified site gets a passive scan; its database is never touched', async () => {
    const r = await scanSavedSite('ref-open-table-unverified', false);
    expect(r.scan).toMatchObject({ kind: 'passive', status: 'done' });
    expect(
      r.findings.some(
        (f) => f.check_id === 'supabase-public-tables' || f.check_id === 'firebase-open-rules',
      ),
    ).toBe(false);
    expect(r.requested.some((u) => u.includes('supabase.co'))).toBe(false);
  });

  it('a verified site whose proof was removed loses verification; its database is not touched', async () => {
    const r = await scanSavedSite('ref-insecure-lovable', true, false);
    expect(r.scan).toMatchObject({ kind: 'deep', status: 'done' });
    expect(r.findings.some((f) => f.check_id === 'supabase-public-tables')).toBe(false);
    expect(r.requested.some((u) => u.includes('supabase.co'))).toBe(false);
    expect(r.verifiedNow).toBeNull();
  });
});
