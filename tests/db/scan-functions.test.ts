// The scan lifecycle functions (migration 20261106000100): rate limits are atomic, only
// the service role can call them, a scan is claimed once, and results save all-or-nothing.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Actor, type Tx, databaseUrl, inRollback, resetDatabase } from './harness.js';

const client = new pg.Client({ connectionString: databaseUrl() });
beforeAll(async () => {
  await client.connect();
  await resetDatabase(client);
});
afterAll(async () => {
  await client.end();
});

const service: Actor = { role: 'service_role' };
const IP_A = 'a'.repeat(64);
const IP_B = 'b'.repeat(64);

interface CreateRow {
  scan_id: string | null;
  outcome: string;
  retry_after_seconds: number;
}

function create(
  tx: Tx,
  args: {
    host?: string;
    userId?: string | null;
    ip?: string | null;
    limit?: number;
    cooldown?: number;
  },
): Promise<CreateRow> {
  const host = args.host ?? 'app.example.test';
  return tx
    .as<CreateRow>(
      service,
      'select * from public.create_scan_with_limits($1, $2, $3, null, $4, $5, $6, $7)',
      [
        `https://${host}/`,
        host,
        args.userId ?? null,
        'passive',
        args.ip === undefined ? IP_A : args.ip,
        args.limit ?? 3,
        args.cooldown ?? 600,
      ],
    )
    .then((r) => {
      const row = r.rows[0];
      if (!row) throw new Error('no row');
      return row;
    });
}

describe('create_scan_with_limits', () => {
  it('creates a queued scan and stores only the IP hash', () =>
    inRollback(client, async (tx) => {
      const row = await create(tx, {});
      expect(row.outcome).toBe('ok');
      const [scan] = await tx.admin<{
        status: string;
        client_ip_hash: string;
        user_id: string | null;
      }>('select status, client_ip_hash, user_id from public.scans where id = $1', [row.scan_id]);
      expect(scan).toEqual({ status: 'queued', client_ip_hash: IP_A, user_id: null });
    }));

  it('allows 3 free scans per IP per day, then refuses until midnight UTC', () =>
    inRollback(client, async (tx) => {
      for (const host of ['a.example.test', 'b.example.test', 'c.example.test']) {
        expect((await create(tx, { host })).outcome).toBe('ok');
      }
      const refused = await create(tx, { host: 'd.example.test' });
      expect(refused).toMatchObject({ outcome: 'daily_limit', scan_id: null });
      expect(refused.retry_after_seconds).toBeGreaterThan(0);
      expect(refused.retry_after_seconds).toBeLessThanOrEqual(86_400);
      // Another IP is unaffected.
      expect((await create(tx, { host: 'd.example.test', ip: IP_B })).outcome).toBe('ok');
    }));

  it('counts per account too: switching IP does not reset a signed-in user’s limit', () =>
    inRollback(client, async (tx) => {
      const user = await tx.createUser('limits@example.test');
      for (const [host, ip] of [
        ['a.example.test', IP_A],
        ['b.example.test', IP_B],
        ['c.example.test', 'c'.repeat(64)],
      ] as const) {
        expect((await create(tx, { host, userId: user, ip })).outcome).toBe('ok');
      }
      expect(
        (await create(tx, { host: 'd.example.test', userId: user, ip: 'd'.repeat(64) })).outcome,
      ).toBe('daily_limit');
    }));

  it('does not count yesterday’s scans', () =>
    inRollback(client, async (tx) => {
      for (const host of ['a.example.test', 'b.example.test', 'c.example.test'])
        await create(tx, { host });
      await tx.admin(`update public.scans set created_at = now() - interval '1 day 1 hour'`);
      expect((await create(tx, { host: 'd.example.test' })).outcome).toBe('ok');
    }));

  it('scans the same host at most once per 10 minutes, whoever asks', () =>
    inRollback(client, async (tx) => {
      expect((await create(tx, { ip: IP_A })).outcome).toBe('ok');
      const refused = await create(tx, { ip: IP_B });
      expect(refused.outcome).toBe('host_cooldown');
      expect(refused.retry_after_seconds).toBeGreaterThan(590);
      await tx.admin(`update public.scans set created_at = now() - interval '11 minutes'`);
      expect((await create(tx, { ip: IP_B })).outcome).toBe('ok');
    }));

  it('cannot be called by anonymous visitors or signed-in users', () =>
    inRollback(client, async (tx) => {
      const user = await tx.createUser('nope@example.test');
      for (const actor of [
        { role: 'anon' } as const,
        { role: 'authenticated', userId: user } as const,
      ]) {
        await expect(
          tx.as(
            actor,
            `select * from public.create_scan_with_limits('https://x.test/', 'x.test', null, null, 'passive', null, 1000, 0)`,
          ),
        ).rejects.toMatchObject({ code: '42501' });
        for (const sql of [
          `select public.claim_scan(gen_random_uuid())`,
          `select public.complete_scan(gen_random_uuid(), '[]'::jsonb, 'A', 100)`,
          `select public.fail_scan(gen_random_uuid(), 'x', false)`,
        ]) {
          await expect(tx.as(actor, sql)).rejects.toMatchObject({ code: '42501' });
        }
      }
    }));
});

