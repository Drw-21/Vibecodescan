import { fake } from '../secrets.ts';
import { appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

const envFile = (): string =>
  [
    '# production settings',
    'VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co',
    `STRIPE_SECRET_KEY=${fake.stripeLive()}`,
    'export NODE_ENV=production',
    '',
  ].join('\n');

const gitConfig = `[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = false
[remote "origin"]
\turl = https://github.com/example/app.git
`;

const sqlDump = `-- PostgreSQL database dump
CREATE TABLE public.users (id uuid primary key, email text);
INSERT INTO public.users VALUES ('00000000-0000-0000-0000-000000000000', 'a@example.test');
`;

const text = (body: string) => ({ body, headers: { 'content-type': 'text/plain' } });

export const cases: CheckCase[] = [
  {
    name: 'a real .env file is served',
    site: appSite({ routes: { '/.env': text(envFile()) } }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['/.env'],
    mustNotLeak: ['STRIPE_SECRET_KEY', 'supabase.co'],
  },
  {
    name: 'a .env.production file is served (no content-type)',
    site: appSite({ routes: { '/.env.production': { body: envFile() } } }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['/.env.production'],
  },
  {
    name: 'the git config is served',
    site: appSite({ routes: { '/.git/config': text(gitConfig) } }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['/.git/config'],
  },
  {
    name: 'a database backup is served',
    site: appSite({ routes: { '/backup.sql': text(sqlDump) } }),
    expect: 'fail',
    failSeverities: ['critical'],
    evidence: ['/backup.sql'],
  },
  {
    name: 'nothing exposed: every probe gets 404',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: the app answers every path with its own page (catch-all)',
    site: appSite({ catchAll: true }),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: /.env redirects to a login page',
    site: appSite({
      routes: {
        '/.env': { status: 302, headers: { location: '/login' } },
        '/login': {
          body: '<html><body>Sign in</body></html>',
          headers: { 'content-type': 'text/html' },
        },
      },
    }),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: a JSON error that mentions KEY=value',
    site: appSite({
      routes: {
        '/.env': {
          body: '{"error":"Not found","hint":"A=B"}',
          headers: { 'content-type': 'application/json' },
        },
      },
    }),
    expect: 'pass',
  },
  {
    name: 'fail safe: the server is overloaded (503) for every probe',
    site: appSite({ routes: { 'https://app.example.test/*': { status: 503, body: 'busy' } } }),
    expect: 'incomplete',
  },
  {
    name: 'fail safe: the server rate-limits us (429)',
    site: appSite({ routes: { 'https://app.example.test/*': { status: 429, body: 'slow down' } } }),
    expect: 'incomplete',
  },
  {
    name: 'the probes could not be made',
    site: appSite({ routes: { 'https://app.example.test/*': { refuse: true } } }),
    expect: 'incomplete',
  },
];
