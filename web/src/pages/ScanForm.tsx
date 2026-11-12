import { type SyntheticEvent, useCallback, useState } from 'react';
import { Button } from '../components/Button';
import { Icon, type IconName } from '../components/Icon';
import { Turnstile } from '../components/Turnstile';

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'search', title: 'Paste your address', text: 'The address people use to open your app.' },
  {
    icon: 'shield',
    title: 'We read what browsers see',
    text: 'Read-only: we never log in, submit forms or change anything.',
  },
  {
    icon: 'clipboard',
    title: 'Get your grade',
    text: 'A grade from A to F and your top issues, in about 30 seconds.',
  },
];

/** The scan page: where a founder starts a free scan. */
export function ScanForm({
  siteKey,
  error,
  initialUrl,
  onScan,
}: {
  siteKey: string;
  error: string | null;
  /** What the founder typed last time, so it is still there after an error. */
  initialUrl: string;
  onScan: (url: string, token: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [token, setToken] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [checkFailed, setCheckFailed] = useState(siteKey === '');
  const onToken = useCallback((t: string | null) => {
    setToken(t);
    // Turnstile can recover by itself after an error: drop the warning once it does.
    if (t !== null) setCheckFailed(false);
  }, []);
  const onCheckError = useCallback(() => {
    setCheckFailed(true);
  }, []);

  const trimmed = url.trim();
  const ready = trimmed.length > 0 && token !== null;

  function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setTouched(true);
    if (ready) onScan(trimmed, token);
  }

  return (
    <section
      aria-labelledby="scan-title"
      className="grid grid-cols-[minmax(0,1fr)] gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-16 lg:py-20"
    >
      <div className="flex flex-col gap-5">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-13 font-semibold text-accent">
          <Icon name="shield" size={16} />
          Free scan
        </p>
        <h1
          id="scan-title"
          tabIndex={-1}
          className="text-34 font-medium leading-[1.08] tracking-tight lg:text-52"
        >
          Scan your app
        </h1>
        <p className="max-w-md text-17 text-secondary">
          Free, read-only and in plain English. Nothing on your app is changed.
        </p>
        <ol className="mt-2 hidden flex-col gap-5 lg:flex">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-contrast text-15 font-semibold text-on-contrast">
                {i + 1}
              </span>
              <div>
                <p className="text-17 font-semibold">{s.title}</p>
                <p className="text-15 text-secondary">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <form
        onSubmit={submit}
        className="glass flex flex-col gap-4 rounded-panel p-5 text-left sm:p-8"
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
          className="block min-h-12 w-full rounded-xl border border-field bg-surface px-4 text-17 text-ink placeholder:text-secondary"
        />
        {siteKey !== '' && <Turnstile siteKey={siteKey} onToken={onToken} onError={onCheckError} />}
        {checkFailed && (
          <p role="alert" className="text-15 text-critical">
            The “I am human” check could not load. Please reload the page, or try another browser.
          </p>
        )}
        {touched && trimmed.length === 0 && (
          <p className="text-15 text-critical">Please enter your app’s address.</p>
        )}
        {touched && trimmed.length > 0 && token === null && !checkFailed && (
          <p className="text-15 text-secondary">Please complete the “I am human” check above.</p>
        )}
        {error && (
          <p id="scan-error" role="alert" className="text-15 text-critical">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full">
          Scan my app
        </Button>
        <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-13 text-secondary">
          {['Free', 'No sign-up', 'Read-only'].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Icon name="check" size={16} className="text-accent" />
              {t}
            </li>
          ))}
        </ul>
      </form>
    </section>
  );
}
