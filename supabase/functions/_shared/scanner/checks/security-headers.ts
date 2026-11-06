// security-headers: five browser protections a site switches on with response headers.
// One finding per protection, so the report can say exactly which ones are missing.

import { attribute, findTags } from '../html.ts';
import type { Check, Finding, Severity } from '../types.ts';

interface HeaderRule {
  key: string;
  name: string;
  severity: Severity;
  ok: (h: Headers, html: string) => boolean;
  missingTitle: string;
  okTitle: string;
  explanation: string;
}

const csp = (h: Headers): string => h.get('content-security-policy') ?? '';

/** First value of a header that a host and a framework may both have set ("nosniff, nosniff"). */
const first = (h: Headers, name: string): string =>
  (h.get(name) ?? '').split(',')[0]?.trim().toLowerCase() ?? '';

/** A CSP can also be set in the page itself; it protects scripts just the same. */
function metaCsp(html: string): string {
  for (const tag of findTags(html, 'meta').tags) {
    if ((attribute(tag, 'http-equiv') ?? '').toLowerCase() === 'content-security-policy') {
      return (attribute(tag, 'content') ?? '').trim();
    }
  }
  return '';
}

/** frame-ancestors that actually limits who can frame the page (not "*" or a bare scheme). */
function framingLimited(policy: string): boolean {
  const directive = /frame-ancestors([^;]*)/i.exec(policy)?.[1];
  if (directive === undefined) return false;
  const sources = directive.trim().split(/\s+/).filter(Boolean);
  return (
    sources.length > 0 && !sources.some((s) => s === '*' || /^(?:https?|data|blob):?$/i.test(s))
  );
}

const RULES: HeaderRule[] = [
  {
    key: 'csp',
    name: 'Content-Security-Policy',
    severity: 'medium',
    ok: (h, html) => csp(h).trim() !== '' || metaCsp(html) !== '',
    missingTitle: 'No protection against injected scripts (Content-Security-Policy)',
    okTitle: 'Protection against injected scripts is on (Content-Security-Policy)',
    explanation:
      'This header tells browsers which scripts your app is allowed to run. Without it, if an attacker manages to slip a script into your page, browsers will run it and it can steal your users’ logins.',
  },
  {
    key: 'hsts',
    name: 'Strict-Transport-Security',
    severity: 'medium',
    ok: (h) => {
      const age = /max-age\s*=\s*"?(\d+)/i.exec(h.get('strict-transport-security') ?? '')?.[1];
      return age !== undefined && Number(age) > 0;
    },
    missingTitle: 'Browsers are not told to always use the secure connection (HSTS)',
    okTitle: 'Browsers always use the secure connection (HSTS)',
    explanation:
      'This header makes browsers remember to use HTTPS for your site every time. Without it, someone on the same Wi-Fi can push a visitor onto an insecure connection and read what they send.',
  },
  {
    key: 'frame',
    name: 'X-Frame-Options / frame-ancestors',
    severity: 'low',
    ok: (h) => /^(deny|sameorigin)$/.test(first(h, 'x-frame-options')) || framingLimited(csp(h)),
    missingTitle: 'Other sites can show your app inside theirs (clickjacking)',
    okTitle: 'Other sites cannot show your app inside theirs',
    explanation:
      'Without this protection, another website can load your app invisibly inside its own page and trick your users into clicking buttons they cannot see.',
  },
  {
    key: 'nosniff',
    name: 'X-Content-Type-Options',
    severity: 'low',
    ok: (h) => first(h, 'x-content-type-options') === 'nosniff',
    missingTitle: 'Browsers may guess file types (X-Content-Type-Options)',
    okTitle: 'Browsers do not guess file types (X-Content-Type-Options)',
    explanation:
      'This header stops browsers from treating an uploaded file as a script just because it looks like one. Set it to “nosniff”.',
  },
  {
    key: 'referrer',
    name: 'Referrer-Policy',
    severity: 'low',
    ok: (h) => {
      const value = (h.get('referrer-policy') ?? '').trim().toLowerCase();
      return value !== '' && !/unsafe-url|no-referrer-when-downgrade/.test(value);
    },
    missingTitle: 'Full page addresses are shared with other sites (Referrer-Policy)',
    okTitle: 'Page addresses are kept private (Referrer-Policy)',
    explanation:
      'When a visitor clicks a link to another site, browsers can send along the full address of the page they were on, which may include private details. A Referrer-Policy limits that.',
  },
];

export const securityHeaders: Check = {
  id: 'security-headers',
  title: 'Browser protections',
  requiresVerification: false,
  timeoutMs: 8_000,
  run(ctx) {
    return Promise.resolve(
      RULES.map((rule): Finding => {
        const ok = rule.ok(ctx.headers, ctx.html);
        return {
          checkId: this.id,
          status: ok ? 'pass' : 'fail',
          severity: rule.severity,
          title: ok ? rule.okTitle : rule.missingTitle,
          explanation: rule.explanation,
          ...(ok ? {} : { evidenceRedacted: `${rule.name} header missing or switched off` }),
          fixKey: `security-headers.${rule.key}`,
        };
      }),
    );
  },
};
