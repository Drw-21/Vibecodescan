# 0008 — Host the website as a Cloudflare Worker with static assets

**Context.** The spec names Cloudflare Pages for `web/`. When the owner connected the repository,
Cloudflare's dashboard created a **Worker** (static assets), which is now Cloudflare's default
for new sites. With no settings in the repository, Cloudflare guessed the wrong output folder, and
the build failed.

**Decision.** Keep the Worker. `wrangler.jsonc` at the repository root says how to build
(`npm run web:build`) and serve (`web/dist`, single-page-app fallback) the site. There is no server
code: the Worker only serves static files. Our security headers stay in `web/public/_headers`,
which Workers static assets apply the same way Pages does. Build-time `VITE_` values are set in
the Worker's build settings.

**Consequences.**

- Same cost (free), same automatic deploys from `main`, same security headers.
- The site's address is `*.workers.dev` instead of `*.pages.dev`; `SITE_ORIGIN`, Turnstile and
  Cloudflare Access use that address.
- Checked with `wrangler deploy --dry-run` (wrangler 4.160.1): it builds the site and reads all 6
  files from `web/dist`, including `_headers`. The first real deploy must still be checked by
  scanning our own site (it must get an A).
