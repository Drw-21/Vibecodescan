// Keeps the written reference-suite expectations internally consistent with the
// spec's scoring rules, so a typo in an expected grade is caught now rather than
// when score.ts (milestone 2) is tested against this same file.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

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

// Spec: "Scoring and fix prompts". Mirrors the values that will live in config.ts.
const POINTS: Record<Severity, number> = { critical: 40, high: 20, medium: 8, low: 3, info: 0 };

function grade(score: number, criticals: number): string {
  if (criticals >= 2) return 'F';
  let g = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  if (criticals === 1 && 'ABC'.includes(g)) g = 'D';
  return g;
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

      it('has the score and grade the spec rules produce', () => {
        const lost = app.fails.reduce((sum, f) => sum + POINTS[f.severity], 0);
        const score = Math.max(0, 100 - lost);
        const criticals = app.fails.filter((f) => f.severity === 'critical').length;
        expect(app.expectedScore).toBe(score);
        expect(app.expectedGrade).toBe(grade(score, criticals));
      });
    });
  }
});
