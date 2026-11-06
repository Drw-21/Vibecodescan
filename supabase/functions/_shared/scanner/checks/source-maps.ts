// source-maps: published .map files let anyone read your app's original source code.
// A map only counts if the response really is a source map (JSON with version and
// mappings/sources) — catch-all pages are not reported.

import { safeEvidence, safePath } from '../redact.ts';
import type { Check, Finding } from '../types.ts';

const MAPPING_COMMENT = /\/\/[#@]\s*sourceMappingURL=([^\s'"]+)\s*$/m;
const MAX_PROBES = 5;
const PROBE_MAX_BYTES = 64 * 1024;

const looksLikeSourceMap = (body: string): boolean =>
  /^\s*\{/.test(body) && /"version"\s*:\s*3/.test(body) && /"(?:mappings|sources)"\s*:/.test(body);

export const sourceMaps: Check = {
  id: 'source-maps',
  title: 'Your original source code is published',
  requiresVerification: false,
  timeoutMs: 8_000,
  async run(ctx) {
    const exposed = (evidence: string): Finding[] => [
      {
        checkId: this.id,
        status: 'fail',
        severity: 'medium',
        title: 'Anyone can read your app’s original source code',
        explanation:
          'Your website publishes “source map” files, which turn the compressed code back into the code you (or your AI builder) wrote, with comments and file names. That makes it much easier for someone to find weaknesses. Switch source maps off for production builds.',
        evidenceRedacted: safeEvidence(evidence),
        fixKey: 'source-maps',
      },
    ];

    // A map embedded in the bundle itself is already public.
    for (const bundle of ctx.bundles) {
      const comment = MAPPING_COMMENT.exec(bundle.body)?.[1];
      if (comment?.startsWith('data:')) return exposed(`map embedded in ${safePath(bundle.url)}`);
    }

    const candidates: string[] = [];
    for (const bundle of ctx.bundles.slice(0, MAX_PROBES)) {
      const comment = MAPPING_COMMENT.exec(bundle.body)?.[1];
      let target: URL;
      try {
        target = new URL(comment ?? `${bundle.url}.map`, bundle.url);
      } catch {
        continue;
      }
      if (target.hostname === ctx.url.hostname) candidates.push(target.href);
    }

    const results = await Promise.allSettled(
      candidates.map(async (url) => {
        const res = await ctx.fetch(url, { maxBytes: PROBE_MAX_BYTES });
        return res.status === 200 && looksLikeSourceMap(res.body);
      }),
    );
    const found = candidates.find((_url, i) => {
      const r = results[i];
      return r?.status === 'fulfilled' && r.value;
    });
    if (found) return exposed(safePath(found));

    if (results.some((r) => r.status === 'rejected') || !ctx.bundlesComplete) {
      return [
        {
          checkId: this.id,
          status: 'incomplete',
          severity: 'medium',
          title: 'We could not check for published source code',
          explanation:
            'Some of our requests to your website did not get an answer, so we cannot say whether your source code is published. Rescan to try again.',
          fixKey: 'source-maps',
        },
      ];
    }
    return [
      {
        checkId: this.id,
        status: 'pass',
        severity: 'medium',
        title: 'Your original source code is not published',
        explanation: 'We found no source map files next to your app’s code.',
        fixKey: 'source-maps',
      },
    ];
  },
};
