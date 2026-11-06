// secret-in-bundle: private keys shipped in the JavaScript (or inline scripts) that every
// visitor downloads. Public-by-design keys (Supabase anon/publishable, Stripe pk_, Firebase
// apiKey) are never flagged. Only keys inside quotes count, which rules out class names
// and comments. Evidence is redacted; the full key never leaves this file.

import { JWT_IN_QUOTES, jwtPayload } from '../jwt.ts';
import { redactSecret, safeEvidence, safePath } from '../redact.ts';
import type { Check, Finding, Severity } from '../types.ts';

interface Rule {
  label: string;
  severity: Severity;
  pattern: RegExp;
  /** Capture group holding the secret (default: whole match). */
  group?: number;
  accept?: (secret: string) => boolean;
}

const hasMixedChars = (s: string): boolean => /[0-9]/.test(s) && /[A-Z]/.test(s) && /[a-z]/.test(s);

const RULES: Rule[] = [
  {
    label: 'Anthropic API key',
    severity: 'critical',
    pattern: /(?<=["'`])sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{80,}/g,
  },
  {
    label: 'OpenAI API key',
    severity: 'critical',
    pattern: /(?<=["'`])sk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}(?=["'`])/g,
    accept: hasMixedChars,
  },
  {
    label: 'Stripe secret key',
    severity: 'critical',
    pattern: /(?<=["'`])[sr]k_live_[A-Za-z0-9]{20,}/g,
  },
  {
    label: 'Stripe test-mode secret key',
    severity: 'high',
    pattern: /(?<=["'`])[sr]k_test_[A-Za-z0-9]{20,}/g,
  },
  {
    label: 'Supabase service_role key',
    severity: 'critical',
    pattern: JWT_IN_QUOTES,
    accept: (token) => jwtPayload(token)?.['role'] === 'service_role',
  },
  {
    label: 'Supabase secret key',
    severity: 'critical',
    pattern: /(?<=["'`])sb_secret_[A-Za-z0-9_-]{20,}/g,
  },
  {
    label: 'AWS secret access key',
    severity: 'critical',
    pattern:
      /(?:secretAccessKey|secret_access_key|aws_secret_access_key|AWS_SECRET_ACCESS_KEY)["']?\s*[:=]\s*["'`]([A-Za-z0-9/+]{40})["'`]/g,
    group: 1,
  },
  {
    label: 'AWS access key ID',
    severity: 'high',
    pattern: /(?<=["'`])(?:AKIA|ASIA)[A-Z0-9]{16}(?=["'`])/g,
  },
  {
    label: 'Resend API key',
    severity: 'critical',
    pattern: /(?<=["'`])re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g,
  },
  {
    label: 'GitHub token',
    severity: 'critical',
    pattern: /(?<=["'`])(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/g,
  },
];

/** At most this many keys are reported per scan. */
const MAX_FINDINGS = 10;

export const secretInBundle: Check = {
  id: 'secret-in-bundle',
  title: 'Private keys in your app’s code',
  requiresVerification: false,
  timeoutMs: 8_000,
  run(ctx) {
    const sources = [{ url: ctx.url.href, body: ctx.html }, ...ctx.bundles];
    const seen = new Set<string>();
    const findings: Finding[] = [];

    for (const source of sources) {
      for (const rule of RULES) {
        for (const match of source.body.matchAll(rule.pattern)) {
          const secret = match[rule.group ?? 0];
          if (secret === undefined || seen.has(secret)) continue;
          if (rule.accept && !rule.accept(secret)) continue;
          seen.add(secret);
          if (findings.length < MAX_FINDINGS) findings.push(leak(rule, secret, source.url));
        }
      }
    }

    // An AWS key ID is only dangerous with its secret; when both are exposed, both are critical.
    if (findings.some((f) => f.fixKey === 'secret-in-bundle.aws-secret-access-key')) {
      for (const f of findings) {
        if (f.fixKey === 'secret-in-bundle.aws-access-key-id') f.severity = 'critical';
      }
    }

    if (findings.length > 0) return Promise.resolve(findings);
    if (!ctx.bundlesComplete) {
      return Promise.resolve([
        {
          checkId: this.id,
          status: 'incomplete',
          severity: 'critical',
          title: 'We could not read all of your app’s code',
          explanation:
            'Some of your app’s JavaScript files could not be loaded, so we cannot promise there are no private keys in them. Rescan to try again.',
          fixKey: 'secret-in-bundle',
        },
      ]);
    }
    return Promise.resolve([
      {
        checkId: this.id,
        status: 'pass',
        severity: 'critical',
        title: 'No private keys found in your app’s code',
        explanation:
          'We read the JavaScript your app sends to every visitor and found no private API keys. Public keys that are meant to be there (like a Supabase anon key) are fine.',
        fixKey: 'secret-in-bundle',
      },
    ]);
  },
};

function leak(rule: Rule, secret: string, sourceUrl: string): Finding {
  return {
    checkId: 'secret-in-bundle',
    status: 'fail',
    severity: rule.severity,
    title: `Your ${rule.label} is visible to anyone`,
    explanation: `Your app sends this private key to every visitor's browser, where anyone can copy it and use it as you, at your cost. Treat it as stolen: create a new key, delete this one, and move the call that needs it to a server-side function.`,
    evidenceRedacted: safeEvidence(`${redactSecret(secret)} in ${safePath(sourceUrl)}`),
    fixKey: `secret-in-bundle.${rule.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  };
}
