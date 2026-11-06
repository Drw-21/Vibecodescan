// Fake network for engine tests: no test ever touches the real internet.

import type { Transport } from '../../../supabase/functions/_shared/scanner/safeFetch.ts';

export interface FakeRoute {
  status?: number;
  headers?: Record<string, string>;
  body?: string | ReadableStream<Uint8Array>;
  /** Never answers until the request is aborted. */
  hang?: boolean;
}

export interface FakeNet {
  transport: Transport;
  resolve: (hostname: string) => Promise<string[]>;
  /** Every URL the transport was asked for, in order. */
  requested: string[];
  /** Request headers seen per URL. */
  seenHeaders: Map<string, Headers>;
}

/**
 * routes: URL (exact string) -> response.
 * dns: hostname -> addresses. Unknown hostnames resolve to a public address.
 */
export function fakeNet(
  routes: Record<string, FakeRoute>,
  dns: Record<string, string[]> = {},
): FakeNet {
  const requested: string[] = [];
  const seenHeaders = new Map<string, Headers>();
  const transport: Transport = (url, init) => {
    requested.push(url.href);
    seenHeaders.set(url.href, init.headers);
    const route = routes[url.href];
    if (!route) return Promise.resolve(new Response('not found', { status: 404 }));
    if (route.hang) {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason as Error);
        });
      });
    }
    return Promise.resolve(
      new Response(route.body ?? '', { status: route.status ?? 200, headers: route.headers ?? {} }),
    );
  };
  const resolve = (hostname: string): Promise<string[]> =>
    Promise.resolve(dns[hostname] ?? ['93.184.216.34']);
  return { transport, resolve, requested, seenHeaders };
}

/** A body that never ends: proves we stop reading at the byte cap. */
export function endlessStream(chunk = 'x'.repeat(64 * 1024)): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(chunk);
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(bytes);
    },
  });
}
