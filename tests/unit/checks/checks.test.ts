// Every check against its pass, fail and incomplete fixtures (fixtures/checks/<id>.ts).
// False positives are bugs (spec: "Quality"), so the pass fixtures include traps.

import { describe, expect, it } from 'vitest';
import { CHECK_MODES } from '../../../supabase/functions/_shared/config.ts';
import { ALL_CHECKS } from '../../../supabase/functions/_shared/scanner/checks/index.ts';
import { cases as cookieFlags } from '../../../fixtures/checks/cookie-flags.ts';
import { cases as exposedFiles } from '../../../fixtures/checks/exposed-files.ts';
import { cases as firebaseOpenRules } from '../../../fixtures/checks/firebase-open-rules.ts';
import { cases as https } from '../../../fixtures/checks/https.ts';
import { cases as platformDetect } from '../../../fixtures/checks/platform-detect.ts';
import { cases as secretInBundle } from '../../../fixtures/checks/secret-in-bundle.ts';
import { cases as securityHeaders } from '../../../fixtures/checks/security-headers.ts';
import { cases as sourceMaps } from '../../../fixtures/checks/source-maps.ts';
import { cases as supabasePublicTables } from '../../../fixtures/checks/supabase-public-tables.ts';
import type { CheckCase } from '../../../fixtures/checks/types.ts';
import { scanSite } from './scanSite.ts';

const suites: Record<string, CheckCase[]> = {
  'secret-in-bundle': secretInBundle,
  'exposed-files': exposedFiles,
  'source-maps': sourceMaps,
  'security-headers': securityHeaders,
  https,
  'cookie-flags': cookieFlags,
  'platform-detect': platformDetect,
  'supabase-public-tables': supabasePublicTables,
  'firebase-open-rules': firebaseOpenRules,
};

const DEEP = new Set(['supabase-public-tables', 'firebase-open-rules']);

describe('check registry', () => {
  it('has fixtures for every check, with at least one pass case and one fail case', () => {
    for (const check of ALL_CHECKS) {
      const cases = suites[check.id];
      expect(cases, check.id).toBeDefined();
      expect(
        cases?.some((c) => c.expect === 'pass'),
        check.id,
      ).toBe(true);
      if (check.id !== 'platform-detect') {
        expect(
          cases?.some((c) => c.expect === 'fail'),
          check.id,
        ).toBe(true);
      }
    }
  });

  it('switches every v1 check on in config', () => {
    for (const check of ALL_CHECKS) expect(CHECK_MODES[check.id], check.id).toBe('live');
  });

  it('has all 9 v1 checks, and only the deep ones require verification', () => {
    expect(ALL_CHECKS).toHaveLength(9);
    for (const check of ALL_CHECKS) {
      expect(check.requiresVerification, check.id).toBe(DEEP.has(check.id));
    }
  });

  it('never runs a deep check on an unverified site, even when it would fail', async () => {
    const open = supabasePublicTables.find((c) => c.expect === 'fail');
    if (!open) throw new Error('missing fixture');
    const { findings, requested } = await scanSite(open.site, { verified: false });
    expect(findings.filter((f) => DEEP.has(f.checkId))).toEqual([]);
    expect(requested.some((u) => u.includes('supabase.co'))).toBe(false);
  });
});

for (const [checkId, cases] of Object.entries(suites)) {
  describe(checkId, () => {
    for (const c of cases) {
      it(`${c.expect}: ${c.name}`, async () => {
        const { findings: all } = await scanSite(c.site, {
          checkIds: [checkId],
          verified: DEEP.has(checkId),
        });
        const findings = all.filter((f) => f.checkId === checkId);
        expect(findings.length).toBeGreaterThan(0);
        const fails = findings.filter((f) => f.status === 'fail');

        if (c.expect === 'pass') {
          expect(findings.map((f) => `${f.status}: ${f.title}`)).toEqual(
            findings.map((f) => `pass: ${f.title}`),
          );
        } else if (c.expect === 'incomplete') {
          expect(fails).toEqual([]);
          expect(findings.some((f) => f.status === 'incomplete')).toBe(true);
        } else {
          expect(fails.map((f) => f.severity).sort()).toEqual([...(c.failSeverities ?? [])].sort());
          const evidence = fails.map((f) => f.evidenceRedacted ?? '').join(' | ');
          for (const text of c.evidence ?? []) expect(evidence).toContain(text);
        }

        const serialised = JSON.stringify(findings);
        for (const secret of c.mustNotLeak ?? []) expect(serialised).not.toContain(secret);

        // Every finding must fit the database (findings table constraints).
        for (const f of findings) {
          expect(f.title.length).toBeLessThanOrEqual(200);
          expect(f.explanation.length).toBeLessThanOrEqual(4000);
          expect(f.explanation.length).toBeGreaterThan(20);
          if (f.evidenceRedacted !== undefined) {
            expect(f.evidenceRedacted.length).toBeLessThanOrEqual(200);
            expect(f.evidenceRedacted).not.toMatch(/[A-Za-z0-9+/=]{24,}/);
          }
        }
      });
    }
  });
}
