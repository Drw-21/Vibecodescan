import { Button, ButtonLink } from '../components/Button';
import { GradeRing } from '../components/GradeRing';
import { Icon, IconChip } from '../components/Icon';
import { SeverityBadge } from '../components/SeverityBadge';
import {
  BUILDERS,
  FAQ,
  FEATURES,
  FINAL_CTA,
  PLANS,
  PROBLEM,
  SOLUTION,
} from '../lib/landingContent';
import { SAMPLE } from '../lib/sample';
import { FullReport } from './Report';

const EYEBROW = 'text-13 font-semibold uppercase tracking-wider text-accent';
const H2 = 'text-34 font-medium leading-[1.1] tracking-tight lg:text-44';

/**
 * Three small cards under the headline that preview a report. Decorative (the real, readable
 * sample is further down). They sit side by side in a grid, so they can never overlap.
 */
function HeroCards() {
  const first = SAMPLE.findings[0];
  return (
    <div
      aria-hidden="true"
      className="mx-auto mt-14 grid max-w-5xl grid-cols-[minmax(0,1fr)] items-end gap-6 text-left md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]"
    >
      <div className="glass hidden flex-col items-center gap-2 rounded-card p-5 md:flex md:-rotate-2">
        <GradeRing grade={SAMPLE.grade} score={SAMPLE.score} size={108} />
      </div>
      <div className="glass flex flex-col gap-4 rounded-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-13 text-secondary">Report</p>
            <p className="truncate text-17 font-semibold">{SAMPLE.host}</p>
          </div>
          <span className="shrink-0 whitespace-nowrap rounded-full bg-accent-soft px-3 py-1 text-13 font-semibold text-accent">
            Grade {SAMPLE.grade}
          </span>
        </div>
        <ul className="flex flex-col gap-2">
          {SAMPLE.findings.map((f) => (
            <li
              key={f.title}
              className="flex items-center gap-3 rounded-xl border border-separator bg-surface/60 p-3"
            >
              <SeverityBadge severity={f.severity} />
              <span className="min-w-0 truncate text-15">{f.title}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass hidden flex-col gap-3 rounded-card p-5 md:flex md:rotate-2">
        <p className="inline-flex items-center gap-2 text-13 font-semibold text-secondary">
          <Icon name="clipboard" size={16} />
          Fix prompt
        </p>
        <p className="line-clamp-4 font-mono text-13">{first?.fixPrompt ?? ''}</p>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-contrast px-3 py-1 text-13 font-semibold text-on-contrast">
          <Icon name="check" size={14} />
          Copied
        </span>
      </div>
    </div>
  );
}

/** A heading block used at the top of most sections: eyebrow, heading and optional text. */
function SectionHead({
  id,
  eyebrow,
  title,
  text,
  center = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  text?: string;
  center?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-4 ${center ? 'mx-auto max-w-2xl items-center text-center' : 'lg:flex-row lg:items-end lg:justify-between lg:gap-16'}`}
    >
      <div className="flex max-w-2xl flex-col gap-3">
        <p className={EYEBROW}>{eyebrow}</p>
        <h2 id={id} className={`${H2} text-balance`}>
          {title}
        </h2>
      </div>
      {text !== undefined && (
        <p className={`text-17 text-secondary ${center ? '' : 'max-w-md lg:pb-1'}`}>{text}</p>
      )}
    </div>
  );
}

export function Landing() {
  return (
    <div className="flex flex-col gap-24 pb-8 lg:gap-32">
      <section
        id="top"
        aria-labelledby="hero-title"
        className="hero-panel overflow-hidden rounded-panel px-5 pb-10 pt-14 text-center sm:px-10 lg:pb-16 lg:pt-24"
      >
        <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-surface/70 px-3 py-1.5 text-13 font-semibold text-accent">
          <Icon name="shield" size={16} />
          Free security check for AI-built apps
        </p>
        <h1
          id="hero-title"
          tabIndex={-1}
          className="mx-auto mt-6 max-w-4xl text-balance text-[2.5rem] font-medium leading-[1.04] tracking-tight sm:text-52 lg:text-64"
        >
          Is the app you built with AI safe?
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-17 text-secondary">
          Paste your app’s address. In about 30 seconds you get a grade and a plain-English list of
          what to fix.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/scan">
            Scan my app free
            <Icon name="arrow" size={18} />
          </ButtonLink>
          <ButtonLink href="#how" variant="secondary">
            See a sample report
          </ButtonLink>
        </div>
        <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-13 text-secondary">
          {['Free', 'No sign-up', 'Read-only'].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Icon name="check" size={16} className="text-accent" />
              {t}
            </li>
          ))}
        </ul>
        <HeroCards />
      </section>

      <div className="-mt-12 flex flex-col gap-5 border-b border-separator pb-10 md:flex-row md:items-center md:justify-between lg:-mt-20">
        <p className="max-w-48 text-13 text-secondary">Made for apps built with</p>
        <ul className="flex flex-wrap items-center gap-x-10 gap-y-3 text-22 font-semibold tracking-tight text-secondary">
          {BUILDERS.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>

      <section
        id="problem"
        aria-labelledby="problem-title"
        className="grid scroll-mt-28 grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16"
      >
        <div className="flex flex-col gap-3">
          <p className={EYEBROW}>{PROBLEM.eyebrow}</p>
          <h2 id="problem-title" className={`${H2} text-balance`}>
            {PROBLEM.heading}
          </h2>
        </div>
        <ul className="flex flex-col gap-3">
          {PROBLEM.bullets.map((b) => (
            <li key={b} className="glass flex items-center gap-4 rounded-card px-5 py-4 text-17">
              <span aria-hidden="true" className="font-serif text-34 leading-none text-accent">
                “
              </span>
              {b}
            </li>
          ))}
        </ul>
      </section>

      <section
        id="how"
        aria-labelledby="how-title"
        className="flex scroll-mt-28 flex-col gap-10 lg:gap-14"
      >
        <SectionHead
          id="how-title"
          eyebrow={SOLUTION.eyebrow}
          title={SOLUTION.heading}
          text="Three things change the day you run your first scan."
        />
        <ol className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
          {SOLUTION.pairs.map((pair, i) => {
            const lead = i === 0;
            return (
              <li
                key={pair.after}
                className={`flex min-h-64 flex-col justify-between gap-8 rounded-panel p-6 lg:p-8 ${lead ? 'hero-panel' : 'bg-contrast text-on-contrast'}`}
              >
                <p className={`font-medium tracking-tight ${lead ? 'text-28' : 'text-22'}`}>
                  {pair.after}
                </p>
                <p className={`text-15 ${lead ? 'text-secondary' : 'text-on-contrast-secondary'}`}>
                  <span className="font-semibold">Today: </span>
                  {pair.before}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h3 className="text-22 font-semibold tracking-tight">What a full report looks like</h3>
            <p className="text-17 text-secondary">
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

      <section
        id="checks"
        aria-labelledby="checks-title"
        className="flex scroll-mt-28 flex-col gap-10"
      >
        <SectionHead
          id="checks-title"
          eyebrow="Features"
          title="Six things every free scan checks"
          text="The mistakes we see most often in apps built with AI, checked in about 30 seconds."
        />
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="glass flex flex-col gap-4 rounded-card p-6">
              <IconChip name={f.icon} />
              <div className="flex flex-col gap-1">
                <h3 className="text-17 font-semibold">{f.title}</h3>
                <p className="text-15 text-secondary">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="pricing"
        aria-labelledby="pricing-title"
        className="flex scroll-mt-28 flex-col gap-10"
      >
        <SectionHead
          id="pricing-title"
          eyebrow="Pricing"
          title="Start free. Upgrade when you need more."
          center
        />
        <ul className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => {
            const dark = plan.highlighted === true;
            const muted = dark ? 'text-on-contrast-secondary' : 'text-secondary';
            return (
              <li
                key={plan.name}
                className={`flex flex-col gap-6 rounded-panel p-6 lg:p-8 ${dark ? 'bg-contrast text-on-contrast' : 'glass'}`}
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-22 font-semibold">{plan.name}</h3>
                    {dark && (
                      <span className="rounded-full bg-accent px-3 py-1 text-13 font-semibold text-on-accent">
                        Most popular
                      </span>
                    )}
                  </div>
                  {plan.price !== '' && (
                    <p>
                      <span className="text-44 font-medium tracking-tight">{plan.price}</span>
                      {plan.period && <span className={`text-15 ${muted}`}> {plan.period}</span>}
                    </p>
                  )}
                  <p className={`text-15 ${muted}`}>{plan.blurb}</p>
                </div>
                <ul className="flex flex-1 flex-col gap-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-15">
                      <Icon
                        name="check"
                        size={18}
                        className={`mt-0.5 shrink-0 ${dark ? '' : 'text-accent'}`}
                      />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.available ? (
                  <ButtonLink href="/scan" className="w-full">
                    {plan.cta}
                  </ButtonLink>
                ) : (
                  <div className="flex flex-col gap-2 text-center">
                    <Button variant="secondary" className="w-full" disabled>
                      {plan.cta}
                    </Button>
                    <p className={`text-13 ${muted}`}>Coming soon</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section
        id="faq"
        aria-labelledby="faq-title"
        className="grid scroll-mt-28 grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16"
      >
        <div className="flex flex-col gap-3">
          <p className={EYEBROW}>FAQ</p>
          <h2 id="faq-title" className={`${H2} text-balance`}>
            Questions founders ask
          </h2>
          <p className="text-17 text-secondary">
            Still unsure? A free scan is read-only and changes nothing on your app.
          </p>
        </div>
        <div className="glass rounded-panel">
          {FAQ.map((item) => (
            <details key={item.q} className="group border-b border-separator last:border-b-0">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-17 font-semibold">
                {item.q}
                <span
                  aria-hidden="true"
                  className="text-22 text-secondary transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="px-6 pb-5 text-15 text-secondary">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="cta-title"
        className="rounded-panel bg-contrast px-6 py-16 text-center text-on-contrast lg:py-24"
      >
        <h2 id="cta-title" className={`${H2} text-balance`}>
          {FINAL_CTA.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-17 text-on-contrast-secondary">{FINAL_CTA.text}</p>
        <ButtonLink href="/scan" variant="accent" className="mt-8">
          {FINAL_CTA.cta}
          <Icon name="arrow" size={18} />
        </ButtonLink>
      </section>
    </div>
  );
}
