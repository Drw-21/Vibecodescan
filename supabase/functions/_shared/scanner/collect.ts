// Collect phase: load the page and its script bundles ONCE, so every check reads the same
// snapshot (spec: "Runner rules"). Fetched JavaScript is only ever read as text, never run.
//
// Only bundles on the page's own host are fetched: third-party scripts (analytics, chat
// widgets) are not the founder's code and would cause false positives.

import type { Bundle, SafeFetch } from './types.ts';

export interface CollectLimits {
  maxBundles: number;
  maxTotalBytes: number;
  timeoutMs: number;
  bundleConcurrency: number;
}

export interface CollectResult {
  url: URL;
  html: string;
  headers: Headers;
  bundles: Bundle[];
  bundlesComplete: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function collect(
  pageUrl: string,
  deps: { fetch: SafeFetch; limits: CollectLimits },
): Promise<CollectResult> {
  const { fetch, limits } = deps;
  const deadline = AbortSignal.timeout(limits.timeoutMs);

  // A page that cannot be loaded fails the whole scan (the error carries a code).
  const page = await fetch(pageUrl, { signal: deadline, maxBytes: limits.maxTotalBytes });
  const url = new URL(page.url);
  const html = page.body;

  const candidates = scriptUrls(html, url);
  let complete = candidates.length <= limits.maxBundles && !page.truncated;
  const queue = candidates.slice(0, limits.maxBundles);

  let remaining = limits.maxTotalBytes - encoder.encode(html).byteLength;
  const loaded = new Map<string, string>();

  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (remaining <= 0 || deadline.aborted) {
        complete = false;
        return;
      }
      try {
        const res = await fetch(next, { signal: deadline, maxBytes: remaining });
        if (res.status < 200 || res.status >= 300) {
          complete = false;
          continue;
        }
        const bytes = encoder.encode(res.body);
        // Several bundles load at once, so trim to whatever budget is left now.
        const kept =
          bytes.byteLength > remaining
            ? decoder.decode(bytes.subarray(0, Math.max(0, remaining)))
            : res.body;
        if (res.truncated || kept !== res.body) complete = false;
        remaining -= Math.min(bytes.byteLength, remaining);
        if (kept.length > 0) loaded.set(next, kept);
      } catch {
        complete = false;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limits.bundleConcurrency) }, worker));

  const bundles = candidates.flatMap((u) => {
    const body = loaded.get(u);
    return body === undefined ? [] : [{ url: u, body }];
  });
  return { url, html, headers: page.headers, bundles, bundlesComplete: complete };
}

const SCRIPT_SRC = /<script\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const REL = /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/** Same-host script URLs referenced by the page, in order, without duplicates. */
export function scriptUrls(html: string, base: URL): string[] {
  const raw: string[] = [];
  for (const m of html.matchAll(SCRIPT_SRC)) raw.push(m[1] ?? m[2] ?? m[3] ?? '');
  for (const m of html.matchAll(LINK_TAG)) {
    const tag = m[0];
    const relMatch = REL.exec(tag);
    const rel = (relMatch?.[1] ?? relMatch?.[2] ?? relMatch?.[3] ?? '').toLowerCase();
    const isScript =
      rel.split(/\s+/).includes('modulepreload') ||
      (rel.split(/\s+/).includes('preload') && /\bas\s*=\s*["']?script/i.test(tag));
    const href = HREF.exec(tag);
    if (isScript && href) raw.push(href[1] ?? href[2] ?? href[3] ?? '');
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const src of raw) {
    let resolved: URL;
    try {
      resolved = new URL(decodeEntities(src.trim()), base);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    if (resolved.hostname !== base.hostname) continue;
    resolved.hash = '';
    if (!seen.has(resolved.href)) {
      seen.add(resolved.href);
      out.push(resolved.href);
    }
  }
  return out;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
