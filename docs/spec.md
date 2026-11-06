# Vibe App Scanner Build Spec

Nov 5, 2026 · @Andrew

## Overview

We are building a web app that scans a founder's live, AI-built app (Lovable, Bolt, Replit, v0, Cursor) and returns a plain-English security report with copy-paste fix prompts. Working name: **Scanner** (rename before launch).

**Who it is for:** non-technical founders who shipped an app with an AI builder and don't know if it is safe.

**v1 scope (must ship)**

- Paste a URL, get a free passive scan: grade A–F plus number of issues by severity
- Prove ownership of the domain to unlock the full report and the deeper checks
- Full report: each finding explained in plain English, with evidence and a fix prompt for the user's AI builder
- Paid plans: one-off deep scan and a monthly plan with weekly rescans and email alerts
- Dashboard: my sites, scan history, score trend

**Non-goals for v1 (do not build)**

- Logged-in testing (IDOR, role bypass), source-code or GitHub scanning, CI integrations, team accounts, agency white-labelling, mobile apps
- Anything that writes, deletes or changes data on a scanned app
- Scanning any app whose owner has not verified it, beyond the passive checks

## Engineering principles

Every change Claude Code makes must follow these rules. Copy this section into `CLAUDE.md` at the repo root.

| Principle               | What it means here                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Separation of concerns  | The scan engine is a pure library: it takes a URL and returns findings. It knows nothing about the database, payments or the UI.        |
| Single responsibility   | One check = one file = one job. A function does one thing.                                                                              |
| Open/closed (plugins)   | New checks are added by dropping in a file that follows the `Check` interface. The runner never changes.                                |
| Least privilege         | The browser only ever holds the public Supabase key. Writes to scans and findings happen only in Edge Functions using the service role. |
| Secure by default       | Row-level security on every table from the first migration. Deny unless a policy allows.                                                |
| Fail safe, not open     | A check that errors or times out reports "could not complete", never "passed".                                                          |
| Validate at the edges   | All input (URLs, webhook bodies) is validated with a schema (Zod) before use.                                                           |
| Typed everywhere        | TypeScript strict mode. No `any`. Database types generated from Supabase.                                                               |
| Idempotent jobs         | Running the same scan or webhook twice never creates duplicates or double charges.                                                      |
| Config, not code        | Limits, prices and timeouts live in one config file and environment variables. No secrets in code, ever.                                |
| Test first for checks   | Every check has tests against fixture pages: one that should fail, one that should pass.                                                |
| KISS and YAGNI          | Build only what v1 needs. No microservices, no queues beyond the database, no premature abstraction.                                    |
| Small, reviewable steps | One milestone per Claude Code session, committed to git, tested before moving on.                                                       |

## Architecture and scan flow

Three parts: a static web app, Supabase (database plus server functions), and a pure scan engine that is the only code allowed to touch the internet.

_(Architecture diagram: browser → Supabase Edge Functions → scan engine → `safeFetch` → internet. Only the engine touches the internet; only Edge Functions write to the database.)_

**A scan, step by step**

1. User pastes a URL. The browser calls `create-scan`.
2. `create-scan` validates the URL, checks the captcha and rate limits, inserts a `scans` row (`queued`) and starts `run-scan` in the background.
3. `run-scan` sets `running`, loads the page once through `safeFetch`, and runs every allowed check (deep checks only if the site is verified).
4. Findings are redacted, scored, given fix prompts, and saved. Status becomes `done` (or `failed` with an error code).
5. The browser watches the scan row (Supabase Realtime) and shows the report the moment it is done.

## Repository structure

One GitHub repository holds everything, so Claude Code always sees the whole system.

