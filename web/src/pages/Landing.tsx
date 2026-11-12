import { type SyntheticEvent, useCallback, useState } from 'react';
import { Button } from '../components/Button';
import { GradeRing } from '../components/GradeRing';
import { Icon, IconChip, type IconName } from '../components/Icon';
import { SeverityBadge } from '../components/SeverityBadge';
import { Turnstile } from '../components/Turnstile';
import { SAMPLE } from '../lib/sample';
import { FullReport } from './Report';

const TRUST: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'eye',
    title: 'Looks, never touches',
    text: 'We only read what any browser can already see. Nothing on your app is changed.',
  },
  {
    icon: 'text',
    title: 'Plain English',
    text: 'Every issue explained without jargon, with what to do about it.',
  },
  {
    icon: 'clipboard',
    title: 'Fixes you can paste',
    text: 'Copy a ready-made prompt straight into Lovable, Bolt, v0 or Cursor.',
  },
];

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Paste your app’s address',
    text: 'The address you share with your users, for example myapp.lovable.app.',
  },
  {
    title: 'We look like an attacker would',
    text: 'Read-only checks on what your app sends to every visitor. About 30 seconds.',
  },
  {
    title: 'Fix it with your AI builder',
    text: 'Each issue comes with plain words and a prompt to paste into your builder.',
  },
];

const CHECKS: { icon: IconName; title: string; text: string; deep?: boolean }[] = [
  {
    icon: 'key',
    title: 'Private keys in your code',
    text: 'OpenAI, Stripe, Supabase admin and other secret keys sent to every visitor.',
  },
  {
    icon: 'file',
    title: 'Files left on your site',
    text: 'Settings files, Git data and database backups anyone can download.',
  },
  {
    icon: 'code',
    title: 'Published source code',
    text: 'Source maps that hand out the code your AI builder wrote.',
  },
  {
    icon: 'shield',
    title: 'Browser protections',
    text: 'The five security headers that stop injected scripts and clickjacking.',
  },
  {
    icon: 'lock',
    title: 'Secure connection',
    text: 'HTTPS everywhere, and http:// sending visitors to the safe version.',
  },
  {
    icon: 'cookie',
    title: 'Login cookies',
    text: 'Session cookies missing the settings that stop account takeover.',
  },
  {
    icon: 'layers',
    title: 'What it’s built with',
    text: 'Your builder and backend, so every fix fits your tools.',
  },
  {
    icon: 'database',
    title: 'Open database tables',
    text: 'Supabase tables anyone can read while logged out.',
    deep: true,
  },
  {
    icon: 'flame',
    title: 'Open Firebase data',
    text: 'Firebase data readable without signing in.',
    deep: true,
  },
];

const BUILDERS = ['Lovable', 'Bolt', 'Replit', 'v0', 'Cursor'];

