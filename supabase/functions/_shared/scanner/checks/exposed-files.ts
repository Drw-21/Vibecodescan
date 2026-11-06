// exposed-files: private files that should never be reachable on a website.
// A file only counts if its content looks like the real thing — most AI-built apps answer
// every path with their own page (status 200), which must NOT be reported.
// Evidence is the path only; file contents are never stored.

import { safeEvidence } from '../redact.ts';
import type { Check, Finding } from '../types.ts';

interface Probe {
  path: string;
  label: string;
  looksReal: (body: string) => boolean;
}

const looksLikeHtml = (body: string): boolean => /^\s*</.test(body) || /<html[\s>]/i.test(body);

function looksLikeEnv(body: string): boolean {
  if (looksLikeHtml(body) || /^\s*[[{]/.test(body)) return false;
  const lines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
  if (lines.length === 0) return false;
  const assignments = lines.filter((l) => /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(l));
  return assignments.length >= 1 && assignments.length / lines.length >= 0.5;
}

const looksLikeGitConfig = (body: string): boolean =>
  !looksLikeHtml(body) && /^\s*\[core\]/m.test(body) && /repositoryformatversion/.test(body);

const looksLikeSqlDump = (body: string): boolean =>
  !looksLikeHtml(body) && /\b(?:CREATE TABLE|INSERT INTO)\b/i.test(body);

const PROBES: Probe[] = [
  ...['/.env', '/.env.local', '/.env.production', '/.env.development', '/.env.bak'].map((path) => ({
    path,
    label: 'settings file with your keys',
    looksReal: looksLikeEnv,
  })),
  { path: '/.git/config', label: 'Git repository settings', looksReal: looksLikeGitConfig },
  ...['/backup.sql', '/dump.sql', '/database.sql'].map((path) => ({
    path,
    label: 'database backup',
    looksReal: looksLikeSqlDump,
  })),
];

const PROBE_MAX_BYTES = 64 * 1024;

export const exposedFiles: Check = {
  id: 'exposed-files',
  title: 'Private files left on your website',
  requiresVerification: false,
  timeoutMs: 8_000,
  async run(ctx) {
    const results = await Promise.allSettled(
      PROBES.map(async (probe) => {
        const res = await ctx.fetch(new URL(probe.path, ctx.url.origin), {
          maxBytes: PROBE_MAX_BYTES,
        });
        // A rate-limited or failing server never really answered: we could not look.
        if (res.status === 429 || res.status >= 500)
          throw new Error(`status ${String(res.status)}`);
        return res.status === 200 && probe.looksReal(res.body);
      }),
    );

    const findings: Finding[] = [];
    results.forEach((result, i) => {
      const probe = PROBES[i];
      if (probe && result.status === 'fulfilled' && result.value) {
        findings.push({
          checkId: this.id,
          status: 'fail',
          severity: 'critical',
          title: `Anyone can download your ${probe.label} (${probe.path})`,
          explanation:
            'This file is meant to stay on your computer or server, but your website hands it to anyone who asks. It can contain passwords, API keys or your users’ data. Remove it from what you publish, then change any keys or passwords it contained.',
          evidenceRedacted: safeEvidence(probe.path),
          fixKey: `exposed-files${probe.path.replace(/[^a-z]+/g, '-')}`.replace(/-+$/, ''),
        });
      }
    });
    if (findings.length > 0) return findings;

    if (results.some((r) => r.status === 'rejected')) {
      return [
        {
          checkId: this.id,
          status: 'incomplete',
          severity: 'critical',
          title: 'We could not check for private files',
          explanation:
            'Some of our requests to your website did not get an answer, so we cannot say whether private files are exposed. Rescan to try again.',
          fixKey: 'exposed-files',
        },
      ];
    }
    return [
      {
        checkId: this.id,
        status: 'pass',
        severity: 'critical',
        title: 'No private files found on your website',
        explanation:
          'We looked for settings files, Git data and database backups that are often published by mistake, and found none.',
        fixKey: 'exposed-files',
      },
    ];
  },
};
