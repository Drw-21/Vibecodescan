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

/**
 * Reads a JSON body no larger than the limit. Stops reading as soon as the limit is passed,
 * so a huge body is never buffered.
 */
export async function readJson(
  req: Request,
  maxBytes: number = LIMITS.maxBodyBytes,
): Promise<unknown> {
  const declared = Number(req.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new Error('body too large');
  if (!req.body) throw new Error('empty body');
  const reader: ReadableStreamDefaultReader<Uint8Array> = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('body too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(all)) as unknown;
}