```
scanner/
├── CLAUDE.md                  # rules for Claude Code (principles + conventions)
├── .env.example               # every env variable, no real values
├── web/                       # frontend (React + Vite + TypeScript + Tailwind)
│   └── src/
│       ├── pages/             # Landing, Scan, Report, Dashboard, Verify, Pricing, Settings
│       ├── components/        # buttons, cards, grade ring, finding row
│       ├── lib/               # supabase client, api calls, formatters
│       └── styles/tokens.css  # design tokens (colours, type, spacing)
├── supabase/
│   ├── migrations/            # SQL: tables, RLS policies, indexes (numbered, never edited after merge)
│   ├── seed.sql               # test data for local development
│   └── functions/
│       ├── _shared/
│       │   ├── scanner/       # THE SCAN ENGINE (pure, no database code)
│       │   │   ├── types.ts       # Check, Finding, ScanContext, Severity
│       │   │   ├── runner.ts      # runs checks with timeouts, collects findings
│       │   │   ├── safeFetch.ts   # the ONLY way the engine touches the network
│       │   │   ├── collect.ts     # loads page, bundles, headers once
│       │   │   ├── score.ts       # severity weights -> grade
│       │   │   └── checks/        # one file per check + its test
│       │   ├── db.ts          # service-role client (server only)
│       │   ├── config.ts      # limits, plans, timeouts
│       │   └── validate.ts    # Zod schemas
│       ├── create-scan/       # validates input, checks quota, inserts scan, starts run
│       ├── run-scan/          # runs engine, saves findings, sets status
│       ├── verify-site/       # checks DNS TXT or /.well-known file
│       ├── billing-webhook/   # Lemon Squeezy events
│       └── weekly-rescan/     # called by pg_cron for monitored sites
├── fixtures/                  # deliberately vulnerable + safe test pages
└── .github/workflows/ci.yml   # lint, typecheck, tests on every push
```

**Hosting:** `web/` deploys to Cloudflare Pages (free, commercial use allowed). Everything under `supabase/` deploys to Supabase.

## Data model and row-level security

Six tables in Postgres (Supabase). Every table has RLS switched on in the same migration that creates it.

| Table            | Key columns                                                                                                                                                         | Purpose                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `profiles`       | `id` (= auth user id), `email`, `created_at`                                                                                                                        | One row per user, created by a trigger on sign-up        |
| `sites`          | `id`, `user_id`, `url`, `host`, `platform`, `verify_token`, `verified_at`, `monitored`                                                                              | Apps a user has added; `verified_at` unlocks deep checks |
| `scans`          | `id`, `site_id`, `user_id`, `kind` (passive/deep), `status` (queued/running/done/failed), `grade`, `score`, `started_at`, `finished_at`, `error_code`               | One row per scan run                                     |
| `findings`       | `id`, `scan_id`, `check_id`, `severity` (critical/high/medium/low/info), `title`, `explanation`, `evidence_redacted`, `fix_prompt`, `status` (fail/pass/incomplete) | The results of a scan                                    |
| `subscriptions`  | `user_id`, `plan`, `status`, `provider_customer_id`, `provider_subscription_id`, `current_period_end`                                                               | Written only by the billing webhook                      |
| `billing_events` | `event_id` (unique), `type`, `received_at`                                                                                                                          | Stops a webhook being processed twice                    |

**RLS policies**

- `profiles`, `sites`, `scans`, `findings`, `subscriptions`: a user may **select** only rows where `user_id = auth.uid()` (findings via a join to their scan).
- Users may **insert and update** only `sites` (url, monitored), and never `verified_at`.
- `scans`, `findings`, `subscriptions`, `billing_events`: **no** insert, update or delete for users. Only Edge Functions with the service role write them.
- Anonymous free scans: stored with `user_id` null and returned to the browser once by `create-scan`; they cannot be listed by anyone.

**Data rules**

- Never store a full secret. `evidence_redacted` keeps the first 4 and last 4 characters only (`sk_l…x9Q2`).
- Never store rows read from a customer's database: only the table name and a yes/no "readable while logged out".
- Delete scans and findings older than 90 days for free users (pg\_cron job).
- Indexes on every foreign key and on `scans(site_id, started_at desc)`.

## Scan engine

The engine collects the page once, then runs each check in parallel against that snapshot, each with its own time limit.

**The contract every check follows**

