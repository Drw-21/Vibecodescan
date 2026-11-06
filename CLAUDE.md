# CLAUDE.md — rules for every Claude Code session

Scanner scans a founder's live, AI-built app and returns a plain-English security
report with copy-paste fix prompts. The full spec is `docs/spec.md`; it wins over
anything else. Do not add features that are not in the spec.

## How each session works

- Work on **one milestone** (or one change) per session. Never skip ahead.
- Read this file and the spec section for the milestone. **Plan first**, show the plan, then build.
- **Tests before code** for every check: a failing fixture and a passing fixture first.
- If you want to change the architecture, explain why in plain English and wait for approval.
- Finish with: `npm run lint && npm run format:check && npm run typecheck && npm test && npm run test:db`.
  Fix anything failing. Summarise what changed and what the owner should test by hand.
- All work goes through a pull request using `.github/pull_request_template.md`.

## Engineering principles

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

## Conventions

**Layout**

- `supabase/functions/_shared/scanner/` — the scan engine. Pure: no database, billing or UI imports. The only network access is `safeFetch`.
- `supabase/functions/<name>/` — Edge Functions (Deno). Only these use the service role.
- `supabase/migrations/` — SQL, named `YYYYMMDDHHMMSS_name.sql`. **Append-only**: never edit a merged migration; write a new one.
- `web/` — React + Vite + TypeScript + Tailwind. Uses only the public anon key.
- `fixtures/` — deliberately vulnerable and safe test pages; `fixtures/reference-apps/expected-results.json` is the written expected result for the reference suite.
- `tests/unit/` (Vitest, no network) and `tests/db/` (RLS tests against a throwaway Postgres).
- `docs/decisions/` — one short file per architecture decision (context, decision, consequences).

**Database**

- Every new table: `enable row level security` in the same migration, `revoke all ... from anon, authenticated`, then grant back only what a policy allows.
- Use `(select auth.uid())` in policies (evaluated once per query).
- Functions that must not be API-callable go in the `private` schema, with `set search_path = ''`.
- Every foreign key gets an index. UUID primary keys, never counters.
- Add an RLS test for every new table or policy in `tests/db/rls.test.ts`. The schema-guard tests fail if a table has RLS off or a foreign key has no index.

**Code**

- TypeScript strict, no `any`, no non-null assertions in production code.
- Every string from a scanned site is untrusted: render as text only, never `dangerouslySetInnerHTML`, never sent raw to the LLM.
- Never store or log a full secret. Evidence keeps first 4 + last 4 characters only.
- Logs are structured and carry `scan_id`; never log secrets, tokens or URLs with query strings.
- Checks are read-only: GET requests only, no form submits, no writes, no brute force, no login attempts.
- Pin dependency versions exactly (`.npmrc` has `save-exact`). Add dependencies only when unavoidable.

**Secrets**

- Real values live only in Supabase function secrets or the local, git-ignored `.env`. `.env.example` lists every variable with no value.
- Only `VITE_`-prefixed public values may reach `web/`.

## Commands

```bash
npm ci                 # install exact locked versions
npm run lint           # ESLint (type-aware)
npm run format:check   # Prettier
npm run typecheck      # tsc --noEmit
npm test               # unit tests
deno check --no-lock --config supabase/functions/deno.json 'supabase/functions/**/*.ts'   # Edge Functions under Deno
DATABASE_URL=postgres://postgres:postgres@localhost:5432/scanner_test npm run test:db
                       # RLS tests: DROPS AND REBUILDS that database. Throwaway Postgres only.
```

High-risk areas (need independent review): `safeFetch`, RLS / migrations, auth, billing, secrets, any check's logic.
