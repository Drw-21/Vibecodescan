import { type SyntheticEvent, useCallback, useState } from 'react';
import { Button } from '../components/Button';
import { Turnstile } from '../components/Turnstile';
import { SAMPLE } from '../lib/sample';
import { FullReport } from './Report';

const TRUST = [
  {
    title: 'Looks, never touches',
    text: 'We only read what any browser can already see. Nothing on your app is changed.',
  },
  {
    title: 'Plain English',
    text: 'Every issue explained without jargon, with what to do about it.',
  },
  {
    title: 'Fixes you can paste',
    text: 'Copy a ready-made prompt straight into Lovable, Bolt, v0 or Cursor.',
  },
];

export function Landing({
  siteKey,
  error,
  onScan,
}: {
  siteKey: string;
  error: string | null;
  onScan: (url: string, token: string) => void;
}) {
  const [url, setUrl] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const onToken = useCallback((t: string | null) => {
    setToken(t);
  }, []);

  const trimmed = url.trim();
  const ready = trimmed.length > 0 && token !== null;

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (ready) onScan(trimmed, token);
  }

  return (
    <div className="space-y-12">
      <section aria-labelledby="hero-title" className="space-y-6 pt-6 text-center">
        <h1 id="hero-title" className="m-0 text-34 font-bold leading-tight">
          Is the app you built with AI safe?
        </h1>
        <p className="m-0 text-17 text-secondary">
          Paste your app’s address. In about 30 seconds you get a grade and a plain-English list of
          what to fix.
        </p>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-card bg-surface p-4 text-left shadow-card"
          noValidate
        >
          <label htmlFor="url" className="block text-15 font-semibold">
            Your app’s address
          </label>
          <input
            id="url"
            name="url"
            type="url"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="myapp.lovable.app"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
            aria-invalid={touched && trimmed.length === 0}
            aria-describedby={error ? 'scan-error' : undefined}
            className="block min-h-11 w-full rounded-button border border-separator bg-bg px-3 text-17 text-ink placeholder:text-secondary"
          />
          {siteKey !== '' && <Turnstile siteKey={siteKey} onToken={onToken} />}
          {touched && trimmed.length === 0 && (
            <p className="m-0 text-15 text-critical">Please enter your app’s address.</p>
          )}
          {touched && trimmed.length > 0 && token === null && (
            <p className="m-0 text-15 text-secondary">
              Please complete the “I am human” check above.
            </p>
          )}
          {error && (
            <p id="scan-error" role="alert" className="m-0 text-15 text-critical">
              {error}
            </p>
          )}
          <Button type="submit" className="w-full">
            Scan my app
          </Button>
        </form>
      </section>

      <section aria-label="Why founders trust us">
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
          {TRUST.map((t) => (
            <li key={t.title} className="rounded-card bg-surface p-4 shadow-card">
              <h2 className="m-0 text-17 font-semibold">{t.title}</h2>
              <p className="m-0 mt-1 text-15 text-secondary">{t.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="sample-title" className="space-y-4">
        <h2 id="sample-title" className="m-0 text-22 font-semibold">
          What a full report looks like
        </h2>
        <p className="m-0 text-15 text-secondary">
          An example. Tap an issue to see why it matters and how to fix it.
        </p>
        <FullReport
          host={SAMPLE.host}
          grade={SAMPLE.grade}
          score={SAMPLE.score}
          findings={SAMPLE.findings}
        />
      </section>
    </div>
  );
}
