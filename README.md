# Scanner

Scans a founder's live, AI-built app (Lovable, Bolt, Replit, v0, Cursor) and returns a
plain-English security report with copy-paste fix prompts. Working name; rename before launch.

- Spec: [`docs/spec.md`](docs/spec.md)
- Rules for contributors and Claude Code: [`CLAUDE.md`](CLAUDE.md)
- Decisions: [`docs/decisions/`](docs/decisions/)
- Changes: [`CHANGELOG.md`](CHANGELOG.md)

## Status

Milestones 1–3 merged (foundation, engine core, passive checks); milestone 4 (scan
functions) in review. See `CHANGELOG.md`.

## Run the checks locally

Needs Node 22.12+ and, for the database tests, a throwaway Postgres 15+ (CI uses 17).

```bash
npm ci
npm run lint && npm run format:check && npm run typecheck && npm test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/scanner_test npm run test:db
```

`test:db` drops and rebuilds the target database and refuses to run against a Supabase instance.
