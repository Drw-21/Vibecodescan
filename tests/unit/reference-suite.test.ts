// Keeps the written reference-suite expectations internally consistent: known checks only,
// no deep check expected on an unverified site, and every expected grade is what the real
// scoring code produces.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { score } from '../../supabase/functions/_shared/scanner/score.ts';
import type { Severity } from '../../supabase/functions/_shared/scanner/types.ts';

interface ExpectedApp {
  id: string;
  verified: boolean;
  fails: { checkId: string; severity: Severity }[];
  notRun: string[];
  expectedScore: number;
  expectedGrade: string;
}

interface Suite {
  checks: string[];
  deepChecks: string[];
  apps: ExpectedApp[];
}

const suite = JSON.parse(
  await readFile(
    join(import.meta.dirname, '..', '..', 'fixtures', 'reference-apps', 'expected-results.json'),
    'utf8',
  ),
) as Suite;

describe('reference suite expected results', () => {
  it('has a fully clean app that scores an A', () => {
    const clean = suite.apps.find((a) => a.id === 'ref-clean');
    expect(clean).toMatchObject({ fails: [], expectedGrade: 'A' });
  });

  it('has unique app ids', () => {
    const ids = suite.apps.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const app of suite.apps) {
    describe(app.id, () => {
      it('refers only to known v1 checks', () => {
        for (const id of [...app.fails.map((f) => f.checkId), ...app.notRun]) {
          expect(suite.checks).toContain(id);
        }
      });

      it('never expects a deep check to run on an unverified site', () => {
        if (app.verified) return;
        for (const deep of suite.deepChecks) {
          expect(app.notRun).toContain(deep);
          expect(app.fails.map((f) => f.checkId)).not.toContain(deep);
        }
      });

      it('has the score and grade the scoring code produces', () => {
        const result = score(
          app.fails.map((f) => ({
            checkId: f.checkId,
            status: 'fail' as const,
            severity: f.severity,
            title: 't',
            explanation: 'e',
            fixKey: f.checkId,
          })),
        );
        expect(app.expectedScore).toBe(result.score);
        expect(app.expectedGrade).toBe(result.grade);
      });
    });
  }
});
