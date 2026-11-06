# Testing the MVP (milestones 1–5)

What works now: anyone can paste an app's address, pass the "I am human" check, and get a free
grade with issue counts and the top 3 issues, from the 7 passive checks.

Not yet built: accounts, ownership verification, deep checks, the full report with fix prompts,
payments, weekly rescans.

> **Keep the MVP private.** Launch blocker 1 (DNS pinning, `docs/launch-blockers.md`) is still
> open. Keeping the link to yourself is not enough, because the website and the scan function
> are still reachable by anyone who finds them. Put the website behind **Cloudflare Access**
> (free for up to 50 people: Zero Trust → Access → Applications → add your Pages site, allow
> only your own email addresses) until that blocker is closed.

## What you need (all free)

| Service                                                  | What for                        | What to copy                                                                      |
| -------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------- |
| Supabase (supabase.com)                                  | Database and the scan functions | Project URL, the **legacy `anon` public key** (it starts with `eyJ`), project ref |
| Cloudflare Turnstile (dash.cloudflare.com → Turnstile)   | The "I am human" check          | Site key, secret key                                                              |
| Cloudflare Pages (dash.cloudflare.com → Workers & Pages) | Hosting the website             | Your site's production address, e.g. `https://scanner.pages.dev`                  |

You never need the Supabase `service_role` key: the scan functions receive it automatically.
Never copy it anywhere, never put it in Cloudflare, and never paste any key into a chat.

## Steps

Steps 2 and 4 need a computer with a terminal (Claude Code can do those two for you in a later
session; it will ask for a Supabase access token through a secure form). Steps 1, 3, 5 and 6 are
done in web dashboards.

1. **Create the Supabase project.** Supabase dashboard → New project. Save the database
   password it asks for in your password manager. Wait until the project is ready.
2. **Create the database tables.** In this repository folder:
   `npx supabase login`, then `npx supabase link --project-ref <your project ref>` (it asks for
   the database password from step 1), then `npx supabase db push`.
3. **Set the function secrets in the dashboard.** Supabase → Edge Functions → Secrets → add:
   - `TURNSTILE_SECRET_KEY`: the Turnstile **secret** key
   - `IP_HASH_SECRET`: any long random text (e.g. from a password generator)
   - `SCANNER_BOT_DOMAIN`: your site's domain, e.g. `scanner.pages.dev`
   - `SITE_ORIGIN`: your site's production address exactly, with `https://` and **no** slash at
     the end, e.g. `https://scanner.pages.dev`. Test on this address, not on Cloudflare's preview
     addresses (`<code>.scanner.pages.dev`), which will be refused.
4. **Deploy the scan functions:** `npx supabase functions deploy create-scan run-scan`.
5. **Put the website on Cloudflare Pages.** Connect this GitHub repository.
   - Build command: `npm ci && npm run web:build`
   - Output folder: `web/dist`
   - Environment variables: `NODE_VERSION` = `22`, `VITE_SUPABASE_URL` (the project URL),
     `VITE_SUPABASE_ANON_KEY` (the legacy **anon** key starting with `eyJ`, never the
     service_role key), `VITE_TURNSTILE_SITE_KEY` (the Turnstile **site** key).
   - The build stops with a clear message if one of the three `VITE_` values is missing.
6. **Tell Turnstile your site's domain** (Turnstile → your widget → Hostnames), so the human
   check works there. Then set up Cloudflare Access as described at the top.

## What to test

1. **A safe app.** Scan an app you own that you believe is fine. Expect A or B.
2. **A known-bad app.** Make a throwaway Lovable app, put a fake key in its code
   (e.g. `const key = "sk-proj-…"`), publish it, scan it. Expect a Critical issue and a D or F.
3. **Limits.** Scan 4 different apps from the same Wi-Fi in one day: the 4th must be refused.
   Scan the same app twice within 10 minutes: the 2nd must be refused.
4. **Bad input.** Try `localhost`, `192.168.1.1` and `not a website`: each must be refused
   politely, and what you typed must still be in the box.
5. **Phone and dark mode.** Open the site on your phone, in light and dark mode.
6. **Launch blocker 4 checks** (`docs/launch-blockers.md`): note anything odd and tell Claude
   Code in the next session.

Write down anything that reads wrong to a non-technical person: the spec's acceptance step is
that the report reads correctly to someone like you.
