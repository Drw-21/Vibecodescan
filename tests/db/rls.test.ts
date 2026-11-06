// Proves the data-isolation rules in the spec ("Data model and row-level security"):
// user A can never read or change user B's data, anonymous visitors can read
// nothing, and only the service role writes scans, findings, subscriptions and
// billing events.

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Actor, type Tx, databaseUrl, firstId, inRollback, resetDatabase } from './harness.js';

const client = new pg.Client({ connectionString: databaseUrl() });

beforeAll(async () => {
  await client.connect();
  await resetDatabase(client);
});

afterAll(async () => {
  await client.end();
});

const anon: Actor = { role: 'anon' };
const service: Actor = { role: 'service_role' };
const user = (userId: string): Actor => ({ role: 'authenticated', userId });

/** Postgres error code for "permission denied" (missing grant). */
const PERMISSION_DENIED = '42501';

async function expectDenied(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code: PERMISSION_DENIED });
}

interface World {
  a: string;
  b: string;
  siteA: string;
  siteB: string;
  scanA: string;
  scanB: string;
  scanAnon: string;
  findingA: string;
  findingB: string;
  findingAnon: string;
}

/** Two users, each with a site, a scan and a finding, plus one anonymous scan. */
async function seed(tx: Tx): Promise<World> {
  const a = await tx.createUser('a@example.test');
  const b = await tx.createUser('b@example.test');

  const site = async (userId: string, url: string): Promise<string> => {
    const rows = await tx.admin<{ id: string }>(
      'insert into public.sites (user_id, url) values ($1, $2) returning id',
      [userId, url],
    );
    return firstId(rows);
  };
  const scan = async (siteId: string | null, userId: string | null, url: string) => {
    const rows = await tx.admin<{ id: string }>(
      `insert into public.scans (site_id, user_id, url, host, status, grade, score)
       values ($1, $2, $3, $4, 'done', 'B', 80) returning id`,
      [siteId, userId, url, new URL(url).host],
    );
    return firstId(rows);
  };
  const finding = async (scanId: string) => {
    const rows = await tx.admin<{ id: string }>(
      `insert into public.findings (scan_id, check_id, severity, status, title, explanation)
       values ($1, 'security-headers', 'low', 'fail', 'Missing header', 'Why it matters') returning id`,
      [scanId],
    );
    return firstId(rows);
  };

  const siteA = await site(a, 'https://a.example.test');
  const siteB = await site(b, 'https://b.example.test');
  const scanA = await scan(siteA, a, 'https://a.example.test');
  const scanB = await scan(siteB, b, 'https://b.example.test');
  const scanAnon = await scan(null, null, 'https://anon.example.test');
  await tx.admin(
    `insert into public.subscriptions (user_id, plan, status) values ($1, 'monitor', 'active'), ($2, 'monitor', 'active')`,
    [a, b],
  );
  await tx.admin(
    `insert into public.billing_events (event_id, type) values ('evt_1', 'order_created')`,
  );

  return {
    a,
    b,
    siteA,
    siteB,
    scanA,
    scanB,
    scanAnon,
    findingA: await finding(scanA),
    findingB: await finding(scanB),
    findingAnon: await finding(scanAnon),
  };
}

const ids = (rows: { id: string }[]): string[] => rows.map((r) => r.id).sort();

describe('schema guards', () => {
  it('has row-level security switched on for every table in public', async () => {
    const { rows } = await client.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it('has an index on every foreign key', async () => {
    const { rows } = await client.query<{ fk: string }>(`
      select con.conrelid::regclass || '.' || con.conname as fk
      from pg_constraint con
      where con.contype = 'f'
        and con.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
          where i.indrelid = con.conrelid
            and (i.indkey::int2[])[0:cardinality(con.conkey) - 1] = con.conkey
        )`);
    expect(rows).toEqual([]);
  });

  it('has no public views, and no public function that API roles can call', async () => {
    const { rows } = await client.query<{ name: string }>(`
      select c.relname as name from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')
      union all
      select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace = 'public'::regnamespace
        and (has_function_privilege('anon', p.oid, 'execute')
          or has_function_privilege('authenticated', p.oid, 'execute'))`);
    expect(rows).toEqual([]);
  });

  it('keeps the private schema out of reach of API roles', async () => {
    const { rows } = await client.query<{ role: string }>(`
      select r as role from unnest(array['anon', 'authenticated']) r
      where has_schema_privilege(r, 'private', 'usage')`);
    expect(rows).toEqual([]);
  });
});

describe('profiles', () => {
  it('a user reads only their own profile', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const { rows } = await tx.as<{ id: string }>(user(w.a), 'select id from public.profiles');
      expect(ids(rows)).toEqual([w.a]);
    }));

  it('is created automatically on sign-up', () =>
    inRollback(client, async (tx) => {
      const id = await tx.createUser('new@example.test');
      const rows = await tx.admin<{ email: string }>(
        'select email from public.profiles where id = $1',
        [id],
      );
      expect(rows).toEqual([{ email: 'new@example.test' }]);
    }));

  it('cannot be read by anonymous visitors or written by users', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      await expectDenied(tx.as(anon, 'select * from public.profiles'));
      await expectDenied(
        tx.as(user(w.a), `update public.profiles set email = 'x@example.test' where id = $1`, [
          w.a,
        ]),
      );
      await expectDenied(tx.as(user(w.a), 'delete from public.profiles where id = $1', [w.a]));
    }));
});

