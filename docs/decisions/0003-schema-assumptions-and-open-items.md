# 0003 — Schema assumptions and items deferred to later milestones

**Context.** Milestone 1 creates all six tables from the spec. A few details are not fixed by
the spec, and some needs belong to later milestones. Migrations are append-only, so these are
added later as new migrations, not by editing these ones.

**Assumptions made now** (change by PR if wrong):

- **Anonymous scans** store `url` and `host` on the `scans` row (they have no `sites` row), so
  per-host rate limits can be counted. `user_id` and `site_id` are null; no policy can match them.
- **Deep scans** must belong to a signed-in user's site (database check constraint).
- **Subscriptions**: one row per user; no row means Free. `plan` is only `monitor` for now;
  the one-off Deep scan is a credit, not a subscription.
- **Users cannot delete sites** in v1 (the spec grants insert and update only). Account
  deletion will go through a server function.
- **Score** is clamped at 0. **Security-header severities** for the reference suite:
  CSP and HSTS medium; frame protection, X-Content-Type-Options and Referrer-Policy low.

**Deferred** (milestone in brackets):

- Per-IP rate-limit storage, e.g. a hashed IP on `scans` [4].
- Deep-scan credits from `order_created` [7].
- **Free-plan gating.** RLS lets owners read all their findings, including `fix_prompt`. The
  "titles of the top 3 only" rule for Free must be enforced server-side, by not storing paid
  content for unpaid scans or by serving it through a function [7].
- Limiting `monitored` to 3 sites on the Monitor plan; `weekly-rescan` must check the plan in
  `subscriptions` and never trust `monitored` alone [8].
- 90-day retention job with `pg_cron` [8].
