# 0006 — How create-scan and run-scan work

**Context.** Milestone 4 turns the engine into a service: a URL goes in, findings come out
in the database. Several details are not fixed by the spec.

**Decisions.**

- **Anonymous results are returned by create-scan, synchronously.** RLS stops anonymous
  visitors reading `scans` at all (milestone 1), so they cannot watch the row. For them,
  `create-scan` waits for the scan (well under the Edge Function wall-clock limit) and returns
  the Free summary once: grade, score, counts by severity, titles of the top 3 issues. Nothing
  else (explanations, evidence) leaves the server for an anonymous scan. Signed-in users get
  `202 { scanId }` at once; the scan runs in the background (`EdgeRuntime.waitUntil`) and the
  browser watches its row.
- **One `runScan` step, two callers.** `create-scan` calls it directly in the background
  instead of making an HTTP call to `run-scan`, so the service-role key is never sent between
  functions. The `run-scan` endpoint wraps the same step for internal callers (weekly-rescan in
  milestone 8). It accepts only the service-role key, compared in constant time.
- **The rules live in SQL functions, called only by the service role.**
  `create_scan_with_limits`, `claim_scan`, `complete_scan`, `fail_scan` (migration
  20261106000100). Each runs in one transaction: limits cannot be raced past (an advisory lock
  serialises scan creation), a scan is claimed once (running it twice does nothing), and findings
  plus grade are saved all-or-nothing. They sit in `public` so the Supabase client can call them,
  with EXECUTE revoked from everyone else; the schema guard now fails on any public function an
  API role can execute.
- **Rate limits** come from `config.ts`: 3 free scans per UTC day per account **and** per IP,
  and one scan per host per 10 minutes **whoever asks** (it protects the target). Failed scans
  count too. The IP is stored only as an HMAC-SHA256 with a server secret (`IP_HASH_SECRET`).
- **URLs** are normalised before anything else: `https://` added if missing; query string,
  fragment, credentials and non-default ports refused or dropped; only public domain names
  (no IP addresses, no single-label names). `safeFetch` still has the final say.
- **The whole scan** must finish in 55 seconds (`SCAN.maxDurationMs`), else it fails with
  `scan_timeout`. Errors are stored as short codes (`fetch_blocked_address`, `scan_timeout`,
  `internal`) and shown to users in plain English.
- **DNS**: the production resolver asks for both A and AAAA records. "No records of this type"
  is fine; any other lookup failure fails the request rather than guessing.
- **Testing without a Supabase stack.** Handlers take their dependencies as arguments. The
  Supabase adapter (`db.ts`) is tested against a fake HTTP server for the exact calls it makes;
  the SQL functions are tested on Postgres; and an end-to-end test runs the real handler,
  `runScan`, engine and SQL functions together (`tests/db/e2e-scan.test.ts`).

**Consequences.**

- Deep scans are not started yet; `runScan` always runs with `verified: false` until
  milestone 6 adds re-verification before each deep scan.
- Paid plans (milestone 7) will need their own limits in `create_scan_with_limits`.
- A scan stuck in `running` (for example the function was killed) stays there; a clean-up job
  belongs with the other scheduled jobs in milestone 8.
- Before launch, deploy once to a real Supabase project and run a scan by hand (see
  `docs/launch-blockers.md`).
