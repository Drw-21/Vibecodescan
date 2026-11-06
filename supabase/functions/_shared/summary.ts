// What the Free plan shows (spec: "Payments and plans"): grade, issue count by severity
// and the titles of the top 3 issues. Nothing else from an anonymous scan leaves the server.

import type { ScoreResult } from './scanner/score.ts';
import type { Finding, Severity } from './scanner/types.ts';

const ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export interface FreeSummary {
  scanId: string;
  status: 'done';
  grade: string;
  score: number;
  partial: boolean;
  counts: Record<Severity, number>;
  topIssues: string[];
}

export function freeSummary(scanId: string, findings: Finding[], result: ScoreResult): FreeSummary {
  const fails = findings
    .filter((f) => f.status === 'fail')
    .sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  return {
    scanId,
    status: 'done',
    grade: result.grade,
    score: result.score,
    partial: result.partial,
    counts: result.counts,
    topIssues: fails.slice(0, 3).map((f) => f.title),
  };
}

/** Plain-English reason a scan failed, for the browser. */
export function failureMessage(errorCode: string): string {
  if (errorCode === 'fetch_blocked_address' || errorCode === 'fetch_dns_failed') {
    return 'We could not find a public website at that address. Check the spelling and try again.';
  }
  if (errorCode === 'fetch_timeout' || errorCode === 'scan_timeout') {
    return 'Your app took too long to answer. Try again in a few minutes.';
  }
  if (errorCode.startsWith('fetch_')) {
    return 'We could not load your app. Check that it is online and try again.';
  }
  return 'Something went wrong on our side. Please try again.';
}
