import { GOOD_HEADERS, appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

const without = (...names: string[]): Record<string, string> =>
  Object.fromEntries(Object.entries(GOOD_HEADERS).filter(([k]) => !names.includes(k)));

export const cases: CheckCase[] = [
  {
    name: 'no security headers at all',
    site: appSite({ headers: { 'content-type': 'text/html' } }),
    expect: 'fail',
    failSeverities: ['medium', 'medium', 'low', 'low', 'low'],
  },
  {
    name: 'Content-Security-Policy only in report-only mode',
    site: appSite({
      headers: {
        ...without('content-security-policy'),
        'content-security-policy-report-only': "default-src 'self'",
      },
    }),
    expect: 'fail',
    failSeverities: ['medium'],
    evidence: ['Content-Security-Policy'],
  },
  {
    name: 'HSTS switched off with max-age=0',
    site: appSite({ headers: { ...GOOD_HEADERS, 'strict-transport-security': 'max-age=0' } }),
    expect: 'fail',
    failSeverities: ['medium'],
  },
  {
    name: 'X-Content-Type-Options set to something other than nosniff',
    site: appSite({ headers: { ...GOOD_HEADERS, 'x-content-type-options': 'yes' } }),
    expect: 'fail',
    failSeverities: ['low'],
  },
  {
    name: 'Referrer-Policy that leaks full URLs',
    site: appSite({ headers: { ...GOOD_HEADERS, 'referrer-policy': 'unsafe-url' } }),
    expect: 'fail',
    failSeverities: ['low'],
  },
  {
    name: 'frame-ancestors * does not protect against framing',
    site: appSite({
      headers: {
        ...without('x-frame-options'),
        'content-security-policy': "default-src 'self'; frame-ancestors *",
      },
    }),
    expect: 'fail',
    failSeverities: ['low'],
  },
  {
    name: 'false-positive trap: CSP set in a <meta> tag counts',
    site: appSite({
      headers: without('content-security-policy'),
      head: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`,
    }),
    expect: 'pass',
  },
  {
    name: 'false-positive trap: the same header sent twice (nosniff, nosniff / DENY, DENY)',
    site: appSite({
      headers: [
        ...Object.entries(without('x-content-type-options', 'x-frame-options')),
        ['x-content-type-options', 'nosniff'],
        ['x-content-type-options', 'nosniff'],
        ['x-frame-options', 'DENY'],
        ['x-frame-options', 'DENY'],
      ],
    }),
    expect: 'pass',
  },
  {
    name: 'all five protections set',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'frame-ancestors in the CSP counts as clickjacking protection',
    site: appSite({ headers: without('x-frame-options') }),
    expect: 'pass',
  },
  {
    name: 'X-Frame-Options alone counts as clickjacking protection',
    site: appSite({
      headers: { ...GOOD_HEADERS, 'content-security-policy': "default-src 'self'" },
    }),
    expect: 'pass',
  },
];
