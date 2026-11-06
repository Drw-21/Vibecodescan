// Severity weights -> score and grade (spec: "Scoring and fix prompts").
//   - start at 100, lose points per FAILED finding; never below 0
//   - one critical caps the grade at D; two or more criticals = F
//   - incomplete checks are not scored, but make the grade "partial"

import { GRADE_THRESHOLDS, SCORE_WEIGHTS } from '../config.ts';
import type { Finding, Severity } from './types.ts';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreResult {
  score: number;
  grade: Grade;
  /** True when at least one check could not complete. */
  partial: boolean;
  /** Failed findings per severity. */
  counts: Record<Severity, number>;
}

export function score(
  findings: readonly Finding[],
  weights: Readonly<Record<Severity, number>> = SCORE_WEIGHTS,
): ScoreResult {
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let lost = 0;
  for (const finding of findings) {
    if (finding.status !== 'fail') continue;
    counts[finding.severity] += 1;
    lost += weights[finding.severity];
  }
  const value = Math.max(0, 100 - lost);
  return {
    score: value,
    grade: grade(value, counts.critical),
    partial: findings.some((f) => f.status === 'incomplete'),
    counts,
  };
}

function grade(value: number, criticals: number): Grade {
  if (criticals >= 2) return 'F';
  const byScore: Grade = GRADE_THRESHOLDS.find((t) => value >= t.min)?.grade ?? 'F';
  if (criticals === 1 && (byScore === 'A' || byScore === 'B' || byScore === 'C')) return 'D';
  return byScore;
}
