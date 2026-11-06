// safeFetch: the ONLY way the scan engine touches the network (spec: "Protecting our own
// servers"). It fetches attacker-controlled URLs, so every rule here is a security control:
//   - http/https only, ports 80 and 443 only, no usernames/passwords in the URL
//   - the host must resolve ONLY to public addresses; checked before the first request and
//     again for every redirect (redirects are followed by hand, never automatically)
//   - at most 5 redirects, at most 2 MB read per response, 8 seconds per call
//   - GET only, with our own User-Agent
//
// Known limit (docs/decisions/0004): the standard fetch() does its own DNS lookup, so we
// cannot pin the address we checked. A hostile DNS server could answer differently a
// moment later ("DNS rebinding"). Before launch, run-scan must use a transport that pins
// the resolved address; this module's checks do not change.

import { SAFE_FETCH } from '../config.ts';
import { isPublicAddress, parseIPv4 } from './ip.ts';
import { type SafeFetch, type SafeFetchInit, type SafeResponse, SafeFetchError } from './types.ts';

/** Sends one GET request without following redirects. */
export type Transport = (
  url: URL,
  init: { headers: Headers; signal: AbortSignal },
) => Promise<Response>;

/** Returns every A and AAAA address for a hostname. */
export type Resolver = (hostname: string) => Promise<string[]>;

export interface SafeFetchLimits {
  maxRedirects: number;
  maxBytesPerResponse: number;
  timeoutMs: number;
}

export interface SafeFetchDeps {
  resolve: Resolver;
  /** Defaults to the platform fetch with redirect: 'manual'. */
  transport?: Transport;
  userAgent: string;
  limits?: Partial<SafeFetchLimits>;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const fetchTransport: Transport = (url, init) =>
  fetch(url, { method: 'GET', headers: init.headers, signal: init.signal, redirect: 'manual' });

export function createSafeFetch(deps: SafeFetchDeps): SafeFetch {
  const limits: SafeFetchLimits = {
    maxRedirects: deps.limits?.maxRedirects ?? SAFE_FETCH.maxRedirects,
    maxBytesPerResponse: deps.limits?.maxBytesPerResponse ?? SAFE_FETCH.maxBytesPerResponse,
    timeoutMs: deps.limits?.timeoutMs ?? SAFE_FETCH.timeoutMs,
  };
  const transport = deps.transport ?? fetchTransport;

  return async function safeFetch(input, init: SafeFetchInit = {}): Promise<SafeResponse> {
    const timeout = AbortSignal.timeout(limits.timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    const maxBytes = Math.min(
      init.maxBytes ?? limits.maxBytesPerResponse,
      limits.maxBytesPerResponse,
    );
    const headers = buildHeaders(init.headers, deps.userAgent);

    let url = parseUrl(input);
    const redirects: string[] = [];

    try {
      for (;;) {
        await assertAllowed(url, deps.resolve, signal);
        signal.throwIfAborted();
        const response = await transport(url, { headers, signal });

        const location = response.headers.get('location');
        if (REDIRECT_STATUSES.has(response.status) && location !== null) {
          await response.body?.cancel();
          if (redirects.length >= limits.maxRedirects) {
            throw new SafeFetchError(
              'too_many_redirects',
              `more than ${String(limits.maxRedirects)} redirects`,
            );
          }
          redirects.push(url.href);
          url = parseUrl(location, url);
          continue;
        }

        const { body, truncated } = await readCapped(response, maxBytes);
        return {
          url: url.href,
          status: response.status,
          headers: response.headers,
          body,
          truncated,
          redirects,
        };
      }
    } catch (error) {
      throw toSafeFetchError(error, signal, timeout, init.signal);
    }
  };
}

function buildHeaders(extra: Record<string, string> | undefined, userAgent: string): Headers {
  const headers = new Headers(extra);
  headers.set('user-agent', userAgent);
  if (!headers.has('accept')) headers.set('accept', '*/*');
  return headers;
}

function parseUrl(input: string | URL, base?: URL): URL {
  try {
    return new URL(input, base);
  } catch (error) {
    throw new SafeFetchError('invalid_url', 'not a valid URL', { cause: error });
  }
}

/** Throws unless the URL is safe to request. */
async function assertAllowed(url: URL, resolve: Resolver, signal: AbortSignal): Promise<void> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SafeFetchError('blocked_scheme', 'only http and https are allowed');
  }
  const port = url.port === '' ? (url.protocol === 'https:' ? 443 : 80) : Number(url.port);
  if (!(SAFE_FETCH.allowedPorts as readonly number[]).includes(port)) {
    throw new SafeFetchError('blocked_port', 'only ports 80 and 443 are allowed');
  }
  if (url.username !== '' || url.password !== '') {
    throw new SafeFetchError('blocked_credentials', 'credentials in URLs are not allowed');
  }

  // `new URL` has already turned "2130706433", "0x7f.1" etc. into dotted IPv4.
  const host = url.hostname.startsWith('[') ? url.hostname.slice(1, -1) : url.hostname;
  const isLiteral = parseIPv4(host) !== null || host.includes(':');
  let addresses: string[];
  if (isLiteral) {
    addresses = [host];
  } else {
    try {
      addresses = await resolve(host);
    } catch (error) {
      if (signal.aborted) throw error;
      throw new SafeFetchError('dns_failed', 'could not resolve host', { cause: error });
    }
    if (addresses.length === 0) throw new SafeFetchError('dns_failed', 'host has no addresses');
  }
  if (!addresses.every(isPublicAddress)) {
    throw new SafeFetchError('blocked_address', 'host resolves to a private or reserved address');
  }
}

/** Reads at most maxBytes of the body, then stops reading (no unbounded downloads). */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<{ body: string; truncated: boolean }> {
  if (!response.body) return { body: '', truncated: false };
  const reader: ReadableStreamDefaultReader<Uint8Array> = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes - size;
    if (value.byteLength >= room) {
      chunks.push(value.subarray(0, room));
      size += room;
      // Stop if we hit the cap exactly and more data might follow.
      truncated = value.byteLength > room || !(await isFinished(reader));
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder('utf-8', { fatal: false }).decode(all), truncated };
}

async function isFinished(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<boolean> {
  const next = await reader.read();
  return next.done || next.value.byteLength === 0;
}

function toSafeFetchError(
  error: unknown,
  signal: AbortSignal,
  timeout: AbortSignal,
  callerSignal: AbortSignal | undefined,
): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  if (signal.aborted) {
    if (callerSignal?.aborted)
      return new SafeFetchError('aborted', 'request aborted', { cause: error });
    if (timeout.aborted)
      return new SafeFetchError('timeout', 'request timed out', { cause: error });
  }
  return new SafeFetchError('network', 'network error', { cause: error });
}
