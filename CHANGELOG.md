# Changelog

All notable changes. Version numbers follow `MAJOR.MINOR.PATCH`.

## 0.1.0 — Milestone 1: Foundation (unreleased)

- Repository layout, `CLAUDE.md`, `.env.example`, pull request template, Dependabot.
- CI: ESLint, Prettier, typecheck, unit tests, `npm audit` (high/critical), RLS tests on Postgres 16, Gitleaks over full history.
- Migrations for `profiles`, `sites`, `scans`, `findings`, `subscriptions`, `billing_events`, each with RLS on and API-role grants revoked by default.
- RLS tests proving users cannot read or change each other's data, plus schema guards (RLS on every table, index on every foreign key).
- Written expected results for the reference app suite (`fixtures/reference-apps/expected-results.json`).