describe('scan lifecycle', () => {
  const finding = (title: string) => ({
    check_id: 'https',
    severity: 'high',
    status: 'fail',
    title,
    explanation: 'Because it matters.',
    evidence_redacted: 'http:// does not redirect',
    fix_prompt: null,
  });

  it('claims a scan exactly once', () =>
    inRollback(client, async (tx) => {
      const { scan_id } = await create(tx, {});
      const first = await tx.as<{ id: string; status: string }>(
        service,
        'select * from public.claim_scan($1)',
        [scan_id],
      );
      expect(first.rows).toMatchObject([{ id: scan_id, status: 'running' }]);
      const second = await tx.as(service, 'select * from public.claim_scan($1)', [scan_id]);
      expect(second.rows).toEqual([]);
    }));

  it('saves findings and the grade together, once', () =>
    inRollback(client, async (tx) => {
      const { scan_id } = await create(tx, {});
      await tx.as(service, 'select * from public.claim_scan($1)', [scan_id]);
      const findings = JSON.stringify([finding('one'), finding('two')]);
      const done = await tx.as<{ ok: boolean }>(
        service,
        'select public.complete_scan($1, $2::jsonb, $3, $4) as ok',
        [scan_id, findings, 'B', 80],
      );
      expect(done.rows[0]?.ok).toBe(true);
      const again = await tx.as<{ ok: boolean }>(
        service,
        'select public.complete_scan($1, $2::jsonb, $3, $4) as ok',
        [scan_id, findings, 'B', 80],
      );
      expect(again.rows[0]?.ok).toBe(false);
      const rows = await tx.admin<{ title: string }>(
        'select title from public.findings where scan_id = $1 order by title',
        [scan_id],
      );
      expect(rows.map((r) => r.title)).toEqual(['one', 'two']);
      const [scan] = await tx.admin<{ status: string; grade: string; finished_at: string | null }>(
        'select status, grade, finished_at from public.scans where id = $1',
        [scan_id],
      );
      expect(scan).toMatchObject({ status: 'done', grade: 'B' });
      expect(scan?.finished_at).not.toBeNull();
    }));

  it('saves nothing if one finding is invalid (all or nothing)', () =>
    inRollback(client, async (tx) => {
      const { scan_id } = await create(tx, {});
      await tx.as(service, 'select * from public.claim_scan($1)', [scan_id]);
      const bad = JSON.stringify([
        finding('fine'),
        { ...finding('bad'), severity: 'catastrophic' },
      ]);
      await expect(
        tx.as(service, 'select public.complete_scan($1, $2::jsonb, $3, $4)', [
          scan_id,
          bad,
          'B',
          80,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      const rows = await tx.admin('select 1 from public.findings where scan_id = $1', [scan_id]);
      expect(rows).toEqual([]);
      const [scan] = await tx.admin<{ status: string }>(
        'select status from public.scans where id = $1',
        [scan_id],
      );
      expect(scan?.status).toBe('running');
    }));

  it('cannot complete a scan that was never claimed', () =>
    inRollback(client, async (tx) => {
      const { scan_id } = await create(tx, {});
      const r = await tx.as<{ ok: boolean }>(
        service,
        `select public.complete_scan($1, '[]'::jsonb, 'A', 100) as ok`,
        [scan_id],
      );
      expect(r.rows[0]?.ok).toBe(false);
    }));

  it('with only-queued set, leaves a running scan alone', () =>
    inRollback(client, async (tx) => {
      const { scan_id } = await create(tx, {});
      await tx.as(service, 'select * from public.claim_scan($1)', [scan_id]);
      const r = await tx.as<{ ok: boolean }>(
        service,
        `select public.fail_scan($1, 'internal', true) as ok`,
        [scan_id],
      );
      expect(r.rows[0]?.ok).toBe(false);
      const [scan] = await tx.admin<{ status: string }>(
        'select status from public.scans where id = $1',
        [scan_id],
      );
      expect(scan?.status).toBe('running');
    }));

  it('fails a scan with an error code, and never a finished one', () =>
    inRollback(client, async (tx) => {
      const { scan_id } = await create(tx, {});
      const failed = await tx.as<{ ok: boolean }>(
        service,
        `select public.fail_scan($1, 'fetch_timeout', false) as ok`,
        [scan_id],
      );
      expect(failed.rows[0]?.ok).toBe(true);
      const [scan] = await tx.admin<{ status: string; error_code: string }>(
        'select status, error_code from public.scans where id = $1',
        [scan_id],
      );
      expect(scan).toEqual({ status: 'failed', error_code: 'fetch_timeout' });
      const again = await tx.as<{ ok: boolean }>(
        service,
        `select public.fail_scan($1, 'other', false) as ok`,
        [scan_id],
      );
      expect(again.rows[0]?.ok).toBe(false);
    }));
});

describe('rate limits under concurrency', () => {
  // Separate connections, really in parallel, committed (not rolled back).
  async function race(calls: { host: string; ip: string }[]): Promise<string[]> {
    const clients = calls.map(() => new pg.Client({ connectionString: databaseUrl() }));
    await Promise.all(clients.map((c) => c.connect()));
    try {
      const results = await Promise.all(
        calls.map(async (call, i) => {
          const c = clients[i];
          if (!c) throw new Error('no client');
          await c.query('set role service_role');
          const r = await c.query<{ outcome: string }>(
            `select outcome from public.create_scan_with_limits($1, $2, null, null, 'passive', $3, 3, 600)`,
            [`https://${call.host}/`, call.host, call.ip],
          );
          return r.rows[0]?.outcome ?? 'none';
        }),
      );
      return results.sort();
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await client.query('delete from public.scans');
    }
  }

  it('never lets one IP past 3 scans, even with 8 requests at once', async () => {
    const calls = Array.from({ length: 8 }, (_, i) => ({
      host: `h${String(i)}.example.test`,
      ip: 'c'.repeat(64),
    }));
    const outcomes = await race(calls);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(3);
    expect(outcomes.filter((o) => o === 'daily_limit')).toHaveLength(5);
  });

  it('never scans one host twice, even with 6 requests at once from different IPs', async () => {
    const calls = Array.from({ length: 6 }, (_, i) => ({
      host: 'same.example.test',
      ip: String(i).repeat(64),
    }));
    const outcomes = await race(calls);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'host_cooldown')).toHaveLength(5);
  });
});
