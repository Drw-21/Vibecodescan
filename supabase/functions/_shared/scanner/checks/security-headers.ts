// security-headers: five browser protections a site switches on with response headers.
// One finding per protection, so the report can say exactly which ones are missing.

import type { Check, Finding, Severity } from '../types.ts';

interface HeaderRule {
  key: string;
  name: string;
  severity: Severity;
  ok: (h: Headers) => boolean;
  missingTitle: string;
  okTitle: string;
  explanation: string;
}

const csp = (h: Headers): string => h.get('content-security-policy') ?? '';

const RULES: HeaderRule[] = [
  {
    key: 'csp',
    name: 'Content-Security-Policy',
    severity: 'medium',
    ok: (h) => csp(h).trim() !== '',
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
    ok: (h) =>
      /^(deny|sameorigin)$/i.test((h.get('x-frame-options') ?? '').trim()) ||
      /frame-ancestors/i.test(csp(h)),
    missingTitle: 'Other sites can show your app inside theirs (clickjacking)',
    okTitle: 'Other sites cannot show your app inside theirs',
    explanation:
      'Without this protection, another website can load your app invisibly inside its own page and trick your users into clicking buttons they cannot see.',
  },
  {
    key: 'nosniff',
    name: 'X-Content-Type-Options',
    severity: 'low',
    ok: (h) => (h.get('x-content-type-options') ?? '').trim().toLowerCase() === 'nosniff',
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
        const ok = rule.ok(ctx.headers);
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
