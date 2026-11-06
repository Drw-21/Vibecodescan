// Test harness for the RLS tests.
// Builds a fresh database from supabase/migrations, then lets each test act as
// a given role (anon / authenticated user / service_role) inside a transaction
// that is always rolled back, so tests never affect each other.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type pg from 'pg';

const root = join(import.meta.dirname, '..', '..');
const migrationsDir = join(root, 'supabase', 'migrations');

export type Actor =
  { role: 'anon' } | { role: 'authenticated'; userId: string } | { role: 'service_role' };

export function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Point it at a throwaway Postgres (never production).',
    );
  }
  return url;
}

/** Drops everything we own and re-applies every migration in order. */
export async function resetDatabase(client: pg.Client): Promise<void> {
  // Refuse to touch a real Supabase database (it has the supabase_admin role).
  const { rows } = await client.query<{ supabase: boolean }>(
    "select exists (select 1 from pg_roles where rolname = 'supabase_admin') as supabase",
  );
  if (rows[0]?.supabase === true) {
    throw new Error(
      'DATABASE_URL points at a Supabase instance. The RLS tests drop and rebuild the ' +
        'database, so they only run against a throwaway plain Postgres.',
    );
  }

  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists private cascade;
    drop schema if exists auth cascade;
    drop schema if exists extensions cascade;
    do $$ begin
      -- Clears this database's grants to the API roles; the roles themselves are shared
      -- by the whole server and are kept.
      if exists (select 1 from pg_roles where rolname = 'anon') then
        drop owned by anon, authenticated, service_role;
      end if;
    end $$;
    create schema public;
  `);
  await client.query(await readFile(join(import.meta.dirname, 'supabase-shim.sql'), 'utf8'));

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    try {
      await client.query(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${String(error)}`, { cause: error });
    }
  }
}

/**
 * Runs `fn` as the given actor inside a transaction that is rolled back.
 * Setup data should be inserted beforehand with `asAdmin`, in the same transaction.
 */
export async function inRollback(client: pg.Client, fn: (tx: Tx) => Promise<void>): Promise<void> {
  await client.query('begin');
  try {
    await fn(new Tx(client));
  } finally {
    await client.query('rollback');
  }
}

export class Tx {
  constructor(private readonly client: pg.Client) {}

  /** Run SQL as the database owner (bypasses RLS) — for test setup only. */
  async admin<R extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<R[]> {
    await this.client.query('reset role');
    await this.client.query("select set_config('request.jwt.claims', '', true)");
    const result = await this.client.query<R>(sql, params);
    return result.rows;
  }

  /** Run SQL as an API role, exactly as PostgREST would. Errors propagate. */
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- caller names the row shape, as with pg's own query<R>
  async as<R extends pg.QueryResultRow>(
    actor: Actor,
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: R[]; rowCount: number }> {
    await this.client.query('reset role');
    const claims =
      actor.role === 'authenticated'
        ? JSON.stringify({ sub: actor.userId, role: 'authenticated' })
        : JSON.stringify({ role: actor.role });
    await this.client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await this.client.query(`set local role ${actor.role}`);
    await this.client.query('savepoint as_actor');
    try {
      const result = await this.client.query<R>(sql, params);
      await this.client.query('release savepoint as_actor');
      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    } catch (error) {
      await this.client.query('rollback to savepoint as_actor');
      throw error;
    } finally {
      await this.client.query('reset role');
    }
  }

  /** Creates an auth user (and, via the trigger, a profile). Returns its id. */
  async createUser(email: string): Promise<string> {
    const rows = await this.admin<{ id: string }>(
      `insert into auth.users (id, aud, role, email)
       values (gen_random_uuid(), 'authenticated', 'authenticated', $1) returning id`,
      [email],
    );
    return firstId(rows);
  }
}

/** Returns the id of the first row, failing the test if there is none. */
export function firstId(rows: { id: string }[]): string {
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('expected a row with an id, got none');
  return id;
}
