// Deep check fixtures: a fake Supabase REST API behind the app's public anon key.

import { SUPABASE_REF, fake, supabaseUrl } from '../secrets.ts';
import { appSite } from '../sites.ts';
import type { FakeRoute } from '../site.ts';
import type { CheckCase } from './types.ts';

const REST = `${supabaseUrl()}/rest/v1`;
const row = (body: unknown): FakeRoute => ({
  body: JSON.stringify(body),
  headers: { 'content-type': 'application/json' },
});
const denied: FakeRoute = {
  status: 401,
  body: JSON.stringify({ code: '42501', message: 'permission denied for table' }),
  headers: { 'content-type': 'application/json' },
};

/** A Lovable-style app using Supabase, with extra REST routes. */
const withSupabase = (routes: Record<string, FakeRoute>) =>
  appSite({
    bundles: {
      '/assets/index-a1b2c3d4.js': `const supabase=createClient("${supabaseUrl()}","${fake.supabaseAnon()}");`,
    },
    routes,
  });

const openApi = (...tables: string[]) => {
  const paths: Record<string, object> = { '/': {}, '/rpc/do_thing': {} };
  for (const t of tables) paths[`/${t}`] = {};
  return row({ swagger: '2.0', paths });
};

export const cases: CheckCase[] = [
  {
    name: 'a common table (profiles) can be read while logged out',
    site: withSupabase({
      [`${REST}/profiles?select=*&limit=1`]: row([{ id: 'u1', email: 'someone@example.test' }]),
    }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['profiles'],
    mustNotLeak: ['someone@example.test', 'u1'],
  },
  {
    name: 'a table found through the API description can be read while logged out',
    site: withSupabase({
      [`${REST}/`]: openApi('invoices', 'notes'),
      [`${REST}/invoices?select=*&limit=1`]: row([{ id: 1, amount: 300 }]),
      [`${REST}/notes?select=*&limit=1`]: row([]),
    }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['invoices'],
  },
  {
    name: 'two open tables are two findings',
    site: withSupabase({
      [`${REST}/profiles?select=*&limit=1`]: row([{ id: 1 }]),
      [`${REST}/orders?select=*&limit=1`]: row([{ id: 2 }]),
    }),
    expect: 'fail',
    failSeverities: ['critical', 'critical'],
  },
  {
    name: 'every table refuses a logged-out visitor',
    site: withSupabase({
      [`${REST}/`]: openApi('profiles', 'orders'),
      [`${REST}/profiles?select=*&limit=1`]: denied,
      [`${REST}/orders?select=*&limit=1`]: denied,
    }),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: an empty answer means no rows are visible, not an open table',
    site: withSupabase({
      [`${REST}/profiles?select=*&limit=1`]: row([]),
    }),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: the API description lists odd names that are never requested',
    site: withSupabase({
      [`${REST}/`]: openApi('../../etc/passwd', 'a b'),
      [`${REST}/profiles?select=*&limit=1`]: denied,
    }),
    expect: 'pass',
  },
  {
    name: 'fail safe: the key in the app is refused everywhere (not proof the tables are safe)',
    site: withSupabase({
      [`${supabaseUrl()}/*`]: {
        status: 401,
        body: JSON.stringify({ message: 'Invalid API key' }),
        headers: { 'content-type': 'application/json' },
      },
    }),
    expect: 'incomplete',
  },
  {
    name: 'fail safe: no table could be found to test',
    site: withSupabase({}),
    expect: 'incomplete',
  },
  {
    name: 'the app does not use Supabase',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'fail safe: Supabase is overloaded (503) for every table',
    site: withSupabase({ [`${supabaseUrl()}/*`]: { status: 503, body: 'busy' } }),
    expect: 'incomplete',
  },
];

/** Host of the fake Supabase project (for tests that check where requests went). */
export const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`;