```ts
type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

interface Finding {
  checkId: string;
  status: 'fail' | 'pass' | 'incomplete';
  severity: Severity;
  title: string; // short, plain English
  explanation: string; // why it matters, no jargon
  evidenceRedacted?: string;
  fixKey: string; // which fix-prompt template to use
}

interface ScanContext {
  url: URL;
  html: string;
  headers: Headers;
  bundles: { url: string; body: string }[]; // capped size
  platform: 'lovable' | 'bolt' | 'replit' | 'v0' | 'vercel' | 'netlify' | 'unknown';
  backend: { supabase?: { url: string; anonKey: string }; firebase?: { projectId: string } };
  verified: boolean;
  fetch: SafeFetch; // the only network access allowed
}

interface Check {
  id: string;
  title: string;
  requiresVerification: boolean;
  timeoutMs: number;
  run(ctx: ScanContext): Promise<Finding[]>;
}
```

**v1 checks**

| Check id                 | What it looks for                                                                                                                                                                                                              | Needs verification | Severity if failed |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------ |
| `secret-in-bundle`       | Private keys in the JavaScript sent to browsers (OpenAI, Anthropic, Stripe secret, Supabase service\_role, AWS, Resend, GitHub tokens). Public-by-design keys (Supabase anon, Stripe `pk_`, Firebase apiKey) are allow-listed. | No                 | Critical           |
| `supabase-public-tables` | Using only the app's own public anon key: can common or discovered tables be read while logged out? Read-only, `limit=1`, no rows kept.                                                                                        | Yes                | Critical           |
| `firebase-open-rules`    | Firestore/Realtime Database readable without sign-in (single read-only request).                                                                                                                                               | Yes                | Critical           |
| `exposed-files`          | `/.env`, `/.git/config`, backup files reachable. Response must look like the real file, not the app's catch-all page.                                                                                                          | No                 | Critical           |
| `source-maps`            | `.map` files published, exposing original source code.                                                                                                                                                                         | No                 | Medium             |
| `security-headers`       | Content-Security-Policy, Strict-Transport-Security, X-Frame-Options or frame-ancestors, X-Content-Type-Options, Referrer-Policy.                                                                                               | No                 | Low to medium      |
| `https`                  | HTTP redirects to HTTPS; certificate valid.                                                                                                                                                                                    | No                 | High               |
| `cookie-flags`           | Session cookies missing Secure, HttpOnly or SameSite.                                                                                                                                                                          | No                 | Medium             |
| `platform-detect`        | Identifies builder and backend so fix prompts are tailored.                                                                                                                                                                    | No                 | Info               |

**Runner rules**

- Collect phase: fetch the page and up to 25 script bundles, max 5 MB total, 10 seconds total.
- Checks run with `Promise.allSettled`; each is wrapped in its own timeout (default 8 seconds).
- An error or timeout returns `status: 'incomplete'`, never `pass`.
- Whole scan must finish in under 60 seconds. If later checks need longer, move `run-scan` to a small worker server; the engine code does not change.

## Safety, legal and security guardrails

A security tool that is itself insecure or abusable ends the business, so these rules are non-negotiable.

**Scanning only what the user owns**

- Passive checks (what any browser already downloads) can run on any URL.
- Deep checks (`requiresVerification: true`) run only after the user proves ownership: a DNS TXT record `scanner-verify=<token>` or a file at `/.well-known/scanner-verify.txt`.
- Every check is read-only: GET requests only, no form submits, no writes, no brute force, no login attempts.
- Users accept terms on sign-up: they scan only apps they own or are authorised to test.

**Protecting our own servers (`safeFetch`)**

- Block requests to private and internal addresses: localhost, 10.x, 172.16–31.x, 192.168.x, 169.254.x (cloud metadata), IPv6 private ranges. Check after DNS lookup and after every redirect.
- Only `http` and `https`, ports 80 and 443, max 5 redirects, max 2 MB per response, 8-second timeout.
- Identify ourselves with a clear User-Agent, for example `ScannerBot/1.0 (+https://<domain>/bot)`.

**Abuse limits**

- Free scans: 3 per day, counted per account and per IP address (whichever is reached first), resetting at midnight UTC. The limit lives in config.ts. Same host rescanned at most once per 10 minutes.
- Captcha (Cloudflare Turnstile, free) on the anonymous scan form.

**Secrets and keys**

- Service-role key, LLM key and billing secret live only in Supabase function secrets. Never in `web/`, never in git.
- Leaked keys found in a user's app are redacted before saving and never sent to the LLM.

