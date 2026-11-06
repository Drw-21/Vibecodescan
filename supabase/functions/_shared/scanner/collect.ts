// Collect phase: load the page and its script bundles ONCE, so every check reads the same
// snapshot (spec: "Runner rules"). Fetched JavaScript is only ever read as text, never run.
//
// Only bundles on the page's own host are fetched: third-party scripts (analytics, chat
// widgets) are not the founder's code and would cause false positives.

import { attribute, findTags } from './html.ts';
import type { Bundle, SafeFetch } from './types.ts';

export interface CollectLimits {
  maxBundles: number;
  /** Per-bundle read cap (safeFetch's per-response cap). */
  maxBytesPerBundle: number;
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
  let inFlight = 0;
  const loaded = new Map<string, string>();

  const worker = async (): Promise<void> => {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (deadline.aborted) {
        complete = false;
        return;
      }
      // While other downloads are running, wait for their refunds rather than start one
      // with less than a full share (which would cut a normal bundle and wrongly mark
      // the set incomplete). The last download running takes whatever budget is left.
      if (remaining <= 0 || (remaining < limits.maxBytesPerBundle && inFlight > 0)) {
        queue.unshift(next);
        return;
      }
      // Reserve this bundle's share BEFORE fetching, so parallel downloads can never
      // read more than the total budget between them; refund only what was not read.
      const reserved = Math.min(remaining, limits.maxBytesPerBundle);
      remaining -= reserved;
      inFlight += 1;
      let used = reserved; // if the request fails part-way we cannot know, so assume all
      try {
        const res = await fetch(next, { signal: deadline, maxBytes: reserved });
        const bytes = encoder.encode(res.body);
        // Bytes of an error page were still read, so they count against the budget.
        used = Math.min(bytes.byteLength, reserved);
        if (res.status < 200 || res.status >= 300) {
          complete = false;
          continue;
        }
        const kept =
          bytes.byteLength > reserved ? decoder.decode(bytes.subarray(0, reserved)) : res.body;
        if (res.truncated || kept !== res.body) complete = false;
        if (kept.length > 0) loaded.set(next, kept);
      } catch {
        complete = false;
      } finally {
        inFlight -= 1;
        remaining += reserved - used;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, limits.bundleConcurrency) }, worker));
  if (queue.length > 0) complete = false;

  const bundles = candidates.flatMap((u) => {
    const body = loaded.get(u);
    return body === undefined ? [] : [{ url: u, body }];
  });
  return { url, html, headers: page.headers, bundles, bundlesComplete: complete };
}

/** Same-host script URLs referenced by the page, in order, without duplicates. */
export function scriptUrls(html: string, base: URL): string[] {
  const raw: string[] = [];
  for (const tag of findTags(html, 'script')) {
    const src = attribute(tag, 'src');
    if (src !== undefined) raw.push(src);
  }
  for (const tag of findTags(html, 'link')) {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const as = (attribute(tag, 'as') ?? '').toLowerCase();
    const href = attribute(tag, 'href');
    if (
      href !== undefined &&
      (rel.includes('modulepreload') || (rel.includes('preload') && as === 'script'))
    ) {
      raw.push(href);
    }
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
