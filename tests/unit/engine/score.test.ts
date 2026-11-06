import { describe, expect, it } from 'vitest';
import { score } from '../../../supabase/functions/_shared/scanner/score.ts';
import type { Finding, Severity } from '../../../supabase/functions/_shared/scanner/types.ts';

function f(severity: Severity, status: Finding['status'] = 'fail'): Finding {
  return { checkId: 'x', status, severity, title: 't', explanation: 'e', fixKey: 'x' };
}

describe('score', () => {
  it('gives 100 / A with no failures', () => {
    expect(score([f('critical', 'pass'), f('high', 'pass')])).toMatchObject({
      score: 100,
      grade: 'A',
      partial: false,
    });
  });

  it.each([
    [[] as Severity[], 100, 'A'],
    [['low', 'low', 'low'], 91, 'A'],
    [['medium', 'low'], 89, 'B'],
    [['high', 'low', 'low'], 74, 'C'],
    [['high', 'high'], 60, 'C'],
    [['high', 'high', 'low'], 57, 'D'],
    [['high', 'high', 'high'], 40, 'D'],
    [['high', 'high', 'high', 'low'], 37, 'F'],
    [['critical'], 60, 'D'], // one critical caps at D
    [['critical', 'low'], 57, 'D'],
    [['critical', 'high', 'high'], 20, 'F'],
    [['critical', 'critical'], 20, 'F'], // two criticals = F
    [['critical', 'critical', 'critical'], 0, 'F'], // never below 0
  ])('fails %j -> %i / %s', (severities, expectedScore, expectedGrade) => {
    expect(score((severities as Severity[]).map((s) => f(s)))).toMatchObject({
      score: expectedScore,
      grade: expectedGrade,
    });
  });

  it('does not score incomplete checks, but marks the grade as partial', () => {
    const result = score([f('critical', 'incomplete'), f('low')]);
    expect(result).toMatchObject({ score: 97, grade: 'A', partial: true });
  });

  it('counts failed findings by severity', () => {
    expect(score([f('critical'), f('low'), f('low'), f('medium', 'pass')]).counts).toEqual({
      critical: 1,
      high: 0,
      medium: 0,
      low: 2,
      info: 0,
    });
  });
});
