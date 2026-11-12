// supabase-public-tables (deep, verified sites only): can someone who is NOT signed in read
// rows from the app's database, using only the public anon key the app ships to everyone?
//
// Read-only and minimal (spec): GET requests with limit=1, at most MAX_TABLES tables, only to
// the app's own Supabase project. A table counts as open only if a row comes back. Rows are
// never kept: only the table name is stored (spec: "Data rules").

import { safeEvidence } from '../redact.ts';
import type { Check, Finding, SafeResponse } from '../types.ts';

/** Tables AI-built apps most often create, tried when the API does not list its tables. */
export const COMMON_TABLES = [
  'profiles',
  'users',
  'customers',
  'orders',
  'payments',
  'subscriptions',
  'messages',
  'posts',
  'comments',
  'notes',
  'documents',
  'invoices',
  'accounts',
  'contacts',
  'leads',
  'bookings',
  'todos',
  'tasks',
  'projects',
  'products',
];
const MAX_TABLES = 20;
const MAX_BYTES = 16 * 1024;
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

type Answer = 'open' | 'closed' | 'unknown';

export const supabasePublicTables: Check = {
  id: 'supabase-public-tables',
  title: 'Database tables anyone can read',
  requiresVerification: true,
  timeoutMs: 8_000,
  async run(ctx) {
    const supabase = ctx.backend.supabase;
    if (!supabase) {
      return [
        {
          checkId: this.id,
          status: 'pass',
          severity: 'critical',
          title: 'Your app does not use a Supabase database we could find',
          explanation:
            'This check looks for Supabase tables that anyone can read. We found no Supabase project in your app.',
          fixKey: this.id,
        },
      ];
    }
    const rest = `${supabase.url.replace(/\/+$/, '')}/rest/v1`;
    const headers = { apikey: supabase.anonKey, authorization: `Bearer ${supabase.anonKey}` };

    const tables = [...(await listedTables(ctx.fetch, rest, headers)), ...COMMON_TABLES]
      .filter((t, i, all) => TABLE_NAME.test(t) && all.indexOf(t) === i)
      .slice(0, MAX_TABLES);

    const answers = await Promise.all(
      tables.map(async (table): Promise<Answer> => {
        try {
          const res = await ctx.fetch(`${rest}/${table}?select=*&limit=1`, {
            headers,
            maxBytes: MAX_BYTES,
          });
          return classify(res);
        } catch {
          return 'unknown';
        }
      }),
    );

    const findings: Finding[] = [];
    tables.forEach((table, i) => {
      if (answers[i] !== 'open') return;
      findings.push({
        checkId: this.id,
        status: 'fail',
        severity: 'critical',
        title: `Anyone can read your “${table}” table without signing in`,
        explanation:
          'Using only the public key your app gives every visitor, we could read rows from this table without being signed in. Anyone can download what is in it, which often includes your users’ personal details. Turn on Row Level Security for the table and add a policy so people can only read their own rows.',
        evidenceRedacted: safeEvidence(`table ${table}: readable while logged out`),
        fixKey: this.id,
      });
    });
    if (findings.length > 0) return findings;

    if (answers.includes('unknown')) {
      return [
        {
          checkId: this.id,
          status: 'incomplete',
          severity: 'critical',
          title: 'We could not finish checking your database tables',
          explanation:
            'Some of our read-only requests to your Supabase project did not get a clear answer, so we cannot say whether your tables are protected. Rescan to try again.',
          fixKey: this.id,
        },
      ];
    }
    return [
      {
        checkId: this.id,
        status: 'pass',
        severity: 'critical',
        title: 'Your database tables refused a visitor who was not signed in',
        explanation: `We tried to read ${String(tables.length)} likely tables with your app’s public key while logged out, and none gave us any rows.`,
        fixKey: this.id,
      },
    ];
  },
};

/** Table names from the project's API description, when it is published. */
async function listedTables(
  fetch: (
    url: string,
    init: { headers: Record<string, string>; maxBytes: number },
  ) => Promise<SafeResponse>,
  rest: string,
  headers: Record<string, string>,
): Promise<string[]> {
  try {
    const res = await fetch(`${rest}/`, { headers, maxBytes: 256 * 1024 });
    if (res.status !== 200 || res.truncated) return [];
    const doc: unknown = JSON.parse(res.body);
    const paths =
      typeof doc === 'object' && doc !== null ? (doc as { paths?: unknown }).paths : undefined;
    if (typeof paths !== 'object' || paths === null) return [];
    return Object.keys(paths)
      .filter((p) => p.startsWith('/') && !p.startsWith('/rpc/'))
      .map((p) => p.slice(1));
  } catch {
    return [];
  }
}

function classify(res: SafeResponse): Answer {
  if (res.status === 429 || res.status >= 500) return 'unknown';
  if (res.status !== 200) return 'closed';
  // A row came back: "[{". An empty list "[]" shows nothing, so it is not counted as open.
  return /^\s*\[\s*\{/.test(res.body) ? 'open' : 'closed';
}