**Legal pages before launch:** Terms of Service (authorised use, "not a penetration test", no guarantee), Privacy Policy, Responsible Disclosure page.

## Scoring and fix prompts

The score starts at 100 and loses points per failed finding; any critical caps the grade at D.

| Severity | Points lost each |
| -------- | ---------------- |
| Critical | 40               |
| High     | 20               |
| Medium   | 8                |
| Low      | 3                |
| Info     | 0                |

Grades: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F below 40. Any critical caps at D; two or more criticals = F. Incomplete checks are shown but not scored, with a note that the grade is partial. Weights live in `config.ts` so they can be tuned.

**Fix prompts (the main selling point)**

1. Each check has a hand-written template per platform (Lovable, Bolt, Cursor, generic), stored in `checks/<id>.fix.ts`.
2. The template is filled with safe details: table name, header name, file path. Never a secret value.
3. Optional: an LLM call rewrites the filled template into friendlier wording. If the LLM fails, the template is shown as is.
4. Results are cached by `checkId + platform + details`, so repeated issues cost nothing.
5. Each prompt ends with a verification step: "After the fix, rescan to confirm."

## Payments and plans

Lemon Squeezy handles checkout, tax and payouts; our app only listens to its webhooks. Prices below are starting points to test.

| Plan      | Price       | What it unlocks                                                                              |
| --------- | ----------- | -------------------------------------------------------------------------------------------- |
| Free      | $0          | Passive scan, grade and issue count by severity, titles of the top 3 issues                  |
| Deep scan | $15 one-off | Verified deep checks, full report, all fix prompts, PDF export, one rescan within 7 days     |
| Monitor   | $19/month   | Up to 3 sites, weekly automatic rescans, email alert when a new issue appears, score history |

**Webhook rules (`billing-webhook`)**

- Verify the signature on every request; reject anything unsigned.
- Record `event_id` in `billing_events` first; if it already exists, return 200 and do nothing (idempotent).
- Handle: `order_created` (deep scan credit), `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_failed`.
- Access is always decided by reading `subscriptions` in the database, never by trusting the browser.

**Before building billing:** confirm Lemon Squeezy (or Paddle) pays out to your bank or PayPal from Uganda.

## Frontend: Apple design principles

The interface follows Apple's Human Interface Guidelines: clarity, deference to content, and depth only where it explains structure.

**Design rules**

