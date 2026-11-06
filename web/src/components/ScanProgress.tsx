import { useEffect, useState } from 'react';

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

  return (
    <section aria-labelledby="scanning-title" className="space-y-6">
      <header className="space-y-2 text-center">
        <h1 id="scanning-title" tabIndex={-1} className="m-0 text-28 font-bold">
          Scanning your app
        </h1>
        <p className="m-0 break-all text-17 text-secondary">{host}</p>
      </header>
      <ol
        className="m-0 list-none space-y-1 rounded-card bg-surface p-2 shadow-card"
        aria-live="polite"
      >
        {STEPS.map((step, i) => {
          const state = i < done ? 'done' : i === done ? 'active' : 'waiting';
          return (
            <li key={step} className="flex min-h-11 items-center gap-3 px-3 py-2 text-17">
              <span
                aria-hidden="true"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-13 ${
                  state === 'done'
                    ? 'bg-pass text-surface'
                    : state === 'active'
                      ? 'border-2 border-accent'
                      : 'border-2 border-separator'
                }`}
              >
                {state === 'done' ? '✓' : ''}
              </span>
              <span className={state === 'waiting' ? 'text-secondary' : ''}>{step}</span>
              <span className="sr-only">
                {state === 'done' ? ' (done)' : state === 'active' ? ' (in progress)' : ''}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="m-0 text-center text-15 text-secondary">This usually takes about 30 seconds.</p>
    </section>
  );
}
