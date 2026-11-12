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
- **verify-site** ("Check now"): signed-in owner only. One check per site per 10 seconds, and at
  most 5 other accounts' sites checking the same host per minute (`begin_verify_attempt`), so the
  button cannot be used to hammer someone's server (at most about 30 checks a minute per host).
  A shared per-host cooldown was rejected: one other account could lock the real owner out
  (independent review). Locking the owner out now takes 5 accounts checking non-stop. A successful check is saved only if the site's host and token are still the ones that
  were checked (`set_site_verified`), so changing the URL during a slow check cannot leave a
  different host marked verified (independent review, B1). A code
  that expired before it was used (7 days) is replaced with a new one. A failed check does not
  remove an earlier verification; the re-check before each deep scan does that.
- **Deep scans**: `create-scan` accepts `{ siteId }` from the signed-in owner. A verified site
  gets `kind = 'deep'`. `runScan` then re-checks ownership right before running, and the scan's
  host must be the proven site's host; if the proof is gone, the site loses its verified status
  and the scan runs passive checks only. Deep checks
  never run without that re-check (`verifySite` must be supplied).
- **supabase-public-tables**: only the app's own public anon key, only GET with `select=*&limit=1`,
  only to the app's own Supabase project, at most 20 tables (those the API lists, then common
  names). A table counts as open only when a row comes back; `[]` does not. Only the table name is
  stored, never row data. A table counts as protected only on Postgres's own "permission denied"
  (`42501`) or an empty result; any other refusal (an invalid key, a gateway error), 429/5xx, or
  finding no table at all makes the check **incomplete**, never a pass.
- **firebase-open-rules**: one shallow GET of the Realtime Database root and one `pageSize=1` GET
  for each of 5 common Firestore collections. Open only when data comes back. Protected only on
  Firebase's own permission-denied answer or an empty result; anything else, or no database found,
  is incomplete. Nothing returned is stored. **Owner decision pending:** the spec says "single
  read-only request"; this uses six small ones (one per database or collection).
- **Database**: `site_for_owner`, `begin_verify_attempt`, `set_site_verified`, `rotate_site_token`
  (service role only), plus `sites.last_verify_attempt_at`.

- **Known limit:** ownership is proven for the website, not its backend. A verified owner could put
  someone else's public Supabase or Firebase settings in their page, and the deep checks would read
  that project (about 21 read-only requests; nothing is stored). The keys involved are public by
  design, so this adds little an attacker could not do directly.

**Consequences.**

- A deep scan whose re-check fails keeps `kind = 'deep'` in the database but has no deep
  findings; the report (milestone 6b) must say ownership could not be confirmed.
- Billing (milestone 7) decides who may run deep scans; today any verified owner can, within the
  same daily limits.
