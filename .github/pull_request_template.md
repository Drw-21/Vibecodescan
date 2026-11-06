## What changed

<!-- One or two sentences, plain English. -->

## Why

<!-- The problem this solves. -->

## Spec section

<!-- e.g. "Build milestones → 2. Engine core" or "Data model and row-level security" -->

## Risk level

- [ ] Low
- [ ] Medium
- [ ] High — touches `safeFetch`, RLS / migrations, auth, billing, secrets, or a check's logic

High risk needs the **independent reviewer's** sign-off (a separate Claude Code session with no build context) before approval.

- [ ] Independent review done (link or summary):

## Tests added

<!-- Which tests prove this works, and which would fail without this change. -->

## Rollback plan

<!-- e.g. "Revert this PR; redeploy previous Cloudflare build / previous function version". Migrations are append-only: rollback = a new migration. -->

## Checklist

- [ ] CI green (lint, format, typecheck, unit, RLS tests, Gitleaks, npm audit)
- [ ] No secrets, tokens or real customer URLs in code, tests or logs
- [ ] No merged migration edited (new migration instead)
- [ ] `CHANGELOG.md` updated
- [ ] Decision recorded in `docs/decisions/` if architecture changed
