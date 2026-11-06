# 0005 — Judgement calls in the passive checks

**Context.** The spec names each passive check and its severity, but not every edge case.
False positives are bugs, and a check must never report "pass" when it could not look.
These are the calls made in milestone 3. Change any of them by PR, with a fixture.

**Decisions.**

- **Fail safe.** A check that could not do its job (requests failed or timed out, or some
  bundles could not be loaded) reports `incomplete`, never `pass`.
- **secret-in-bundle**
  - A key must not be glued to other letters, digits, `_` or `-` on either side. So quoted
    keys, `"Bearer sk-…"`, template literals, escaped JSON (Next.js/v0 page data) and keys left
    in comments are all found, while longer identifiers (`disk_live_…`) are not. (The first
    version required a quote right before the key and missed `Bearer` keys: independent review.)
  - An "OpenAI-looking" value must also mix upper case, lower case and digits.
  - Severity: critical for live secrets. A Stripe test-mode key is **high**. An AWS access
    key ID on its own is **high** and becomes critical when its secret is also exposed.
  - Public-by-design keys are never flagged: Supabase anon/publishable, Stripe `pk_`,
    Firebase `apiKey`.
  - At most 10 keys are reported per scan.
- **Bundles** are only fetched from the page's own host. Third-party scripts are not the
  founder's code. Inline scripts on the page are scanned too. **Known limit:** chunks loaded
  later with `import()` (other routes) are not linked from the first page, so they are not
  scanned; the pass wording says "the JavaScript your app loads on its first page".
- **Not yet covered** (not in the spec's provider list): OpenRouter, DeepSeek, Clerk (`sk_live_`
  keys would be labelled as Stripe), Stripe webhook secrets (`whsec_`), and keys split across
  string concatenation. Candidates for a later check revision.
- **HTML is never matched with a regex across the whole page.** Tags are found with `indexOf`
  and each regex sees one tag of at most 4 KB (`html.ts`). A regex in milestone 2's collect step
  took 141 s on a hostile 2 MB page (independent review); a test now guards this.
- **exposed-files** judges content, not status codes. `.env` means mostly `KEY=value` lines
  and not HTML/JSON; Git config means `[core]` plus `repositoryformatversion`; a SQL dump means
  `CREATE TABLE`/`INSERT INTO`. Evidence is the path only. A 429 or 5xx answer means the server
  never really answered, so the check reports `incomplete`, not `pass` (same for source-maps).
- **source-maps**: a map embedded in a bundle counts as published. Otherwise the check tries
  the bundle's `sourceMappingURL` (same host only) or `<bundle>.map` for every collected bundle
  (at most 25), and the response must really be a source map.
- **security-headers**: one finding per protection. CSP and HSTS are medium; frame protection,
  `nosniff` and Referrer-Policy are low. CSP in report-only mode does not count; HSTS with
  `max-age=0` does not count; a CSP in a `<meta http-equiv>` tag counts for script protection;
  `frame-ancestors` in the CSP counts as frame protection unless it allows `*` or a bare scheme;
  a header sent twice ("nosniff, nosniff") is judged by its first value; `unsafe-url` and
  `no-referrer-when-downgrade` do not count as a Referrer-Policy.
- **https**: if the page loaded over HTTPS, its certificate was valid (the fetch would have
  failed otherwise). Nothing listening on plain http counts as a pass; a timeout is incomplete.
  Known limit: a network error after the http→https redirect also counts as a pass.
- **cookie-flags** only judges login-like cookies (names containing sess, sid, auth, token,
  jwt, login, remember) on the first page response. CSRF cookies (`XSRF-TOKEN`, `csrftoken`)
  are meant to be read by scripts and are not login cookies. Supabase's `sb-…-auth-token` cookies are
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
