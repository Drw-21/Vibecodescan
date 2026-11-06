# Scanner

Scans a founder's live, AI-built app (Lovable, Bolt, Replit, v0, Cursor) and returns a
plain-English security report with copy-paste fix prompts. Working name; rename before launch.

- Spec: [`docs/spec.md`](docs/spec.md)
- Rules for contributors and Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)

## Status

Milestones 1–4 merged; milestone 5 (frontend) in review. To try the MVP, follow
[`docs/mvp-testing.md`](docs/mvp-testing.md). See `CHANGELOG.md`.

## Run the checks locally

Needs Node 22.12+ and, for the database tests, a throwaway Postgres 15+ (CI uses 17).

```bash
npm ci
npm run lint && npm run format:check && npm run typecheck && npm test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/scanner_test npm run test:db
npm run web:dev        # the website on http://localhost:5173
npm run e2e            # browser test of a whole free scan
```

`test:db` drops and rebuilds the target database and refuses to run against a Supabase instance.
