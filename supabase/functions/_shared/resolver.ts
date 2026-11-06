// Production DNS resolver for safeFetch: returns EVERY A and AAAA address, so safeFetch can
// refuse a host if any of them is private (launch blocker 2). The lookup function is
// injected: Deno.resolveDns in production, a fake in tests.

import type { Resolver } from './scanner/safeFetch.ts';

export type DnsLookup = (
  host: string,
  type: 'A' | 'AAAA',
  signal: AbortSignal,
) => Promise<string[]>;

/** True for "no records of this type" (not an outage). */
export type IsNoRecords = (error: unknown) => boolean;

export function createResolver(lookup: DnsLookup, isNoRecords: IsNoRecords): Resolver {
  return async (host, signal) => {
    const results = await Promise.allSettled([
      lookup(host, 'A', signal),
      lookup(host, 'AAAA', signal),
    ]);
    const addresses: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') addresses.push(...result.value);
      else if (!isNoRecords(result.reason)) {
        // A failed lookup could be hiding a private address: fail, never guess.
        throw result.reason instanceof Error ? result.reason : new Error('DNS lookup failed');
      }
    }
    return addresses;
  };
}
