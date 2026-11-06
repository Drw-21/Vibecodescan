import { Button } from '../components/Button';
import { FindingRow, type FindingView } from '../components/FindingRow';
import { GradeRing } from '../components/GradeRing';
import { SeverityBadge } from '../components/SeverityBadge';
import type { FreeSummary } from '../lib/api';
import { SEVERITIES, SEVERITY_LABEL } from '../lib/severity';
import { summarySentence } from '../lib/summary';

/** The free result: grade, counts by severity and the titles of the top 3 issues. */
export function FreeReport({
  host,
  summary,
  onScanAgain,
}: {
  host: string;
  summary: FreeSummary;
  onScanAgain: () => void;
}) {
  const total =
    summary.counts.critical + summary.counts.high + summary.counts.medium + summary.counts.low;
  return (
    <section aria-labelledby="report-title" className="space-y-6">
      <div className="space-y-4 rounded-card bg-surface p-6 text-center shadow-card">
        <h1 id="report-title" className="m-0 break-all text-22 font-semibold">
          {host}
        </h1>
        <GradeRing grade={summary.grade} score={summary.score} partial={summary.partial} />
        <p className="m-0 text-17">{summarySentence(summary)}</p>
        {total > 0 && (
          <ul
            className="m-0 flex list-none flex-wrap justify-center gap-2 p-0"
            aria-label="Issues by severity"
          >
            {SEVERITIES.filter((s) => s !== 'info' && summary.counts[s] > 0).map((s) => (
              <li key={s}>
                <SeverityBadge severity={s} count={summary.counts[s]} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {summary.topIssues.length > 0 ? (
        <div className="rounded-card bg-surface shadow-card">
          <h2 className="m-0 px-4 pt-4 text-17 font-semibold">Top issues</h2>
          <ol className="m-0 list-none p-0">
            {summary.topIssues.map((title) => (
              <li
                key={title}
                className="border-b border-separator px-4 py-3 text-17 last:border-b-0"
              >
                {title}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="m-0 rounded-card bg-surface p-6 text-center text-17 shadow-card">
          Nothing to fix in the checks we ran. Rescan after every big change.
        </p>
      )}

      <div className="space-y-2 rounded-card border border-separator p-4 text-15 text-secondary">
        <p className="m-0">
          The full report explains every issue in plain English, with a fix prompt you can paste
          into your AI builder. It unlocks once you show you own this app.
        </p>
      </div>

      <div className="flex justify-center">
        <Button variant="secondary" onClick={onScanAgain}>
          Scan another app
        </Button>
      </div>
    </section>
  );
}

/** The full report layout: findings grouped by severity, each one expandable. */
export function FullReport({
  host,
  grade,
  score,
  findings,
}: {
  host: string;
  grade: string;
  score: number;
  findings: FindingView[];
}) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return (
    <section aria-label={`Report for ${host}`} className="space-y-4">
      <div className="flex flex-col items-center gap-3 rounded-card bg-surface p-6 text-center shadow-card">
        <p className="m-0 break-all text-17 font-semibold">{host}</p>
        <GradeRing grade={grade} score={score} />
        <p className="m-0 text-17">{summarySentence({ counts, partial: false })}</p>
      </div>
      {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
        <div key={s} className="rounded-card bg-surface shadow-card">
          <h3 className="m-0 px-4 pt-4 text-15 font-semibold text-secondary">
            {SEVERITY_LABEL[s]}
          </h3>
          <ul className="m-0 list-none p-0">
            {findings
              .filter((f) => f.severity === s)
              .map((f) => (
                <FindingRow key={f.title} finding={f} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
