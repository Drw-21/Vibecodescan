# Launch blockers

Items that must be done before public launch, on top of the spec's launch checklist
(`docs/spec.md` → "Launch checklist"). Each names the milestone expected to close it.
Remove an item only in the pull request that closes it.

| #   | Blocker                                                                                                                                                   | Why                                                                                                                                 | Closes in                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | `runScan` uses a transport that connects to the exact address `safeFetch` checked (DNS pinning)                                                           | Without it, DNS rebinding bypasses the private-address checks (ADR 0004)                                                            | a worker server, before 8 |
| 4   | Deploy create-scan and run-scan to a real Supabase project once, set every secret in `.env.example`, and run one anonymous and one signed-in scan by hand | The SQL functions, adapter and handlers are tested separately and together on Postgres, but never yet against a real Supabase stack | 8                         |

Closed: 2 — production resolver returning every A and AAAA address (milestone 4);
3 — 55-second whole-scan limit (milestone 4).
