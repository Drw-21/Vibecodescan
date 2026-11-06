# 0002 — `sites.host` is derived by the database; changing it removes verification

**Context.** Deep checks run only on verified sites. If users could edit `host` or keep
`verified_at` while changing `url`, they could verify their own domain and then deep-scan
someone else's (threat model: "Verification bypass").

**Decision.**

- Users get column-level `insert`/`update` grants on `url` and `monitored` only.
  `verified_at`, `verify_token`, `host`, `user_id` and `platform` cannot be written from the browser.
- A trigger derives `host` from `url` (lower-case, userinfo and port stripped, trailing dot removed).
- If the host changes, the trigger clears `verified_at` and issues a fresh 32-byte token
  that expires in 7 days.
- `url` must start with `http://` or `https://`. Full URL validation still happens in Zod at the
  edge and in `safeFetch` (private-address blocking); the database check is a backstop.

**Consequences.** Verification can only be granted by `verify-site` (service role), and
`run-scan` must still re-check verification before every deep scan, as the spec requires.
