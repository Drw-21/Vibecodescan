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

export function SiteHeader({ showNav }: { showNav: boolean }) {
  return (
    <header className="glass-bar sticky top-0 z-20">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <a href="/" className="rounded-lg" aria-label="Scanner, home">
          <Logo />
        </a>
        {showNav && (
          <nav aria-label="Main" className="flex items-center gap-1 text-15">
            <a
              href="#how"
              className="hidden min-h-11 items-center rounded-lg px-3 text-secondary hover:text-ink md:inline-flex"
            >
              How it works
            </a>
            <a
              href="#checks"
              className="hidden min-h-11 items-center rounded-lg px-3 text-secondary hover:text-ink md:inline-flex"
            >
              What we check
            </a>
            <a
              href="#pricing"
              className="hidden min-h-11 items-center rounded-lg px-3 text-secondary hover:text-ink md:inline-flex"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="hidden min-h-11 items-center rounded-lg px-3 text-secondary hover:text-ink md:inline-flex"
            >
              FAQ
            </a>
            <a
              href="#scan"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-button bg-accent px-4 font-semibold text-on-accent hover:opacity-90"
            >
              Scan free
              <Icon name="arrow" size={16} />
            </a>
          </nav>
        )}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="glass-bar border-t border-separator">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm space-y-2">
          <Logo />
          <p className="m-0 text-15 text-secondary">
            Security checks in plain English for apps built with AI. We only read what any browser
            can already see.
          </p>
        </div>
        <p className="m-0 max-w-sm text-13 text-secondary">
          Scanner is an automated check, not a penetration test, and cannot promise an app is safe.
          Only scan apps you own or are allowed to test. © {new Date().getFullYear()} Scanner.
        </p>
      </div>
    </footer>
  );
}
