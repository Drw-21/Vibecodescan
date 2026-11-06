# 0001 — RLS tests run on plain Postgres with a Supabase shim

**Context.** The spec requires a test per RLS policy, in CI on every push. Running the full
Supabase stack (`supabase start`) in CI needs Docker, many images and minutes per run.

**Decision.** `tests/db/` rebuilds a throwaway Postgres (CI: 17, matching `supabase/config.toml`) from `supabase/migrations/`,
after loading `tests/db/supabase-shim.sql`: the `anon`, `authenticated` and `service_role`
roles (service role bypasses RLS), `auth.users`, `auth.uid()` reading the JWT claims exactly as
Supabase does, the `extensions` schema, and Supabase's default grants of ALL on new public
tables to the API roles. Tests then act as each role with `set local role` + `request.jwt.claims`,
which is what PostgREST does, inside a transaction that is always rolled back.

The harness refuses to run against a database that has the `supabase_admin` role, so it can
never wipe a real Supabase project.

**Consequences.**

- Fast (under a second) and runs anywhere a Postgres runs, including the CI service container.
- The shim must stay faithful to Supabase. Because it copies Supabase's permissive default
  grants, the tests prove our explicit `revoke`s and policies do the work, not the shim.
- Migrations run as a superuser here but as the non-superuser `postgres` on Supabase.
- Before launch (milestone 8), also run the migrations through `supabase db reset` once and
  check the Supabase Security Advisor shows zero warnings.