- **Clarity:** one primary action per screen. Plain words, no security jargon ("Anyone can read your users table", not "RLS misconfiguration").
- **Deference:** the grade and findings are the hero; chrome stays quiet. Lots of white space, no decorative gradients.
- **Depth:** subtle layering only to show hierarchy (a report card above the page, an expanded finding).
- **Type:** system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif`). Scale: 34 / 28 / 22 / 17 (body) / 15 / 13.
- **Spacing:** 8-point grid. Corner radius 12 for cards, 8 for buttons.
- **Colour:** neutral greys plus one accent (system blue). Severity colours are semantic and used only for severity: red critical, orange high, yellow medium, grey low.
- **Light and dark mode** from day one, using design tokens in `tokens.css`.
- **Accessibility:** WCAG AA contrast, 44 × 44 px minimum tap targets, full keyboard use, visible focus rings, respects reduced-motion. Severity is never shown by colour alone (icon + word too).
- **Motion:** short (200–300 ms), purposeful: progress steps, expanding findings. No bouncing.
- **Mobile first:** every screen works at 375 px wide.

**Screens**

| Screen           | Purpose            | Key elements                                                                                                                           |
| ---------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Landing          | Start a free scan  | Headline, one URL field, "Scan my app" button, 3 trust points, sample report                                                           |
| Scan in progress | Show it is working | Live checklist of steps ticking off, about 30 seconds                                                                                  |
| Report           | Show the result    | Grade ring, plain summary sentence, findings grouped by severity, each expands to explanation, evidence and a "Copy fix prompt" button |
| Verify site      | Unlock deep scan   | Two tabs (DNS record or file), copy buttons, "Check now"                                                                               |
| Dashboard        | Return visits      | Sites list with latest grade, score trend, "Rescan"                                                                                    |
| Pricing          | Upgrade            | Three plan cards, Monitor highlighted                                                                                                  |
| Settings         | Account            | Email, plan, billing portal link, delete account                                                                                       |

**Frontend rules:** the browser uses only the public Supabase key; all scan starts go through `create-scan`; every screen has loading, empty and error states.

## Quality: testing, CI and monitoring

Nothing is "done" until its tests pass in CI.

- **Check tests:** each check has at least one failing fixture and one passing fixture in `fixtures/`. False positives are bugs.
- **Test app:** build one deliberately insecure Lovable app (exposed key, open table, no headers) and one fixed version. Scan both before every release; results must match expectations.
- **Database tests:** a test per RLS policy proving user A cannot read user B's sites, scans or findings.
- **Webhook tests:** duplicate event, bad signature, cancelled subscription.
- **CI (GitHub Actions):** lint (ESLint), format check (Prettier), typecheck, unit tests on every push. Main branch only merges when green.
- **Environments:** local (Supabase CLI) and production. Never test against production data.
- **Monitoring:** Sentry free tier for frontend and function errors; a daily count of failed scans; uptime check on the landing page.
- **Logs:** structured logs with `scan_id`; never log secrets, tokens or full URLs with query strings.

## Securing the scanner itself

The scanner is a target: it fetches attacker-controlled URLs, parses attacker-controlled code and holds paying users' data. It must pass every check it sells, and more.

**Threat model: what attackers will try**

| Threat                             | Example                                                                                             | Control                                                                                                                                                   |
| ---------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server-side request forgery (SSRF) | Submit `http://169.254.169.254` or a domain that resolves to an internal IP to reach cloud metadata | `safeFetch`: resolve DNS, block private, loopback, link-local and IPv6 private ranges; re-check after every redirect; pin the resolved IP for the request |
| Malicious content                  | A page that returns a 2 GB bundle, an endless stream or a zip bomb                                  | Byte caps, timeouts, no decompression beyond the cap, never execute fetched JavaScript                                                                    |
| Stored XSS in our report           | A scanned page puts `<script>` in its title or a header value we display                            | Treat every scanned string as untrusted: render as text only, never `dangerouslySetInnerHTML`; strict CSP on our site                                     |
| Using us to attack others          | Thousands of scans against one victim                                                               | Rate limits per IP, account and target host; captcha; read-only checks; deep checks only after ownership is verified                                      |
| Verification bypass                | Claiming a domain they do not own                                                                   | Random 32-byte token per site, checked server-side over DNS and HTTPS, re-checked before each deep scan; tokens expire after 7 days                       |
| Broken access control              | User A reading user B's report by changing an id                                                    | RLS on every table, UUIDs not counting numbers, RLS tests in CI                                                                                           |
| Billing fraud                      | Forged webhook granting a paid plan                                                                 | Signature verification, idempotency table, plan read only from the database                                                                               |
| Secret leakage                     | Our service-role or LLM key in the frontend or git                                                  | Secrets only in Supabase function secrets; secret scanning (Gitleaks) in CI; our own scanner run on our own site                                          |
| Prompt injection                   | A scanned page contains text telling the LLM to write a harmful fix prompt                          | Only our template and safe structured fields go to the LLM, never raw page content; output length-capped and shown as plain text                          |
| Supply chain                       | A compromised npm package                                                                           | Lockfile committed, few dependencies, Dependabot alerts, `npm audit` in CI, pinned versions                                                               |
| Account takeover                   | Weak passwords, credential stuffing                                                                 | Supabase Auth with email magic links or OAuth (no passwords to leak), session expiry, rate-limited sign-in                                                |

