import { Button } from '../components/Button';
import { FindingRow, type FindingView } from '../components/FindingRow';
import { GradeRing } from '../components/GradeRing';
import { Icon } from '../components/Icon';
import { SeverityBadge } from '../components/SeverityBadge';
import type { FreeSummary } from '../lib/api';
import { SEVERITIES, SEVERITY_LABEL, type Severity } from '../lib/severity';
import { summarySentence } from '../lib/summary';

type Counts = Record<Severity, number>;
const SHOWN = SEVERITIES.filter((s) => s !== 'info');
const BAR: Record<Severity, string> = {
  critical: 'bg-critical',
  high: 'bg-high',
  medium: 'bg-medium',
  low: 'bg-low',
  info: 'bg-low',
};

/**
 * Counts by severity: one bar split by share, and below it each severity with its icon,
 * word and number (the bar is decorative; the words carry the meaning).
 */
function SeverityBreakdown({ counts, compact = false }: { counts: Counts; compact?: boolean }) {
  const total = SHOWN.reduce((n, s) => n + counts[s], 0);
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden="true" className="flex h-2.5 gap-1 overflow-hidden rounded-full">
        {total === 0 ? (
          <span className="h-full w-full rounded-full bg-pass" />
        ) : (
          SHOWN.filter((s) => counts[s] > 0).map((s) => (
            <span
              key={s}
              className={`h-full rounded-full ${BAR[s]}`}
              style={{ width: `${String((counts[s] / total) * 100)}%` }}
            />
          ))
        )}
      </div>
      <ul
        className={`grid gap-3 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}
        aria-label="Issues by severity"
      >
        {SHOWN.map((s) => (
          <li key={s} className="flex flex-col items-start gap-2 rounded-card bg-surface/60 p-3">
            <SeverityBadge severity={s} />
            <p className="text-28 font-semibold tracking-tight">
              {counts[s]}
              <span className="sr-only"> {SEVERITY_LABEL[s].toLowerCase()} issues</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const UNLOCKS = [
  'Every issue explained in plain English',
  'A fix prompt to paste into your AI builder',
  'Deep checks of your Supabase or Firebase data',
];

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
  return (
    <section aria-labelledby="report-title" className="flex flex-col gap-6 py-8 lg:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-13 font-semibold uppercase tracking-wider text-accent">
            Your free report
          </p>
          <h1
            id="report-title"
            tabIndex={-1}
            className="break-all text-28 font-medium tracking-tight lg:text-44"
          >
            {host}
          </h1>
          <p className="text-15 text-secondary">Free passive scan · just now</p>
        </div>
        <Button variant="secondary" onClick={onScanAgain} className="shrink-0">
          Scan another app
        </Button>
      </div>

      <div className="hero-panel grid grid-cols-[minmax(0,1fr)] items-center gap-8 rounded-panel p-6 md:grid-cols-[auto_minmax(0,1fr)] lg:gap-12 lg:p-10">
        <div className="flex justify-center">
          <GradeRing grade={summary.grade} score={summary.score} partial={summary.partial} />
        </div>
        <div className="flex flex-col gap-6">
          <p className="text-22 font-medium tracking-tight lg:text-28">
            {summarySentence(summary)}
          </p>
          <SeverityBreakdown counts={summary.counts} />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {summary.topIssues.length > 0 ? (
          <div className="glass rounded-panel">
            <h2 className="px-6 pt-6 text-17 font-semibold">Top issues</h2>
            <ol className="p-2">
              {summary.topIssues.map((title, i) => (
                <li
                  key={`${String(i)}-${title}`}
                  className="flex items-start gap-4 border-b border-separator px-4 py-4 text-17 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-13 font-bold text-accent"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-words pt-0.5">{title}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="glass rounded-panel p-6 text-center text-17">
            Nothing to fix in the checks we ran. Rescan after every big change.
          </p>
        )}

        <aside
          aria-labelledby="unlock-title"
          className="flex flex-col gap-5 rounded-panel bg-contrast p-6 text-on-contrast lg:p-8"
        >
          <h2 id="unlock-title" className="text-22 font-medium tracking-tight">
            The full report
          </h2>
          <ul className="flex flex-col gap-3">
            {UNLOCKS.map((u) => (
              <li key={u} className="flex items-start gap-2 text-15">
                <Icon name="check" size={18} className="mt-0.5 shrink-0" />
                {u}
              </li>
            ))}
          </ul>
          <p className="text-15 text-on-contrast-secondary">
            It unlocks once you show you own this app.
          </p>
        </aside>
      </div>
    </section>
  );
}

/** The full report layout: a summary column beside the findings, grouped by severity. */
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
  const counts: Counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return (
    <section
      aria-label={`Report for ${host}`}
      className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-start lg:gap-6"
    >
      <div className="hero-panel flex flex-col items-center gap-4 rounded-panel p-6 text-center lg:sticky lg:top-24">
        <p className="break-all text-17 font-semibold">{host}</p>
        <GradeRing grade={grade} score={score} />
        <p className="text-17">{summarySentence({ counts, partial: false })}</p>
        <div className="w-full text-left">
          <SeverityBreakdown counts={counts} compact />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {SEVERITIES.filter((s) => counts[s] > 0).map((s) => (
          <div key={s} className="glass rounded-panel p-2">
            <h3 className="px-4 pt-3 text-13 font-semibold uppercase tracking-wider text-secondary">
              {SEVERITY_LABEL[s]}
            </h3>
            <ul>
              {findings
                .filter((f) => f.severity === s)
                .map((f, i) => (
                  <FindingRow key={`${String(i)}-${f.title}`} finding={f} />
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
