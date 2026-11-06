# Changelog

All notable changes. Version numbers follow `MAJOR.MINOR.PATCH`.

## 0.5.0 — Milestone 5: Frontend core (unreleased)

- `web/`: React + Vite + Tailwind with design tokens (Apple type scale, 8-pt grid, light and dark,
  one accent; severity by icon + word + colour).
- Screens: Landing (one URL field, Turnstile, three trust points, sample full report), Scan in
  progress (live checklist), Report (grade ring, plain summary, counts by severity, top 3 issues).
- Full-report layout (findings grouped by severity, expandable, "Copy fix prompt") built and used
  by the sample report.
- `web/public/_headers`: strict security headers for our own site.
- Tests: token contrast (WCAG AA, both themes), API response validation, components (including a
  stored-XSS test), the whole flow; and a browser test in CI at 375 px and 1280 px, light and dark.
- MVP testing guide: `docs/mvp-testing.md`. Decisions in docs/decisions/0007.

## 0.4.0 — Milestone 4: Scan functions

- `create-scan`: Zod-validated input, URL normalisation, Turnstile for anonymous visitors,
  CORS limited to our site, rate limits (3 free scans/day per account and per IP, one scan per
  host per 10 minutes), Free summary returned once to anonymous visitors, background scans for
  signed-in users.
- `run-scan`: service-role-only endpoint; shared `runScan` step claims a scan once, runs the
  engine with a 55-second limit, saves findings and grade together or fails with a code.
- Migration `20261106000100_scan_functions.sql`: `create_scan_with_limits`, `claim_scan`,
  `complete_scan`, `fail_scan` (service role only) and the hashed-IP column.
- Production DNS resolver (A + AAAA) and Deno wiring; `zod` and `@supabase/supabase-js` pinned
  in `package.json` and `supabase/functions/deno.json`.
- Tests: SQL functions on Postgres, Supabase adapter against a fake server, handlers and
  `runScan` with an in-memory store, and an end-to-end test from URL to findings rows.
- Independent review fixes: the visitor IP comes only from the platform-set header (never
  X-Forwarded-For), IPv6 counts per /64, and anonymous scans without a trusted IP are refused;
  bodies are capped while streaming; unexpected errors return a readable 500; a failed claim
  marks the scan failed; the whole-scan deadline aborts running requests; concurrency tests prove
  the limits hold under parallel requests.
- Launch blockers 2 and 3 closed; decisions in docs/decisions/0006.

## 0.3.0 — Milestone 3: Passive checks

- Seven passive checks, one file each in `scanner/checks/`: `secret-in-bundle`, `exposed-files`,
  `source-maps`, `security-headers`, `https`, `cookie-flags`, `platform-detect`; all `live`.
- `detect.ts` (builder and backend), `context.ts`, `redact.ts` (first 4 + last 4, paths only,
  no secret-length runs), `jwt.ts`.
- Fixtures: whole fake sites per check (`fixtures/checks/`) with pass, fail and false-positive
  traps; fake secrets assembled at test time.
- Simulated reference apps (`fixtures/reference-apps/sites.ts`): every app gives exactly its
  written passive results; the insecure app fails and the fixed app scores 100 / A.
- Independent review fixes: keys after `Bearer `, in template literals, escaped JSON and comments
  are now found; CSRF cookies, `<meta>` CSPs and duplicated headers no longer cause false alarms;
  `frame-ancestors *` no longer counts; 429/5xx answers make a check incomplete, not pass;
  source maps are checked for every bundle; HTML tags are found without page-wide regexes
  (a milestone 2 regex could hang a scan for minutes on a hostile page).
- Judgement calls recorded in docs/decisions/0005.

## 0.2.0 — Milestone 2: Engine core

- `types.ts`: the `Check` / `Finding` / `ScanContext` contract from the spec, plus `bundlesComplete`
  so a check can report "incomplete" when not every bundle was loaded.
- `safeFetch.ts` + `ip.ts`: http/https on ports 80/443 only, no credentials in URLs, every
  resolved address must be public (checked again after each redirect), at most 5 redirects,
  2 MB per response (reading stops at the cap), 8-second limit, GET only, fixed User-Agent.
- `collect.ts`: loads the page once plus up to 25 same-host bundles, 5 MB and 10 seconds in total.
- `runner.ts`: checks run in parallel with their own time limits; errors, timeouts, empty or
  mislabelled results become "incomplete"; deep checks only on verified sites; per-check
  live / shadow / off switches and a deep-scan kill switch in `config.ts`.
- `score.ts`: the spec's weights and grade rules; incomplete checks make the grade partial.
- CI typechecks Edge Function code under Deno as well as Node.
- Independent review fixes: a DNS lookup that never answers now times out; a bad per-call byte cap
  can no longer switch the cap off; parallel bundle downloads reserve budget so collect never reads
  more than 5 MB; credentials are dropped on cross-origin redirects; `3fff::/20` blocked; the
  two-criticals rule now has a test that fails without it.

### Known gaps

- See `docs/launch-blockers.md`: DNS pinning (ADR 0004), a production resolver, and the 60-second scan limit.

## 0.1.0 — Milestone 1: Foundation

- Repository layout, `CLAUDE.md`, `.env.example`, pull request template, Dependabot.
- CI: ESLint, Prettier, typecheck, unit tests, `npm audit` (high/critical), RLS tests on Postgres 16, Gitleaks over full history.
- Migrations for `profiles`, `sites`, `scans`, `findings`, `subscriptions`, `billing_events`, each with RLS on and API-role grants revoked by default.
- RLS tests proving users cannot read or change each other's data, plus schema guards (RLS on every table, index on every foreign key).
- Independent review fixes: strict `sites.url` validation (host parsing could disagree with `new URL`), evidence refuses anything that looks like a full secret, a scan's owner must be its site's owner, Postgres 17 in CI.
- Written expected results for the reference app suite (`fixtures/reference-apps/expected-results.json`).
