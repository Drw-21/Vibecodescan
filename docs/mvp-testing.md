# Testing the MVP (milestones 1–5)

What works now: anyone can paste an app's address, pass the "I am human" check, and get a free
grade with issue counts and the top 3 issues, from the 7 passive checks.

Not yet built: accounts, ownership verification, deep checks, the full report with fix prompts,
payments, weekly rescans.

> **Keep the MVP private.** Launch blocker 1 (DNS pinning, `docs/launch-blockers.md`) is still
> open. Until it is closed, share the link only with people you trust, not publicly.

## What you need (all free)

| Service                                                  | What for                        | What to copy                                                    |
| -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Supabase (supabase.com)                                  | Database and the scan functions | Project URL, `anon` public key, `service_role` key, project ref |
| Cloudflare Turnstile (dash.cloudflare.com → Turnstile)   | The "I am human" check          | Site key, secret key                                            |
| Cloudflare Pages (dash.cloudflare.com → Workers & Pages) | Hosting the website             | Your site's address, e.g. `https://scanner.pages.dev`           |

## Steps

These need a computer with a terminal, or you can ask Claude Code to do steps 2–4 for you: it
will ask for a Supabase access token through a secure form (never paste keys into the chat).

1. **Create the Supabase project.** Supabase dashboard → New project. Wait until it is ready.
2. **Create the database tables.** In this repository folder:
   `npx supabase login`, then `npx supabase link --project-ref <your project ref>`, then
   `npx supabase db push`.
3. **Set the function secrets** (values never go in git):
   `npx supabase secrets set TURNSTILE_SECRET_KEY=… IP_HASH_SECRET=<any long random text> SCANNER_BOT_DOMAIN=<your site's domain> SITE_ORIGIN=https://<your site's address>`
   (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.)
4. **Deploy the scan functions:** `npx supabase functions deploy create-scan run-scan`.
5. **Put the website on Cloudflare Pages.** Connect this GitHub repository.
   - Build command: `npm ci && npm run web:build`
   - Output folder: `web/dist`
   - Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the **anon** key,
     never the service_role key), `VITE_TURNSTILE_SITE_KEY`.
6. **Tell Turnstile your site's domain**, so the human check works there.

## What to test

1. **A safe app.** Scan an app you own that you believe is fine. Expect A or B.
2. **A known-bad app.** Make a throwaway Lovable app, put a fake key in its code
   (e.g. `const key = "sk-proj-…"`), publish it, scan it. Expect a Critical issue and a D or F.
3. **Limits.** Scan 4 different apps from the same Wi-Fi in one day: the 4th must be refused.
   Scan the same app twice within 10 minutes: the 2nd must be refused.
4. **Bad input.** Try `localhost`, `192.168.1.1` and `not a website`: each must be refused politely.
5. **Phone and dark mode.** Open the site on your phone, in light and dark mode.
6. **Launch blocker 4 checks** (`docs/launch-blockers.md`): note anything odd and tell Claude
   Code in the next session.

Write down anything that reads wrong to a non-technical person: the spec's acceptance step is
that the report reads correctly to someone like you.
