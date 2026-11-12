import { ButtonLink } from './Button';
import { Icon } from './Icon';

/** The brand mark: a shield in the accent colour. */
export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-17 font-semibold tracking-tight">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-on-accent">
        <Icon name="shield" size={18} />
      </span>
      Scanner
    </span>
  );
}

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#checks', label: 'What we check' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

/**
 * A floating glass bar. On the landing page the links jump to its sections; on the scan page
 * they lead back to the landing page, and the "Scan" button is hidden (you are already there).
 */
export function SiteHeader({ page }: { page: 'landing' | 'scan' }) {
  const base = page === 'landing' ? '' : '/';
  return (
    <header className="sticky top-0 z-20 px-4 pt-3">
      <div className="glass mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-4 rounded-full py-1.5 pl-4 pr-1.5">
        <a href="/" className="rounded-lg" aria-label="Scanner, home">
          <Logo />
        </a>
        <nav aria-label="Main" className="hidden items-center gap-1 text-15 md:flex">
          {NAV.map((n) => (
            <a
              key={n.href}
              href={`${base}${n.href}`}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-secondary hover:text-ink"
            >
              {n.label}
            </a>
          ))}
        </nav>
        {page === 'landing' ? (
          <ButtonLink href="/scan" className="text-15">
            Scan my app
            <Icon name="arrow" size={16} />
          </ButtonLink>
        ) : (
          <a
            href="/"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-15 text-secondary hover:text-ink"
          >
            Back to home
          </a>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="glass-bar mt-8 border-t border-separator">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-2">
          <Logo />
          <p className="text-15 text-secondary">
            Security checks in plain English for apps built with AI. We only read what any browser
            can already see.
          </p>
        </div>
        <p className="max-w-sm text-13 text-secondary">
          Scanner is an automated check, not a penetration test, and cannot promise an app is safe.
          Only scan apps you own or are allowed to test. © {new Date().getFullYear()} Scanner.
        </p>
      </div>
    </footer>
  );
}
