// Builds a realistic, SECURE single-page app (the shape Lovable, Bolt and v0 produce).
// Each fixture starts from this and changes one thing, so a fixture tests exactly one flaw.

import type { FakeRoute, Site } from './site.ts';

export const GOOD_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

export interface AppOptions {
  host?: string;
  /** Extra markup inside <head>. */
  head?: string;
  /** Bundles by path, e.g. { '/assets/index-abc123.js': 'code' }. Linked from the page. */
  bundles?: Record<string, string>;
  /** Replaces GOOD_HEADERS for the page. */
  headers?: Record<string, string> | [string, string][];
  /** http:// redirects to https:// (default true). false = http serves the page. */
  httpRedirect?: boolean;
  /** Unknown paths return index.html with 200, like most SPA hosts (default false = 404). */
  catchAll?: boolean;
  /** Extra or overriding routes, by path. */
  routes?: Record<string, FakeRoute>;
}

export function appSite(options: AppOptions = {}): Site {
  const host = options.host ?? 'app.example.test';
  const origin = `https://${host}`;
  const bundles = options.bundles ?? { '/assets/index-a1b2c3d4.js': 'console.log("hello")' };
  const scripts = Object.keys(bundles)
    .map((path) => `<script type="module" crossorigin src="${path}"></script>`)
    .join('\n    ');
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>My App</title>
    ${options.head ?? ''}
    ${scripts}
  </head>
  <body><div id="root"></div></body>
</html>`;
  const page: FakeRoute = { body: html, headers: options.headers ?? GOOD_HEADERS };

  const routes: Record<string, FakeRoute> = { [`${origin}/`]: page };
  for (const [path, body] of Object.entries(bundles)) {
    routes[`${origin}${path}`] = { body, headers: { 'content-type': 'text/javascript' } };
  }
  routes[`http://${host}/`] =
    options.httpRedirect === false ? page : { status: 301, headers: { location: `${origin}/` } };
  if (options.catchAll) routes[`${origin}/*`] = page;
  for (const [path, route] of Object.entries(options.routes ?? {})) {
    routes[path.startsWith('http') ? path : `${origin}${path}`] = route;
  }
  return { start: `${origin}/`, routes };
}
