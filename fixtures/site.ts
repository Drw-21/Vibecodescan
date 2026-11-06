// A fake website for tests: every response is described here, so no test ever
// touches the real internet. Fixture sites (fixtures/checks, fixtures/reference-apps)
// are built from these types.

import type { Transport } from '../supabase/functions/_shared/scanner/safeFetch.ts';

export interface FakeRoute {
  status?: number;
  /** Use tuples to send the same header twice (e.g. several Set-Cookie). */
  headers?: Record<string, string> | [string, string][];
  body?: string | ReadableStream<Uint8Array>;
  /** Never answers until the request is aborted. */
  hang?: boolean;
  /** The connection is refused (nothing listening). */
  refuse?: boolean;
}

/**
 * routes: exact URL -> response. A key "<origin>/*" answers every other path on that
 * origin (like a single-page app that serves index.html for any path).
 * dns: hostname -> addresses. Unknown hostnames resolve to a public address.
 */
export interface Site {
  start: string;
  routes: Record<string, FakeRoute>;
  dns?: Record<string, string[]>;
}

export interface FakeNet {
  transport: Transport;
  resolve: (hostname: string) => Promise<string[]>;
  /** Every URL the transport was asked for, in order. */
  requested: string[];
  /** Request headers seen per URL. */
  seenHeaders: Map<string, Headers>;
}

export function fakeNet(
  routes: Record<string, FakeRoute>,
  dns: Record<string, string[]> = {},
): FakeNet {
  const requested: string[] = [];
  const seenHeaders = new Map<string, Headers>();
  const transport: Transport = (url, init) => {
    requested.push(url.href);
    seenHeaders.set(url.href, init.headers);
    const route = routes[url.href] ?? routes[`${url.origin}/*`];
    if (!route) return Promise.resolve(new Response('not found', { status: 404 }));
    if (route.refuse) return Promise.reject(new TypeError('connection refused'));
    if (route.hang) {
      return new Promise((_resolve, reject) => {
        const abort = (): void => {
          reject(init.signal.reason as Error);
        };
        if (init.signal.aborted) abort();
        else init.signal.addEventListener('abort', abort);
      });
    }
    // A ReadableStream body can only be read once; strings are safe to reuse.
    return Promise.resolve(
      new Response(route.body ?? '', { status: route.status ?? 200, headers: route.headers ?? {} }),
    );
  };
  const resolve = (hostname: string): Promise<string[]> =>
    Promise.resolve(dns[hostname] ?? ['93.184.216.34']);
  return { transport, resolve, requested, seenHeaders };
}
