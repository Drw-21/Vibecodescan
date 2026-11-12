import { Button } from '../components/Button';
import { FindingRow, type FindingView } from '../components/FindingRow';
import { GradeRing } from '../components/GradeRing';
import { IconChip } from '../components/Icon';
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
  const shown = SEVERITIES.filter((s) => s !== 'info');
  return (
    <section aria-labelledby="report-title" className="mx-auto max-w-5xl space-y-6 py-8">
      <div className="space-y-1">
        <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
          Your free report
        </p>
        <h1
          id="report-title"
          tabIndex={-1}
          className="m-0 break-all text-28 font-bold tracking-tight"
        >
          {host}
        </h1>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="glass flex flex-col items-center gap-4 rounded-card p-6 text-center">
          <GradeRing grade={summary.grade} score={summary.score} partial={summary.partial} />
          <p className="m-0 text-17">{summarySentence(summary)}</p>
        </div>

        <div className="space-y-6">
          <ul
            className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4"
            aria-label="Issues by severity"
          >
            {shown.map((s) => (
              <li key={s} className="space-y-2 rounded-card glass p-4">
                <SeverityBadge severity={s} />
                <p className="m-0 text-28 font-bold tracking-tight">
                  {summary.counts[s]}
                  <span className="sr-only"> {SEVERITY_LABEL[s].toLowerCase()} issues</span>
                </p>
              </li>
            ))}
          </ul>

          {summary.topIssues.length > 0 ? (
            <div className="rounded-card glass">
              <h2 className="m-0 px-5 pt-5 text-17 font-semibold">Top issues</h2>
              <ol className="m-0 list-none p-0">
                {summary.topIssues.map((title, i) => (
                  <li
                    key={`${String(i)}-${title}`}
                    className="flex items-start gap-3 border-b border-separator px-5 py-4 text-17 last:border-b-0"
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-13 font-bold text-accent"
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 break-words">{title}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="glass m-0 rounded-card p-6 text-center text-17">
              Nothing to fix in the checks we ran. Rescan after every big change.
            </p>
          )}
        </div>
      </div>

      <div className="glass flex flex-col gap-4 rounded-card p-5 sm:flex-row sm:items-center">
        <IconChip name="clipboard" />
        <p className="m-0 flex-1 text-15">
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
      <div className="glass flex flex-col items-center gap-3 rounded-card p-6 text-center">
        <p className="m-0 break-all text-17 font-semibold">{host}</p>
        <GradeRing grade={grade} score={score} />
        <p className="m-0 text-17">{summarySentence({ counts, partial: false })}</p>
      </div>
      {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
        <div key={s} className="rounded-card glass">
          <h3 className="m-0 px-4 pt-4 text-15 font-semibold text-secondary">
            {SEVERITY_LABEL[s]}
          </h3>
          <ul className="m-0 list-none p-0">
            {findings
              .filter((f) => f.severity === s)
              .map((f, i) => (
                <FindingRow key={`${String(i)}-${f.title}`} finding={f} />
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
