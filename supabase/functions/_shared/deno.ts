// Production wiring that only exists on the Deno edge runtime. Kept tiny: everything it
// connects is runtime-agnostic and tested under Node.

import { SAFE_FETCH, userAgent } from './config.ts';
import { createResolver } from './resolver.ts';
import { createSafeFetch } from './scanner/safeFetch.ts';
import type { SafeFetch } from './scanner/types.ts';
import type { TxtLookup } from './verify.ts';

declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;

/** Reads a required environment variable; fails loudly at start-up if it is missing. */
export function env(name: string): string {
  const value = Deno.env.get(name);
  if (value === undefined || value === '') throw new Error(`missing environment variable ${name}`);
  return value;
}

/** Deno.resolveDns for A and AAAA; "no records of this type" is not an error. */
export const denoResolver = createResolver(
  (host, type, signal) => Deno.resolveDns(host, type, { signal }),
  (error) => error instanceof Deno.errors.NotFound,
);

/** TXT records for a name, each record's strings joined; "no records" is an empty list. */
export const txtLookup: TxtLookup = async (host, signal) => {
  try {
    const records = await Deno.resolveDns(host, 'TXT', { signal });
    return records.map((parts) => parts.join(''));
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
};

export function productionSafeFetch(): SafeFetch {
  return createSafeFetch({
    resolve: denoResolver,
    userAgent: userAgent(env('SCANNER_BOT_DOMAIN')),
    limits: { timeoutMs: SAFE_FETCH.timeoutMs },
  });
}

/** Keeps work running after the response is sent. */
export function background(work: Promise<unknown>): void {
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work);
  else work.catch(() => undefined); // local development: let it finish on its own
}
