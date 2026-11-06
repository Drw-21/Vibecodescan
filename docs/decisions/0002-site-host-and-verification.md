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
- Users insert sites straight through the API, so the database itself validates `url`, strictly:
  `http://` or `https://`, then a host of only ASCII letters, digits, dots and hyphens (Unicode
  domains in punycode), an optional port, and no `@`, `%`, `[`, backslash, whitespace or control
  characters anywhere. This stops the database and a standard URL parser from disagreeing about
  the host (found in independent review: `https://attacker.test\@victim.test/` used to be stored
  as host `victim.test` while `new URL()` fetches `attacker.test`).
- `verify-site` and `run-scan` must still refuse to proceed unless `new URL(site.url).hostname`
  equals `site.host`, and `safeFetch` still blocks private addresses.

**Consequences.** Verification can only be granted by `verify-site` (service role), and
`run-scan` must still re-check verification before every deep scan, as the spec requires.
A scan's `(site_id, user_id)` must match the site's owner (composite foreign key), so a bug in
`run-scan` cannot file one user's findings under another user.