describe('sites', () => {
  it('user A cannot see user B’s sites', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const { rows } = await tx.as<{ id: string }>(user(w.a), 'select id from public.sites');
      expect(ids(rows)).toEqual([w.siteA]);
      const direct = await tx.as(user(w.a), 'select * from public.sites where id = $1', [w.siteB]);
      expect(direct.rowCount).toBe(0);
    }));

  it('anonymous visitors cannot read or add sites', () =>
    inRollback(client, async (tx) => {
      await seed(tx);
      await expectDenied(tx.as(anon, 'select * from public.sites'));
      await expectDenied(
        tx.as(anon, `insert into public.sites (url) values ('https://x.example.test')`),
      );
    }));

  it('a user can add a site; it is theirs, unverified, with a 64-hex-char token', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const { rows } = await tx.as<{
        user_id: string;
        host: string;
        verified_at: string | null;
        verify_token: string;
      }>(
        user(w.a),
        `insert into public.sites (url) values ('https://New.Example.test/path?q=1')
         returning user_id, host, verified_at, verify_token`,
      );
      expect(rows[0]).toMatchObject({ user_id: w.a, host: 'new.example.test', verified_at: null });
      expect(rows[0]?.verify_token).toMatch(/^[0-9a-f]{64}$/);
    }));

  it('a user cannot add a site for someone else', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      await expectDenied(
        tx.as(
          user(w.a),
          `insert into public.sites (user_id, url) values ($1, 'https://x.example.test')`,
          [w.b],
        ),
      );
    }));

  it('a user can never set verified_at, verify_token or host themselves', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const a = user(w.a);
      await expectDenied(
        tx.as(
          a,
          `insert into public.sites (url, verified_at) values ('https://x.example.test', now())`,
        ),
      );
      await expectDenied(
        tx.as(a, 'update public.sites set verified_at = now() where id = $1', [w.siteA]),
      );
      await expectDenied(
        tx.as(a, `update public.sites set verify_token = 'mine' where id = $1`, [w.siteA]),
      );
      await expectDenied(
        tx.as(a, `update public.sites set host = 'other.test' where id = $1`, [w.siteA]),
      );
      await expectDenied(
        tx.as(a, 'update public.sites set user_id = $1 where id = $2', [w.b, w.siteA]),
      );
    }));

  it('a user can change url and monitored on their own site only', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const own = await tx.as(user(w.a), 'update public.sites set monitored = true where id = $1', [
        w.siteA,
      ]);
      expect(own.rowCount).toBe(1);
      const other = await tx.as(
        user(w.a),
        'update public.sites set monitored = true where id = $1',
        [w.siteB],
      );
      expect(other.rowCount).toBe(0);
      const rows = await tx.admin<{ monitored: boolean }>(
        'select monitored from public.sites where id = $1',
        [w.siteB],
      );
      expect(rows[0]?.monitored).toBe(false);
    }));

  it('changing the host removes verification and issues a new token', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      await tx.admin('update public.sites set verified_at = now() where id = $1', [w.siteA]);
      const [before] = await tx.admin<{ verify_token: string }>(
        'select verify_token from public.sites where id = $1',
        [w.siteA],
      );

      // Same host, different path: verification is kept.
      await tx.as(
        user(w.a),
        `update public.sites set url = 'https://a.example.test/app' where id = $1`,
        [w.siteA],
      );
      const [samehost] = await tx.admin<{ verified_at: string | null }>(
        'select verified_at from public.sites where id = $1',
        [w.siteA],
      );
      expect(samehost?.verified_at).not.toBeNull();

      // Different host: verification is lost.
      await tx.as(
        user(w.a),
        `update public.sites set url = 'https://victim.example.test' where id = $1`,
        [w.siteA],
      );
      const [after] = await tx.admin<{
        verified_at: string | null;
        verify_token: string;
        host: string;
      }>('select verified_at, verify_token, host from public.sites where id = $1', [w.siteA]);
      expect(after).toMatchObject({ verified_at: null, host: 'victim.example.test' });
      expect(after?.verify_token).not.toBe(before?.verify_token);
    }));

  it('rejects URLs that are not http(s) or whose host could be read two ways', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const bad = [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'ftp://x.test',
        'https://',
        // Each of these makes a regex and new URL() disagree about the host
        // (verification bypass found in independent review).
        'https://attacker.test\\@victim.test/',
        'https://attacker.test@victim.test/',
        'https://vic\ttim.test/',
        'https://victim%2Etest/',
        'https://[::1]/',
        'https://victim.test/path with space',
        'https://victim.test\\.evil.test/',
        'https://bücher.test/',
        'https://victim.test./',
        'https://2130706433/',
        'https://0x7f000001/',
        'https://127.0.0.1/',
        'https://a.test.0x7f/',
      ];
      for (const url of bad) {
        // Rejected either by the host trigger (22023) or the url check constraint (23514).
        const error: unknown = await tx
          .as(user(w.a), 'insert into public.sites (url) values ($1)', [url])
          .then(
            () => null,
            (e: unknown) => e,
          );
        expect(error, url).toMatchObject({
          code: expect.stringMatching(/^(22023|23514)$/) as unknown,
        });
      }
    }));

  it('stores the same host a standard URL parser would fetch', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const good = [
        'https://App.Example.test',
        'http://port.example.test:8080/x?y=1#z',
        'https://xn--bcher-kva.test/',
        'https://a-b.example.test/path',
        'https://123abc.example.test/',
        'https://app.example.test2/',
      ];
      for (const url of good) {
        const { rows } = await tx.as<{ host: string }>(
          user(w.a),
          'insert into public.sites (url) values ($1) returning host',
          [url],
        );
        expect(rows[0]?.host, url).toBe(new URL(url).hostname);
      }
    }));

  it('users cannot delete sites (not in v1 scope)', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      await expectDenied(tx.as(user(w.a), 'delete from public.sites where id = $1', [w.siteA]));
    }));
});

