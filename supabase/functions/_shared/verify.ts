// Ownership check (spec: "Deep checks run only after the user proves ownership: a DNS TXT
// record scanner-verify=<token> or a file at /.well-known/scanner-verify.txt").
// Used by verify-site ("Check now") and again before every deep scan. Fails closed: any error
// or doubt means "not verified".
//
// Threat model: "Verification bypass". The file must be served by the site's own host over
// HTTPS; a redirect to any other host does not count (otherwise an open redirect on the
// victim's site could point at an attacker's file).

import { VERIFY } from './config.ts';
import type { SafeFetch } from './scanner/types.ts';

export interface SiteToVerify {
  url: string;
  host: string;
  token: string;
}

/** TXT records for a name, each record's strings already joined. "None" is an empty list. */
export type TxtLookup = (host: string, signal: AbortSignal) => Promise<string[]>;

export interface VerifyDeps {
  fetch: SafeFetch;
  lookupTxt: TxtLookup;
  timeoutMs?: number;
}

export type VerifyResult = { verified: true; method: 'dns' | 'file' } | { verified: false };

export async function verifyOwnership(site: SiteToVerify, deps: VerifyDeps): Promise<VerifyResult> {
  // The stored host must be exactly what a URL parser reads from the stored URL (ADR 0002).
  let parsedHost: string;
  try {
    parsedHost = new URL(site.url).hostname;
  } catch {
    return { verified: false };
  }
  if (parsedHost !== site.host || !/^[0-9a-f]{64}$/.test(site.token)) return { verified: false };

  const expected = `${VERIFY.recordPrefix}${site.token}`;
  const signal = AbortSignal.timeout(deps.timeoutMs ?? 8_000);

  const [dns, file] = await Promise.all([
    deps.lookupTxt(site.host, signal).then(
      (records) => records.some((r) => r.trim() === expected),
      () => false,
    ),
    deps
      .fetch(`https://${site.host}${VERIFY.filePath}`, { maxBytes: 1024, signal })
      .then((res) => {
        const final = new URL(res.url);
        const body = res.body.trim();
        return (
          res.status === 200 &&
          final.protocol === 'https:' &&
          final.hostname === site.host &&
          (body === expected || body === site.token)
        );
      })
      .catch(() => false),
  ]);

  if (dns) return { verified: true, method: 'dns' };
  if (file) return { verified: true, method: 'file' };
  return { verified: false };
}