/** A small, static picture of a report beside the form. Decorative: the real sample is below. */
function HeroPreview() {
  return (
    <div aria-hidden="true" className="glass rounded-[28px] p-4 sm:p-8">
      <div className="space-y-5 rounded-card glass p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-13 text-secondary">Report</p>
            <p className="m-0 truncate text-17 font-semibold">{SAMPLE.host}</p>
          </div>
          <GradeRing grade={SAMPLE.grade} score={SAMPLE.score} size={96} />
        </div>
        <ul className="m-0 list-none space-y-2 p-0">
          {SAMPLE.findings.map((f) => (
            <li
              key={f.title}
              className="flex items-center gap-3 rounded-xl border border-separator p-3"
            >
              <SeverityBadge severity={f.severity} />
              <span className="min-w-0 truncate text-15">{f.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Landing({
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
    <div className="space-y-24 pb-8">
      <section
        id="scan"
        aria-labelledby="hero-title"
        className="grid scroll-mt-24 grid-cols-[minmax(0,1fr)] items-center gap-10 pt-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:pt-16"
      >
        <div className="space-y-6">
          <p className="m-0 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-13 font-semibold text-accent">
            <Icon name="shield" size={16} />
            Free security check for AI-built apps
          </p>
          <h1
            id="hero-title"
            tabIndex={-1}
            className="m-0 text-34 font-bold leading-[1.1] tracking-tight lg:text-52"
          >
            Is the app you built with AI safe?
          </h1>
          <p className="m-0 max-w-xl text-17 text-secondary">
            Paste your app’s address. In about 30 seconds you get a grade and a plain-English list
            of what to fix.
          </p>
          <form onSubmit={submit} className="glass space-y-4 rounded-card p-4 text-left" noValidate>
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
              className="block min-h-11 w-full rounded-button border border-field bg-surface px-3 text-17 text-ink placeholder:text-secondary"
            />
            {siteKey !== '' && (
              <Turnstile siteKey={siteKey} onToken={onToken} onError={onCheckError} />
            )}
            {checkFailed && (
              <p role="alert" className="m-0 text-15 text-critical">
                The “I am human” check could not load. Please reload the page, or try another
                browser.
              </p>
            )}
            {touched && trimmed.length === 0 && (
              <p className="m-0 text-15 text-critical">Please enter your app’s address.</p>
            )}
            {touched && trimmed.length > 0 && token === null && !checkFailed && (
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
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-4 gap-y-1 p-0 text-13 text-secondary">
            {['Free', 'No sign-up', 'Read-only'].map((t) => (
              <li key={t} className="inline-flex items-center gap-1.5">
                <Icon name="check" size={16} className="text-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroPreview />
      </section>

      <section aria-label="Builders we support" className="text-center">
        <p className="m-0 text-13 font-semibold uppercase tracking-wider text-secondary">
          Made for apps built with
        </p>
        <ul className="m-0 mt-4 flex list-none flex-wrap justify-center gap-x-8 gap-y-2 p-0 text-22 font-semibold text-secondary">
          {BUILDERS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </section>

      <section id="how" aria-labelledby="how-title" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
            How it works
          </p>
          <h2 id="how-title" className="m-0 text-28 font-bold tracking-tight">
            Three steps, no security degree needed
          </h2>
        </div>
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="space-y-3 rounded-card glass p-6">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-15 font-bold text-on-accent">
                {i + 1}
              </span>
              <h3 className="m-0 text-17 font-semibold">{step.title}</h3>
              <p className="m-0 text-15 text-secondary">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="checks" aria-labelledby="checks-title" className="scroll-mt-24 space-y-8">
        <div className="max-w-2xl space-y-2">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
            What we check
          </p>
          <h2 id="checks-title" className="m-0 text-28 font-bold tracking-tight">
            The mistakes AI builders make most often
          </h2>
          <p className="m-0 text-17 text-secondary">
            Seven checks run on every free scan. Two deeper checks run once you show you own the
            app.
          </p>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {CHECKS.map((c) => (
            <li key={c.title} className="flex gap-4 rounded-card glass p-5">
              <IconChip name={c.icon} />
              <div className="space-y-1">
                <h3 className="m-0 text-17 font-semibold">{c.title}</h3>
                <p className="m-0 text-15 text-secondary">{c.text}</p>
                {c.deep && (
                  <p className="m-0 pt-1 text-13 font-semibold text-accent">
                    After you prove you own the app
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Why founders trust us">
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {TRUST.map((t) => (
            <li key={t.title} className="glass flex gap-4 rounded-card p-5">
              <IconChip name={t.icon} />
              <div>
                <h2 className="m-0 text-17 font-semibold">{t.title}</h2>
                <p className="m-0 mt-1 text-15 text-secondary">{t.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="sample-title"
        className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
      >
        <div className="space-y-3">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
            Sample report
          </p>
          <h2 id="sample-title" className="m-0 text-28 font-bold tracking-tight">
            What a full report looks like
          </h2>
          <p className="m-0 text-17 text-secondary">
            An example. Tap an issue to see why it matters and how to fix it.
          </p>
        </div>
        <FullReport
          host={SAMPLE.host}
          grade={SAMPLE.grade}
          score={SAMPLE.score}
          findings={SAMPLE.findings}
        />
      </section>

      <section aria-labelledby="cta-title" className="glass rounded-[28px] px-6 py-12 text-center">
        <h2 id="cta-title" className="m-0 text-28 font-bold tracking-tight">
          Find out in 30 seconds
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-17 text-secondary">
          Free, read-only and in plain English. Nothing on your app is changed.
        </p>
        <a
          href="#scan"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-button bg-accent px-6 text-17 font-semibold text-on-accent hover:opacity-90"
        >
          Scan my app now
          <Icon name="arrow" size={18} />
        </a>
      </section>
    </div>
  );
}
