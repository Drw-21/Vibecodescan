// Integration: scan every simulated reference app with the real engine and compare with
// the expectations written down before the checks existed (expected-results.json).
// Deep checks (supabase-public-tables, firebase-open-rules) arrive in milestone 6; until
// then, only passive results are compared, and scores only for apps with no deep flaws.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS } from '../../supabase/functions/_shared/scanner/checks/index.ts';
import { score } from '../../supabase/functions/_shared/scanner/score.ts';
import type { Severity } from '../../supabase/functions/_shared/scanner/types.ts';
import { REFERENCE_SITES } from '../../fixtures/reference-apps/sites.ts';
import { scanSite } from './checks/scanSite.ts';

interface ExpectedApp {
  id: string;
  platform: string;
  verified: boolean;
  fails: { checkId: string; severity: Severity }[];
  expectedScore: number;
  expectedGrade: string;
}

const suite = JSON.parse(
  await readFile(
    join(import.meta.dirname, '..', '..', 'fixtures', 'reference-apps', 'expected-results.json'),
    'utf8',
  ),
) as { deepChecks: string[]; apps: ExpectedApp[] };

const implemented = new Set(ALL_CHECKS.map((c) => c.id));
const key = (f: { checkId: string; severity: string }): string => `${f.checkId}:${f.severity}`;

describe('reference suite (simulated apps)', () => {
  it('has a simulated site for every reference app', () => {
    expect(Object.keys(REFERENCE_SITES).sort()).toEqual(suite.apps.map((a) => a.id).sort());
  });

  for (const app of suite.apps) {
    it(`${app.id} gives exactly the expected passive results`, async () => {
      const site = REFERENCE_SITES[app.id];
      if (!site) throw new Error(`no simulated site for ${app.id}`);
      const { findings, ctx } = await scanSite(site, { verified: app.verified });

      expect(ctx.platform).toBe(app.platform);
      const expectedFails = app.fails
        .filter((f) => implemented.has(f.checkId))
        .map(key)
        .sort();
      const actualFails = findings
        .filter((f) => f.status === 'fail')
        .map(key)
        .sort();
      expect(actualFails).toEqual(expectedFails);
      expect(findings.filter((f) => f.status === 'incomplete').map((f) => f.checkId)).toEqual([]);

      if (app.fails.every((f) => implemented.has(f.checkId))) {
        const result = score(findings);
        expect({ score: result.score, grade: result.grade }).toEqual({
          score: app.expectedScore,
          grade: app.expectedGrade,
        });
      }
    });
  }

  it('done when: the insecure test app fails and the fixed one passes', async () => {
    const insecure = REFERENCE_SITES['ref-insecure-lovable'];
    const fixed = REFERENCE_SITES['ref-clean'];
    if (!insecure || !fixed) throw new Error('reference sites missing');
    const bad = score((await scanSite(insecure, { verified: true })).findings);
    const good = score((await scanSite(fixed, { verified: true })).findings);
    expect(bad.counts.critical).toBeGreaterThan(0);
    expect(['D', 'F']).toContain(bad.grade);
    expect(good).toMatchObject({ score: 100, grade: 'A', partial: false });
  });
});
