# 0005 — Judgement calls in the passive checks

**Context.** The spec names each passive check and its severity, but not every edge case.
False positives are bugs, and a check must never report "pass" when it could not look.
These are the calls made in milestone 3. Change any of them by PR, with a fixture.

**Decisions.**

- **Fail safe.** A check that could not do its job (requests failed or timed out, or some
  bundles could not be loaded) reports `incomplete`, never `pass`.
- **secret-in-bundle**
  - Only keys inside quotes count, which rules out class names and comments.
  - An "OpenAI-looking" value must also mix upper case, lower case and digits.
  - Severity: critical for live secrets. A Stripe test-mode key is **high**. An AWS access
    key ID on its own is **high** and becomes critical when its secret is also exposed.
  - Public-by-design keys are never flagged: Supabase anon/publishable, Stripe `pk_`,
    Firebase `apiKey`.
  - At most 10 keys are reported per scan.
- **Bundles** are only fetched from the page's own host. Third-party scripts are not the
  founder's code. Inline scripts on the page are scanned too.
- **exposed-files** judges content, not status codes. `.env` means mostly `KEY=value` lines
  and not HTML/JSON; Git config means `[core]` plus `repositoryformatversion`; a SQL dump means
  `CREATE TABLE`/`INSERT INTO`. Evidence is the path only.
- **source-maps**: a map embedded in a bundle counts as published. Otherwise the check tries
  the bundle's `sourceMappingURL` (same host only) or `<bundle>.map`, at most 5, and the
  response must really be a source map.
- **security-headers**: one finding per protection. CSP and HSTS are medium; frame protection,
  `nosniff` and Referrer-Policy are low. CSP in report-only mode does not count; HSTS with
  `max-age=0` does not count; `frame-ancestors` in the CSP counts as frame protection;
  `unsafe-url` and `no-referrer-when-downgrade` do not count as a Referrer-Policy.
- **https**: if the page loaded over HTTPS, its certificate was valid (the fetch would have
  failed otherwise). Nothing listening on plain http counts as a pass; a timeout is incomplete.
- **cookie-flags** only judges login-like cookies (names containing sess, sid, auth, token,
  jwt, login, remember) on the first page response. Supabase's `sb-…-auth-token` cookies are
  not required to be HttpOnly, because Supabase's browser library reads them by design.
  Cookie values are never stored.
- **platform-detect**: host suffixes and page markers, builders before hosting providers.
  Only a JWT with role `anon` (or a publishable key) is ever taken as the Supabase key.
- **Fixtures** describe whole fake sites. Fake secrets are assembled at test time, so the
  repository never contains a key-shaped string. The 13 reference apps are simulated in
  `fixtures/reference-apps/sites.ts` and compared with `expected-results.json` on every push.

**Consequences.** All seven passive checks are switched on (`live`) in `config.ts`. The spec's
7-day shadow period applies to checks added after launch; before launch there are no users to
protect from a false positive.
