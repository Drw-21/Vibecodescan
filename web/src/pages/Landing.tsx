import { type SyntheticEvent, useCallback, useState } from 'react';
import { Button } from '../components/Button';
import { GradeRing } from '../components/GradeRing';
import { Icon, IconChip } from '../components/Icon';
import { SeverityBadge } from '../components/SeverityBadge';
import { Turnstile } from '../components/Turnstile';
import {
  BUILDERS,
  FAQ,
  FEATURES,
  FINAL_CTA,
  PLANS,
  PROBLEM,
  PROOF_HEADING,
  PROOF_STATS,
  SOLUTION,
  TESTIMONIALS,
} from '../lib/landingContent';
import { SAMPLE } from '../lib/sample';
import { FullReport } from './Report';

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
        <div className="text-center lg:col-span-2">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-secondary">
            Made for apps built with
          </p>
          <ul className="m-0 mt-4 flex list-none flex-wrap justify-center gap-x-8 gap-y-2 p-0 text-22 font-semibold text-secondary">
            {BUILDERS.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      </section>
      <section id="proof" aria-labelledby="proof-title" className="scroll-mt-24 space-y-8">
        <h2 id="proof-title" className="m-0 text-center text-22 font-semibold tracking-tight">
          {PROOF_HEADING}
        </h2>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
          {PROOF_STATS.map((s) => (
            <li key={s.label} className="glass rounded-card p-5 text-center">
              <p className="m-0 text-28 font-bold tracking-tight">{s.value}</p>
              <p className="m-0 mt-1 text-15 text-secondary">{s.label}</p>
            </li>
          ))}
        </ul>
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {TESTIMONIALS.map((t, i) => (
            <li
              key={`${String(i)}-${t.name}`}
              className="glass flex flex-col justify-between gap-4 rounded-card p-6"
            >
              <blockquote className="m-0 text-17">“{t.quote}”</blockquote>
              <p className="m-0 text-15">
                <span className="font-semibold">{t.name}</span>
                <span className="text-secondary"> · {t.role}</span>
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="problem"
        aria-labelledby="problem-title"
        className="mx-auto max-w-3xl scroll-mt-24 space-y-6"
      >
        <div className="space-y-2 text-center">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
            {PROBLEM.eyebrow}
          </p>
          <h2 id="problem-title" className="m-0 text-28 font-bold tracking-tight">
            {PROBLEM.heading}
          </h2>
        </div>
        <ul className="glass m-0 list-none space-y-0 rounded-card p-0">
          {PROBLEM.bullets.map((b) => (
            <li
              key={b}
              className="flex items-center gap-4 border-b border-separator px-5 py-4 text-17 last:border-b-0"
            >
              <span aria-hidden="true" className="text-22 text-secondary">
                “
              </span>
              {b}
            </li>
          ))}
        </ul>
      </section>

      <section id="how" aria-labelledby="how-title" className="scroll-mt-24 space-y-10">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
            {SOLUTION.eyebrow}
          </p>
          <h2 id="how-title" className="m-0 text-28 font-bold tracking-tight">
            {SOLUTION.heading}
          </h2>
        </div>
        <ol className="m-0 grid list-none gap-4 p-0 lg:grid-cols-3">
          {SOLUTION.pairs.map((pair) => (
            <li key={pair.after} className="glass flex flex-col gap-4 rounded-card p-6">
              <div>
                <p className="m-0 text-13 font-semibold uppercase tracking-wider text-secondary">
                  Today
                </p>
                <p className="m-0 mt-1 text-15 text-secondary">{pair.before}</p>
              </div>
              <Icon name="arrow" size={20} className="rotate-90 text-accent" />
              <div>
                <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">
                  With Scanner
                </p>
                <p className="m-0 mt-1 text-17 font-semibold">{pair.after}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-3">
            <h3 className="m-0 text-22 font-semibold tracking-tight">
              What a full report looks like
            </h3>
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
        </div>
      </section>

      <section id="checks" aria-labelledby="checks-title" className="scroll-mt-24 space-y-8">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">Features</p>
          <h2 id="checks-title" className="m-0 text-28 font-bold tracking-tight">
            Six things every free scan checks
          </h2>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="glass flex gap-4 rounded-card p-5">
              <IconChip name={f.icon} />
              <div className="space-y-1">
                <h3 className="m-0 text-17 font-semibold">{f.title}</h3>
                <p className="m-0 text-15 text-secondary">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="pricing" aria-labelledby="pricing-title" className="scroll-mt-24 space-y-8">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <p className="m-0 text-13 font-semibold uppercase tracking-wider text-accent">Pricing</p>
          <h2 id="pricing-title" className="m-0 text-28 font-bold tracking-tight">
            Start free. Upgrade when you need more.
          </h2>
        </div>
        <ul className="m-0 grid list-none items-stretch gap-4 p-0 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <li
              key={plan.name}
              className={`glass flex flex-col gap-5 rounded-card p-6 ${plan.highlighted ? 'ring-2 ring-accent' : ''}`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="m-0 text-22 font-semibold">{plan.name}</h3>
                  {plan.highlighted && (
                    <span className="rounded-full bg-accent px-3 py-1 text-13 font-semibold text-on-accent">
                      Most popular
                    </span>
                  )}
                </div>
                <p className="m-0">
                  <span className="text-34 font-bold tracking-tight">{plan.price}</span>
                  {plan.period && <span className="text-15 text-secondary"> {plan.period}</span>}
                </p>
                <p className="m-0 text-15 text-secondary">{plan.blurb}</p>
              </div>
              <ul className="m-0 flex-1 list-none space-y-2 p-0">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-15">
                    <Icon name="check" size={18} className="mt-0.5 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan.available ? (
                <a
                  href="#scan"
                  className="inline-flex min-h-11 items-center justify-center rounded-button bg-accent px-5 text-17 font-semibold text-on-accent hover:opacity-90"
                >
                  {plan.cta}
                </a>
              ) : (
                <div className="space-y-2 text-center">
                  <Button
                    variant={plan.highlighted ? 'primary' : 'secondary'}
                    className="w-full"
                    disabled
                  >
                    {plan.cta}
                  </Button>
                  <p className="m-0 text-13 text-secondary">Coming soon</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-title"
        className="mx-auto max-w-3xl scroll-mt-24 space-y-6"
      >
        <h2 id="faq-title" className="m-0 text-center text-28 font-bold tracking-tight">
          Questions founders ask
        </h2>
        <div className="glass rounded-card">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-separator last:border-b-0">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-17 font-semibold">
                {item.q}
                <span
                  aria-hidden="true"
                  className="text-secondary transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="m-0 px-5 pb-5 text-15 text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="cta-title" className="glass rounded-[28px] px-6 py-12 text-center">
        <h2 id="cta-title" className="m-0 text-28 font-bold tracking-tight">
          {FINAL_CTA.heading}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-17 text-secondary">{FINAL_CTA.text}</p>
        <a
          href="#scan"
          className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-button bg-accent px-6 text-17 font-semibold text-on-accent hover:opacity-90"
        >
          {FINAL_CTA.cta}
          <Icon name="arrow" size={18} />
        </a>
      </section>
    </div>
  );
}