describe('scans', () => {
  it('user A sees only their own scans, never B’s or anonymous ones', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const { rows } = await tx.as<{ id: string }>(user(w.a), 'select id from public.scans');
      expect(ids(rows)).toEqual([w.scanA]);
      for (const id of [w.scanB, w.scanAnon]) {
        const r = await tx.as(user(w.a), 'select * from public.scans where id = $1', [id]);
        expect(r.rowCount).toBe(0);
      }
    }));

  it('anonymous visitors cannot list any scan, including anonymous ones', () =>
    inRollback(client, async (tx) => {
      await seed(tx);
      await expectDenied(tx.as(anon, 'select * from public.scans'));
    }));

  it('users cannot insert, update or delete scans', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const a = user(w.a);
      await expectDenied(
        tx.as(
          a,
          `insert into public.scans (site_id, user_id, url, host) values ($1, $2, 'https://a.example.test', 'a.example.test')`,
          [w.siteA, w.a],
        ),
      );
      await expectDenied(tx.as(a, `update public.scans set grade = 'A' where id = $1`, [w.scanA]));
      await expectDenied(tx.as(a, 'delete from public.scans where id = $1', [w.scanA]));
      await expectDenied(
        tx.as(anon, `insert into public.scans (url, host) values ('https://x.test', 'x.test')`),
      );
    }));
});

