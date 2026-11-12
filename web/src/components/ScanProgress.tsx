import { useEffect, useState } from 'react';
import { Icon } from './Icon';

// "Scan in progress": a live checklist ticking off (about 30 seconds).

export const STEPS = [
  'Loading your app',
  'Looking for private keys in your code',
  'Checking for files left on your website',
  'Looking for published source code',
  'Checking browser protections',
  'Checking your secure connection',
  'Checking login cookies',
  'Writing your report',
] as const;

const STEP_MS = 3500;

export function ScanProgress({ host, finished }: { host: string; finished: boolean }) {
  const [ticked, setTicked] = useState(0);
  // When the scan has really finished, every step shows as done.
  const done = finished ? STEPS.length : ticked;
  useEffect(() => {
    if (finished) return;
    const timer = setInterval(() => {
      // Never claim the last step is done until the scan really is.
      setTicked((n) => Math.min(n + 1, STEPS.length - 1));
    }, STEP_MS);
    return () => {
      clearInterval(timer);
    };
  }, [finished]);

  const percent = Math.round((done / STEPS.length) * 100);
  return (
    <section aria-labelledby="scanning-title" className="mx-auto max-w-xl space-y-6 py-8">
      <header className="space-y-2 text-center">
        <h1 id="scanning-title" tabIndex={-1} className="m-0 text-28 font-bold tracking-tight">
          Scanning your app
        </h1>
        <p className="m-0 break-all text-17 text-secondary">{host}</p>
      </header>
      <div className="space-y-4 rounded-card bg-surface p-5 shadow-card">
        <div className="h-2 overflow-hidden rounded-full bg-accent-soft" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${String(percent)}%` }}
          />
        </div>
        <ol className="m-0 list-none space-y-1 p-0" aria-live="polite">
          {STEPS.map((step, i) => {
            const state = i < done ? 'done' : i === done ? 'active' : 'waiting';
            return (
              <li key={step} className="flex min-h-11 items-center gap-3 text-17">
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    state === 'done'
                      ? 'bg-accent text-on-accent'
                      : state === 'active'
                        ? 'border-2 border-accent'
                        : 'border-2 border-separator'
                  }`}
                >
                  {state === 'done' && <Icon name="check" size={16} />}
                </span>
                <span className={state === 'waiting' ? 'text-secondary' : ''}>{step}</span>
                <span className="sr-only">
                  {state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="m-0 text-center text-15 text-secondary">This usually takes about 30 seconds.</p>
    </section>
  );
}
