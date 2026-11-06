// cookie-flags: login/session cookies must be Secure (HTTPS only), HttpOnly (hidden from
// scripts) and SameSite (not sent by other sites). Only login-like cookies are judged;
// cookie VALUES are never stored.

import { safeEvidence } from '../redact.ts';
import type { Check, Finding } from '../types.ts';

const SESSION_NAME = /sess|sid|auth|token|jwt|login|remember/i;

interface Cookie {
  name: string;
  attributes: Set<string>;
  sameSite: string | undefined;
}

function parse(header: string): Cookie | null {
  const [pair, ...attrs] = header.split(';');
  const name = (pair ?? '').split('=')[0]?.trim() ?? '';
  if (name === '') return null;
  const attributes = new Set<string>();
  let sameSite: string | undefined;
  for (const attr of attrs) {
    const [key, value] = attr.split('=').map((s) => s.trim());
    const k = (key ?? '').toLowerCase();
    attributes.add(k);
    if (k === 'samesite') sameSite = (value ?? '').toLowerCase();
  }
  return { name, attributes, sameSite };
}

function missingFlags(cookie: Cookie): string[] {
  const missing: string[] = [];
  if (!cookie.attributes.has('secure')) missing.push('Secure');
  // Supabase's own auth cookies are read by its browser library on purpose.
  if (!cookie.attributes.has('httponly') && !/^sb-.+-auth-token/.test(cookie.name)) {
    missing.push('HttpOnly');
  }
  if (cookie.sameSite === undefined || cookie.sameSite === '') missing.push('SameSite');
  return missing;
}

export const cookieFlags: Check = {
  id: 'cookie-flags',
  title: 'Login cookie safety settings',
  requiresVerification: false,
  timeoutMs: 8_000,
  run(ctx) {
    const cookies = ctx.headers
      .getSetCookie()
      .map(parse)
      .filter((c): c is Cookie => c !== null && SESSION_NAME.test(c.name));

    const findings: Finding[] = [];
    for (const cookie of cookies) {
      const missing = missingFlags(cookie);
      if (missing.length === 0) continue;
      const name = cookie.name.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40);
      findings.push({
        checkId: this.id,
        status: 'fail',
        severity: 'medium',
        title: `Login cookie “${name}” is missing safety settings`,
        explanation:
          'This cookie keeps your users signed in. Without these settings it can be sent over insecure connections, read by scripts, or sent along when another website makes requests to your app — each of which can let someone take over an account.',
        evidenceRedacted: safeEvidence(`${name}: missing ${missing.join(', ')}`),
        fixKey: 'cookie-flags',
      });
    }
    if (findings.length > 0) return Promise.resolve(findings);
    return Promise.resolve([
      {
        checkId: this.id,
        status: 'pass',
        severity: 'medium',
        title:
          cookies.length > 0
            ? 'Your login cookies have their safety settings'
            : 'No unsafe login cookies on your app’s first page',
        explanation:
          'We checked the cookies your app sets when it first loads. Cookies set after someone signs in are not covered by this free scan.',
        fixKey: 'cookie-flags',
      },
    ]);
  },
};
