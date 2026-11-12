# 0009 — Ownership verification and deep checks (milestone 6a)

**Context.** Deep checks touch the founder's own backend (Supabase or Firebase), so the spec
allows them only after ownership is proven, and asks for the proof to be re-checked before
every deep scan.

**Decisions.**

- **Proof** (`_shared/verify.ts`): a DNS TXT record `scanner-verify=<token>` on the site's host,
  or a file at `https://<host>/.well-known/scanner-verify.txt` whose whole content is
  `scanner-verify=<token>` or the bare token. Tokens are 32 random bytes (64 hex characters).
  - The file must come from the site's own host over HTTPS. A redirect to another host does not
    count (an open redirect on a victim's site could otherwise point at an attacker's file).
  - The token must be the whole file, so a catch-all app page can never pass.
  - The stored host must equal what a URL parser reads from the stored URL (ADR 0002).
  - Anything uncertain (timeouts, DNS errors) means "not verified".
- **verify-site** ("Check now"): signed-in owner only; one check per site per 10 seconds
  (`begin_verify_attempt`), so the button cannot be used to hammer someone's server. A code
  that expired before it was used (7 days) is replaced with a new one. A failed check does not
  remove an earlier verification; the re-check before each deep scan does that.
- **Deep scans**: `create-scan` accepts `{ siteId }` from the signed-in owner. A verified site
  gets `kind = 'deep'`. `runScan` then re-checks ownership right before running; if the proof is
  gone, the site loses its verified status and the scan runs passive checks only. Deep checks
  never run without that re-check (`verifySite` must be supplied).
- **supabase-public-tables**: only the app's own public anon key, only GET with `select=*&limit=1`,
  only to the app's own Supabase project, at most 20 tables (those the API lists, then common
  names). A table counts as open only when a row comes back; `[]` does not. Only the table name is
  stored, never row data. 429/5xx answers make the check incomplete.
- **firebase-open-rules**: one shallow GET of the Realtime Database root and one `pageSize=1` GET
  for each of 5 common Firestore collections. Open only when data comes back. Nothing returned is
  stored.
- **Database**: `site_for_owner`, `begin_verify_attempt`, `set_site_verified`, `rotate_site_token`
  (service role only), plus `sites.last_verify_attempt_at`.

**Consequences.**

- A deep scan whose re-check fails keeps `kind = 'deep'` in the database but has no deep
  findings; the report (milestone 6b) must say ownership could not be confirmed.
- Billing (milestone 7) decides who may run deep scans; today any verified owner can, within the
  same daily limits.
