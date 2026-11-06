import { GOOD_HEADERS, appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

const withCookies = (...cookies: string[]) =>
  appSite({
    headers: [
      ...Object.entries(GOOD_HEADERS),
      ...cookies.map((c): [string, string] => ['set-cookie', c]),
    ],
  });

export const cases: CheckCase[] = [
  {
    name: 'session cookie with no safety settings',
    site: withCookies('session=abc123; Path=/'),
    expect: 'fail',
    failSeverities: ['medium'],
    evidence: ['session', 'Secure', 'HttpOnly', 'SameSite'],
    mustNotLeak: ['abc123'],
  },
  {
    name: 'SameSite=None without Secure',
    site: withCookies('auth_token=xyz; Path=/; HttpOnly; SameSite=None'),
    expect: 'fail',
    failSeverities: ['medium'],
    evidence: ['auth_token', 'Secure'],
  },
  {
    name: 'two unsafe login cookies are two findings',
    site: withCookies('sid=1; Path=/', 'connect.sid=2; Path=/; Secure'),
    expect: 'fail',
    failSeverities: ['medium', 'medium'],
  },
  {
    name: 'no cookies at all',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'session cookie with Secure, HttpOnly and SameSite',
    site: withCookies('session=abc; Path=/; Secure; HttpOnly; SameSite=Lax'),
    expect: 'pass',
  },
  {
    name: 'analytics cookies are not login cookies',
    site: withCookies('_ga=GA1.1.123; Path=/', 'theme=dark; Path=/'),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: CSRF cookies are meant to be readable (XSRF-TOKEN, csrftoken)',
    site: withCookies('XSRF-TOKEN=abc; Path=/', 'csrftoken=def; Path=/'),
    expect: 'pass',
  },
  {
    name: 'Supabase auth cookie is read by the browser by design (HttpOnly not required)',
    site: withCookies('sb-abcdefghijklmnopqrst-auth-token=v; Path=/; Secure; SameSite=Lax'),
    expect: 'pass',
  },
];
