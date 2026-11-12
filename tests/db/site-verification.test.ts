// Site verification functions (migration 20261112000100): owner-only lookups, a cooldown on
// ownership checks, verified on/off, token rotation; service role only.

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

const service: Actor = { role: 'service_role' };

async function setup(tx: Tx) {
  const a = await tx.createUser('a@example.test');
  const b = await tx.createUser('b@example.test');
  const siteA = firstId(
    await tx.admin<{ id: string }>(
      `insert into public.sites (user_id, url) values ($1, 'https://a.example.test') returning id`,
      [a],
    ),
  );
  return { a, b, siteA };
}

describe('site_for_owner', () => {
  it('returns the owner’s site with its token, and nothing for anyone else', () =>
    inRollback(client, async (tx) => {
      const { a, b, siteA } = await setup(tx);
      const own = await tx.as<{ host: string; verify_token: string }>(
        service,
        'select * from public.site_for_owner($1, $2)',
        [siteA, a],
      );
      expect(own.rows[0]?.host).toBe('a.example.test');
      expect(own.rows[0]?.verify_token).toMatch(/^[0-9a-f]{64}$/);
      const other = await tx.as(service, 'select * from public.site_for_owner($1, $2)', [siteA, b]);
      expect(other.rows).toEqual([]);
    }));
});

describe('begin_verify_attempt', () => {
  it('allows one ownership check per cooldown, only for the owner', () =>
    inRollback(client, async (tx) => {
      const { a, b, siteA } = await setup(tx);
      const attempt = async (user: string) =>
        (
          await tx.as<{ ok: boolean }>(
            service,
            'select public.begin_verify_attempt($1, $2, 10) as ok',
            [siteA, user],
          )
        ).rows[0]?.ok;
      expect(await attempt(b)).toBe(false);
      expect(await attempt(a)).toBe(true);
      expect(await attempt(a)).toBe(false);
      await tx.admin(
        `update public.sites set last_verify_attempt_at = now() - interval '11 seconds'`,
      );
      expect(await attempt(a)).toBe(true);
    }));
});

describe('verification cannot land on a host other than the one checked', () => {
  it('refuses to verify if the URL (and so host and token) changed while the check ran', () =>
    inRollback(client, async (tx) => {
      const { a, siteA } = await setup(tx);
      const [checked] = await tx.admin<{ host: string; verify_token: string }>(
        'select host, verify_token from public.sites where id = $1',
        [siteA],
      );
      // During the slow check, the owner points the site at someone else's address.
      await tx.as(
        { role: 'authenticated', userId: a },
        `update public.sites set url = 'https://victim.example.test' where id = $1`,
        [siteA],
      );
      const r = await tx.as<{ ok: boolean }>(
        service,
        'select public.set_site_verified($1, true, $2, $3) as ok',
        [siteA, checked?.host, checked?.verify_token],
      );
      expect(r.rows[0]?.ok).toBe(false);
      const [after] = await tx.admin<{ host: string; verified_at: string | null }>(
        'select host, verified_at from public.sites where id = $1',
        [siteA],
      );
      expect(after).toEqual({ host: 'victim.example.test', verified_at: null });
    }));

  it('refuses to verify without the checked host and token', () =>
    inRollback(client, async (tx) => {
      const { siteA } = await setup(tx);
      const r = await tx.as<{ ok: boolean }>(
        service,
        'select public.set_site_verified($1, true) as ok',
        [siteA],
      );
      expect(r.rows[0]?.ok).toBe(false);
    }));
});

describe('begin_verify_attempt across accounts', () => {
  it('applies the cooldown per host across all accounts', () =>
    inRollback(client, async (tx) => {
      const { a, b, siteA } = await setup(tx);
      const siteB = firstId(
        await tx.admin<{ id: string }>(
          `insert into public.sites (user_id, url) values ($1, 'https://a.example.test/other') returning id`,
          [b],
        ),
      );
      const attempt = async (site: string, user: string) =>
        (
          await tx.as<{ ok: boolean }>(
            service,
            'select public.begin_verify_attempt($1, $2, 10) as ok',
            [site, user],
          )
        ).rows[0]?.ok;
      expect(await attempt(siteA, a)).toBe(true);
      expect(await attempt(siteB, b)).toBe(false);
    }));
});

describe('set_site_verified and rotate_site_token', () => {
  it('marks a site verified and unverified', () =>
    inRollback(client, async (tx) => {
      const { siteA } = await setup(tx);
      const [site] = await tx.admin<{ host: string; verify_token: string }>(
        'select host, verify_token from public.sites where id = $1',
        [siteA],
      );
      await tx.as(service, 'select public.set_site_verified($1, true, $2, $3)', [
        siteA,
        site?.host,
        site?.verify_token,
      ]);
      const [on] = await tx.admin<{ verified_at: string | null }>(
        'select verified_at from public.sites where id = $1',
        [siteA],
      );
      expect(on?.verified_at).not.toBeNull();
      await tx.as(service, 'select public.set_site_verified($1, false)', [siteA]);
      const [off] = await tx.admin<{ verified_at: string | null }>(
        'select verified_at from public.sites where id = $1',
        [siteA],
      );
      expect(off?.verified_at).toBeNull();
    }));

  it('issues a new token for an unverified site, never for a verified one', () =>
    inRollback(client, async (tx) => {
      const { siteA } = await setup(tx);
      const token = async () =>
        (
          await tx.admin<{ verify_token: string }>(
            'select verify_token from public.sites where id = $1',
            [siteA],
          )
        )[0]?.verify_token;
      const before = await token();
      await tx.admin(
        `update public.sites set verify_token_expires_at = now() - interval '1 day' where id = $1`,
        [siteA],
      );
      const rotated = await tx.as<{ ok: boolean }>(
        service,
        'select public.rotate_site_token($1) as ok',
        [siteA],
      );
      expect(rotated.rows[0]?.ok).toBe(true);
      const after = await token();
      expect(after).not.toBe(before);
      expect(after).toMatch(/^[0-9a-f]{64}$/);
      const [row] = await tx.admin<{ fresh: boolean }>(
        `select verify_token_expires_at > now() + interval '6 days' as fresh from public.sites where id = $1`,
        [siteA],
      );
      expect(row?.fresh).toBe(true);
      await tx.admin('update public.sites set verified_at = now() where id = $1', [siteA]);
      const again = await tx.as<{ ok: boolean }>(
        service,
        'select public.rotate_site_token($1) as ok',
        [siteA],
      );
      expect(again.rows[0]?.ok).toBe(false);
    }));
});

describe('access', () => {
  it('none of these functions can be called by anonymous visitors or signed-in users', () =>
    inRollback(client, async (tx) => {
      const { a, siteA } = await setup(tx);
      for (const actor of [
        { role: 'anon' } as const,
        { role: 'authenticated', userId: a } as const,
      ]) {
        for (const sql of [
          'select * from public.site_for_owner($1, $1)',
          'select public.begin_verify_attempt($1, $1, 0)',
          `select public.set_site_verified($1, true, 'a.example.test', 'x')`,
          'select public.rotate_site_token($1)',
        ]) {
          await expect(tx.as(actor, sql, [siteA])).rejects.toMatchObject({ code: '42501' });
        }
      }
    }));

  it('users still cannot change last_verify_attempt_at themselves', () =>
    inRollback(client, async (tx) => {
      const { a, siteA } = await setup(tx);
      await expect(
        tx.as(
          { role: 'authenticated', userId: a },
          'update public.sites set last_verify_attempt_at = null where id = $1',
          [siteA],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    }));
});
