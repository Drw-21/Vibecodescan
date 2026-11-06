import { GOOD_HEADERS, appSite } from '../sites.ts';
import type { CheckCase } from './types.ts';

const page = '<!doctype html><html><head><title>App</title></head><body></body></html>';

export const cases: CheckCase[] = [
  {
    name: 'http:// serves the page instead of redirecting',
    site: appSite({ httpRedirect: false }),
    expect: 'fail',
    failSeverities: ['high'],
  },
  {
    name: 'the app only works over plain http',
    site: {
      start: 'http://app.example.test/',
      routes: { 'http://app.example.test/': { body: page, headers: GOOD_HEADERS } },
    },
    expect: 'fail',
    failSeverities: ['high'],
  },
  {
    name: 'http:// redirects to https://',
    site: appSite(),
    expect: 'pass',
  },
  {
    name: 'nothing listens on plain http at all',
    site: appSite({ routes: { 'http://app.example.test/': { refuse: true } } }),
    expect: 'pass',
  },
  {
    name: 'the http:// request timed out',
    site: appSite({ routes: { 'http://app.example.test/': { hang: true } } }),
    expect: 'incomplete',
  },
];
