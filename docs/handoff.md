# Handing this project to someone else

This folder is the whole app: the website, the scan engine, the database tables and the tests.
It holds **no keys, passwords or database data**. Whoever receives it plugs in their own
GitHub, Supabase and Cloudflare accounts.

## What state it is in

- Done: milestones 1–5 and 6a (free passive scan end to end, ownership verification and the two
  deep checks on the server). See `CHANGELOG.md`.
- Next: milestone 6b (sign-in, dashboard, Verify page), then 7 (fix prompts and billing) and 8.
- Not ready for the public: launch blockers in `docs/launch-blockers.md` are still open. Keep the
  site private (Cloudflare Access) until they are closed.
- Paid plans show "Coming soon" with no price; billing is not built.

## Set up your own copy

1. **GitHub.** Create a new, private, empty repository. Unzip this folder, then from inside it:
   `git init -b main && git add -A && git commit -m "Initial import" && git remote add origin <your repo URL> && git push -u origin main`.
   (Or ask Claude Code to do it.) Then follow `docs/github-setup.md` (branch protection, CI).
2. **Supabase, Turnstile and Cloudflare.** Follow `docs/mvp-testing.md` → "Steps". It covers
   creating the Supabase project and tables, the function secrets, deploying the functions, the
   Turnstile keys and hosting the website on Cloudflare. Use your own addresses everywhere.
3. **Check it works.** `docs/mvp-testing.md` → "What to test".

Never put the Supabase `service_role` key in the website, in Cloudflare, or in a chat.

## Working on it with Claude Code

Open the repository in Claude Code. It reads `CLAUDE.md` (the rules) and `docs/spec.md`
(the spec, which wins over everything else). A good first message:

> Read CLAUDE.md and docs/spec.md, run the checks in README.md, and tell me what state the
> project is in. Then plan milestone 6b and show me the plan before building.

To run the checks locally you need Node 22.12+; the database tests also need a throwaway
Postgres (see `README.md`).