**OWASP Top 10 coverage** (the industry's standard list of web risks)

| Risk                            | Where it is handled                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| Broken access control           | RLS policies + tests                                                                   |
| Cryptographic failures          | HTTPS only, HSTS, Supabase-managed encryption at rest, secrets redacted                |
| Injection                       | Supabase client parameterised queries only, no raw SQL from user input, Zod validation |
| Insecure design                 | This threat model, reviewed at every milestone                                         |
| Security misconfiguration       | Strict headers on our site, Supabase Security Advisor clean, least-privilege keys      |
| Vulnerable components           | Dependabot, `npm audit`, minimal dependencies                                          |
| Authentication failures         | Supabase Auth, magic links, rate limits                                                |
| Integrity failures              | Signed webhooks, lockfile, CI-only deploys                                             |
| Logging and monitoring failures | Structured logs, Sentry, alerts on failed scans and spikes                             |
| SSRF                            | `safeFetch` (above)                                                                    |

**Hardening checklist for our own site**

- [ ] Content-Security-Policy with no `unsafe-inline` scripts
- [ ] HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors 'none'
- [ ] Cookies Secure, HttpOnly, SameSite=Lax
- [ ] CORS on Edge Functions allows only our own domain
- [ ] Supabase Security Advisor: zero warnings
- [ ] Our scanner gives our own site an A, every release
- [ ] Before public launch: one independent review (a security-minded developer, or a bug bounty listing) of `safeFetch`, RLS and billing

## Governance and quality by design

Quality is designed in, not inspected in: the same logic as a pharmaceutical quality system, applied to software. Nothing reaches users without passing defined gates, and every change is traceable.

**Roles (segregation of duties)**

| Role                      | Who                                                  | Responsibility                                                                                                  |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Product and quality owner | You                                                  | Approves every merge and release; owns this spec and the change log                                             |
| Builder                   | Claude Code (build session)                          | Writes code and tests for one milestone or change at a time                                                     |
| Independent reviewer      | A separate Claude Code session with no build context | Reviews each change against this spec, the threat model and the principles; reports findings before you approve |
| External reviewer         | A security-minded developer or bug bounty            | Reviews `safeFetch`, RLS and billing before launch and yearly                                                   |

**Critical quality attributes (what "working" means)**

| Attribute           | Target                                                  | How measured                                  |
| ------------------- | ------------------------------------------------------- | --------------------------------------------- |
| Detection rate      | 100% of known issues in the reference apps detected     | Reference suite in CI and daily canary        |
| False positive rate | Under 5% of findings; zero on the "clean" reference app | Reference suite + user "not an issue" reports |
| Scan completion     | 98% of scans finish without `failed`                    | Daily metric from `scans`                     |
| Scan time           | 90% under 45 seconds                                    | `finished_at - started_at`                    |
| Data isolation      | Zero cross-user reads                                   | RLS tests every push                          |
| Availability        | 99.5% landing page and scan start                       | Uptime monitor                                |

**Validation of the scanner (proving it works as intended)**

1. **Reference app suite:** a set of small apps we own, each with known, documented flaws (exposed key, open table, missing headers, exposed .env, source maps), plus one fully fixed app. The expected result for each is written down before testing.
2. **Unit tests:** every check against pass and fail fixtures.
3. **Integration tests:** full scan of each reference app; results must exactly match the expected list.
4. **Acceptance:** you run the scan by hand on the reference apps and confirm the report reads correctly to a non-technical person.
5. **Re-validation:** the whole suite reruns on every change, and fully before every release.

**Change control**

- All work goes through a pull request; `main` is protected: no direct pushes, CI must be green, your approval required.
- Every pull request uses a template: what changed, why, which spec section, risk level (low/medium/high), tests added, rollback plan.
- High-risk changes (anything touching `safeFetch`, RLS, auth, billing, secrets or a check's logic) also need the independent reviewer's sign-off.
- Database migrations are append-only: never edit a merged migration; write a new one.
- Architecture decisions are recorded in `docs/decisions/` (one short file each: context, decision, consequences).

**New check lifecycle**

1. Proposal: the issue it detects, real-world evidence, severity, false-positive risks.
2. Build: fixtures first (pass and fail), then code, then fix-prompt templates.
3. Review: independent reviewer confirms it is read-only and cannot harm the target.
4. Shadow mode: runs in production for 7 days, results logged but hidden from users; false positives reviewed.
5. Live: enabled through `config.ts`; can be switched off instantly without a redeploy.

**Release gates (all must pass before deploy)**

- [ ] CI green: lint, typecheck, unit, RLS and webhook tests
- [ ] Reference suite matches expected results exactly
- [ ] Gitleaks and `npm audit` clean (no high or critical)
- [ ] Our scanner gives our own site an A
- [ ] Change log updated with version number
- [ ] Rollback plan known (previous Cloudflare deploy, previous function version)

**Running checks in production**

- **Daily canary:** a scheduled job scans the reference apps every day. Any change from the expected results triggers an alert. This catches silent breakage, for example when Supabase or Lovable change their behaviour.
- **Kill switches:** each check and the whole deep-scan feature can be switched off in config.
- **User feedback:** every finding has "This isn't right"; each report is reviewed within 48 hours.

**Incidents and CAPA**

- Severity 1 (data exposure, scanner abused, wrong "safe" result on a real breach): disable the affected feature at once, notify affected users within 72 hours, root-cause analysis within 7 days.
- Every incident and every confirmed false positive or missed issue is logged as a deviation, with root cause, corrective action (fix) and preventive action (a new test or reference app so it can never recur).
- Responsible disclosure: acknowledge reports within 48 hours, fix critical issues within 7 days, credit the reporter.

**Data governance**

- Collect the minimum: email, site URLs, findings. No scanned page content kept beyond the scan.
- Retention: free scans 90 days, paid accounts while active plus 30 days. Users can export or delete their data from Settings.
- Privacy policy states exactly this, in plain English.

**Periodic review (monthly)**

Review the quality metrics, deviations, user feedback, dependency alerts and the threat model. Record decisions in the change log. Re-run the external review yearly or after any major change.

## Build milestones

Eight milestones, built in order, each in its own Claude Code session and ending with tests passing and a git commit. Roughly 4–5 weeks part-time.

1. **Foundation:** repo, `CLAUDE.md`, CI, Supabase project, all migrations with RLS and RLS tests, branch protection, pull request template, Gitleaks and npm audit in CI, and the written expected results for the reference app suite. _Done when:_ tests prove users cannot see each other's data.
2. **Engine core:** `types.ts`, `safeFetch` (with private-address blocking), `collect.ts`, `runner.ts`, `score.ts`. _Done when:_ unit tests pass, including a blocked request to 169.254.169.254.
3. **Passive checks:** `secret-in-bundle`, `exposed-files`, `source-maps`, `security-headers`, `https`, `cookie-flags`, `platform-detect`, each with fixtures. _Done when:_ the insecure test app fails and the fixed one passes.
4. **Scan functions:** `create-scan` (validation, rate limits, Turnstile) and `run-scan`. _Done when:_ a URL goes in and findings appear in the database.
5. **Frontend core:** design tokens, Landing, Scan in progress, Report. _Done when:_ a free scan works end to end on phone and desktop, light and dark.
6. **Accounts and verification:** sign-up, Dashboard, Verify site, `verify-site`, then the deep checks (`supabase-public-tables`, `firebase-open-rules`). _Done when:_ deep checks run only on verified sites.
7. **Fix prompts and billing:** templates per platform, LLM rewrite with cache, Pricing page, Lemon Squeezy checkout and `billing-webhook`. _Done when:_ a test purchase unlocks the full report.
8. **Monitoring and launch:** `weekly-rescan` with pg\_cron, email alerts, Sentry, legal pages, Cloudflare deploy. _Done when:_ the launch checklist below is all ticked.

**How to brief Claude Code each session**

- Start with: "Read `CLAUDE.md` and the spec section for milestone N. Plan first, show me the plan, then build. Write tests before code for every check."
- End with: "Run lint, typecheck and tests. Fix anything failing. Summarise what changed and what I should test by hand."
- Never let it skip to the next milestone or add features not in this spec.
- If it proposes changing the architecture, ask it to explain why in plain English before agreeing.

**Launch checklist**

- [ ] Our own Supabase passes its Security Advisor with no warnings
- [ ] Our own site gets an A from our scanner
- [ ] Insecure test app fails, fixed test app passes
- [ ] RLS, webhook and safeFetch tests green
- [ ] Terms, Privacy and Responsible Disclosure pages live
- [ ] Payout account confirmed with the billing provider
- [ ] Supabase upgraded to Pro so the project never pauses
