# Launch blockers

Items that must be done before public launch, on top of the spec's launch checklist
(`docs/spec.md` → "Launch checklist"). Each names the milestone expected to close it.
Remove an item only in the pull request that closes it.

| #   | Blocker                                                                                          | Why                                                                                             | Closes in                      |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| 1   | `run-scan` uses a transport that connects to the exact address `safeFetch` checked (DNS pinning) | Without it, DNS rebinding bypasses the private-address checks (ADR 0004)                        | 4, or a worker server before 8 |
| 2   | A production `Resolver` that returns **all** A and AAAA addresses, stops on abort, and has tests | `safeFetch` refuses a host if any address is private, which only works if it sees every address | 4                              |
| 3   | `run-scan` enforces the 60-second whole-scan limit                                               | Each check has its own time limit, but nothing caps the total yet                               | 4                              |