describe('findings', () => {
  it('user A sees only findings of their own scans', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const { rows } = await tx.as<{ id: string }>(user(w.a), 'select id from public.findings');
      expect(ids(rows)).toEqual([w.findingA]);
      const b = await tx.as<{ id: string }>(user(w.b), 'select id from public.findings');
      expect(ids(b.rows)).toEqual([w.findingB]);
    }));

  it('anonymous visitors cannot read findings', () =>
    inRollback(client, async (tx) => {
      await seed(tx);
      await expectDenied(tx.as(anon, 'select * from public.findings'));
    }));

  it('users cannot insert, update or delete findings', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const a = user(w.a);
      await expectDenied(
        tx.as(
          a,
          `insert into public.findings (scan_id, check_id, severity, status, title, explanation)
           values ($1, 'x', 'info', 'pass', 't', 'e')`,
          [w.scanA],
        ),
      );
      await expectDenied(
        tx.as(a, `update public.findings set status = 'pass' where id = $1`, [w.findingA]),
      );
      await expectDenied(tx.as(a, 'delete from public.findings where id = $1', [w.findingA]));
    }));

  it('refuses evidence that contains a full secret (redaction backstop)', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      // Fake keys built at runtime so secret scanners do not flag this file.
      const stripeLike = 'sk_' + 'live_' + 'A1b2C3d4E5'.repeat(10);
      const githubLike = 'gh' + 'p_' + 'Z9y8X7w6V5'.repeat(4);
      for (const evidence of [stripeLike, githubLike, `key=${githubLike}`]) {
        await expect(
          tx.as(service, 'update public.findings set evidence_redacted = $1 where id = $2', [
            evidence,
            w.findingA,
          ]),
          evidence.slice(0, 4),
        ).rejects.toMatchObject({ code: '23514' });
      }
      // Properly redacted evidence and ordinary details are accepted.
      for (const evidence of [
        'sk_l…x9Q2',
        'Strict-Transport-Security',
        'user_notification_preferences',
        '/assets/index-BxYz1234.js.map',
        'abcdefghijklmnopqrst.supabase.co',
        'main.3f2a9c8b7d6e5f4a3b2c.js.map',
      ]) {
        await tx.as(service, 'update public.findings set evidence_redacted = $1 where id = $2', [
          evidence,
          w.findingA,
        ]);
      }
    }));

  it('refuses evidence long enough to be a full secret store', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      await expect(
        tx.admin(`update public.findings set evidence_redacted = repeat('x', 201) where id = $1`, [
          w.findingA,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    }));
});

describe('subscriptions', () => {
  it('a user reads only their own subscription', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const { rows } = await tx.as<{ user_id: string }>(
        user(w.a),
        'select user_id from public.subscriptions',
      );
      expect(rows).toEqual([{ user_id: w.a }]);
    }));

  it('users and anonymous visitors cannot grant themselves a plan', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const c = await tx.createUser('c@example.test');
      await expectDenied(
        tx.as(
          user(c),
          `insert into public.subscriptions (user_id, plan, status) values ($1, 'monitor', 'active')`,
          [c],
        ),
      );
      await expectDenied(
        tx.as(user(w.a), `update public.subscriptions set status = 'active' where user_id = $1`, [
          w.a,
        ]),
      );
      await expectDenied(tx.as(user(w.a), 'delete from public.subscriptions'));
      await expectDenied(tx.as(anon, 'select * from public.subscriptions'));
    }));
});

describe('billing_events', () => {
  it('is invisible and read-only to users and anonymous visitors', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      for (const actor of [anon, user(w.a)]) {
        await expectDenied(tx.as(actor, 'select * from public.billing_events'));
        await expectDenied(
          tx.as(actor, `insert into public.billing_events (event_id, type) values ('evt_x', 'x')`),
        );
      }
    }));

  it('rejects a duplicate event id (webhook idempotency)', () =>
    inRollback(client, async (tx) => {
      await seed(tx);
      await expect(
        tx.as(
          service,
          `insert into public.billing_events (event_id, type) values ('evt_1', 'order_created')`,
        ),
      ).rejects.toMatchObject({ code: '23505' });
    }));
});

describe('service role (Edge Functions)', () => {
  it('can write scans and findings', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      const scan = await tx.as<{ id: string }>(
        service,
        `insert into public.scans (site_id, user_id, url, host, kind) values ($1, $2, 'https://a.example.test', 'a.example.test', 'deep') returning id`,
        [w.siteA, w.a],
      );
      const scanId = firstId(scan.rows);
      const f = await tx.as(
        service,
        `insert into public.findings (scan_id, check_id, severity, status, title, explanation)
         values ($1, 'https', 'high', 'fail', 't', 'e')`,
        [scanId],
      );
      expect(f.rowCount).toBe(1);
      const upd = await tx.as(
        service,
        `update public.sites set verified_at = now() where id = $1`,
        [w.siteA],
      );
      expect(upd.rowCount).toBe(1);
    }));

  it('cannot record a scan of user A’s site under user B (so B never sees A’s findings)', () =>
    inRollback(client, async (tx) => {
      const w = await seed(tx);
      await expect(
        tx.as(
          service,
          `insert into public.scans (site_id, user_id, url, host) values ($1, $2, 'https://a.example.test', 'a.example.test')`,
          [w.siteA, w.b],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      await expect(
        tx.as(
          service,
          `insert into public.scans (site_id, url, host) values ($1, 'https://a.example.test', 'a.example.test')`,
          [w.siteA],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }));

  it('cannot create a deep scan without a signed-in owner and site', () =>
    inRollback(client, async (tx) => {
      await seed(tx);
      await expect(
        tx.as(
          service,
          `insert into public.scans (url, host, kind) values ('https://x.test', 'x.test', 'deep')`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
    }));
});
