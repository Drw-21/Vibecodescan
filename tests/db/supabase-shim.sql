-- Minimal stand-in for what Supabase provides, so the RLS tests can run on a
-- plain Postgres (local or the CI service container).
-- Applied ONLY when the auth schema is missing; never applied to a real Supabase.
-- Mirrors Supabase behaviour that our migrations rely on:
--   roles anon / authenticated / service_role (service_role bypasses RLS),
--   auth.users, auth.uid() reading the JWT claims, the `extensions` schema,
--   and Supabase's default grants of ALL on new public tables to the API roles.

-- Roles belong to the whole Postgres server, not one database, so they are created only
-- if missing (several test databases can share one server).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create schema extensions;
create schema auth;
grant usage on schema extensions, auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  raw_user_meta_data jsonb,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
