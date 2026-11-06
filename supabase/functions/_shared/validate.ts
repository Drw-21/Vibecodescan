// Every input is validated with a schema before use (spec: "Validate at the edges").

import { z } from 'zod';
import { LIMITS } from './config.ts';

export const CreateScanBody = z.object({
  url: z.string().min(1).max(2048),
  turnstileToken: z.string().min(1).max(2048).optional(),
});
export type CreateScanBody = z.infer<typeof CreateScanBody>;

export const RunScanBody = z.object({ scanId: z.uuid() });

export interface ScanTarget {
  /** Origin and path only: no query string, fragment, credentials or port. */
  url: string;
  host: string;
}

/**
 * Turns what a founder pastes ("myapp.lovable.app", "https://myapp.com/?ref=x") into a
 * clean target, or null if it cannot be scanned. safeFetch still makes the final call on
 * whether an address is reachable; this only rejects what is clearly not a public website.
 */
export function normaliseScanUrl(input: string): ScanTarget | null {
  const trimmed = input.trim();
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '' || url.port !== '') return null;
  const host = url.hostname.toLowerCase();
  // A public domain name: letters/digits/hyphens in labels, a dot, a letter-only TLD.
  // This also refuses IP addresses, "localhost" and other single-label names.
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return null;
  return { url: `${url.protocol}//${host}${url.pathname}`, host };
}

/** Reads a JSON body no larger than the limit. */
export async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > LIMITS.maxBodyBytes)
    throw new Error('body too large');
  return JSON.parse(text) as unknown;
}
