# 0004 — safeFetch checks addresses but cannot yet pin them

**Context.** The threat model asks `safeFetch` to resolve DNS, block private addresses,
re-check after every redirect, and **pin the resolved IP for the request**. Supabase Edge
Functions (Deno) only offer the standard `fetch()`, which performs its own DNS lookup. A
hostile DNS server can answer with a public address when we check and a private one a moment
later when `fetch()` connects ("DNS rebinding").

**Decision.**

- `safeFetch` takes two injected dependencies: a `Resolver` (returns all A/AAAA addresses) and
  a `Transport` (sends one GET without following redirects). All rules — scheme, port,
  credentials, every resolved address public, manual redirects re-checked, byte cap, time limit,
  User-Agent — live in `safeFetch` and are unit-tested with a fake network.
- An address is allowed only if it is global unicast and outside every special-purpose range
  (allow-list, `ip.ts`). IPv4-mapped and NAT64 IPv6 addresses are judged by the IPv4 inside them;
  6to4 and Teredo are refused. Anything that does not parse is refused.
- If any address a host resolves to is private, the request is refused.

**Consequences.**

- Every protection except pinning is in place and tested now.
- **Launch blocker:** before public launch, `run-scan` must use a transport that connects to the
  exact address that was checked (a small worker server, which the spec already allows for
  `run-scan`, using a pinned-address HTTP client), or the Edge runtime must be confirmed to
  offer address pinning. The engine code does not change; only the injected transport does.
  Tracked in `docs/launch-blockers.md`.
- Supabase's own network egress rules are a second layer but are not relied on.
