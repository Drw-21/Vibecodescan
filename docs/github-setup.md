# GitHub settings (manual, one-off)

These are repository settings, not code, so the repository owner sets them by hand.

## Protect `main`

Settings → Branches → Add branch ruleset (or classic protection rule) for `main`:

- Require a pull request before merging, with **1 approval**.
- Require status checks to pass: **Lint, format, typecheck, unit tests, audit**, **RLS tests**, **Secret scan (Gitleaks)**.
- Require branches to be up to date before merging.
- Block force pushes and deletions.
- Do not allow bypassing the above (include administrators).

## Security features

Settings → Code security: turn on **Dependabot alerts**, **Dependabot security updates** and
**Secret scanning** (with push protection).
