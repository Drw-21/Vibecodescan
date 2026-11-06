-- 0100 base: shared schema objects used by later migrations.
--
-- Security model (applies to every table that follows):
--   * RLS is enabled on every table in the same migration that creates it.
--   * The browser holds only the anon key (roles `anon` and `authenticated`).
--   * Writes to scans, findings, subscriptions and billing_events come only from
--     Edge Functions using the service role, which bypasses RLS.
--   * Supabase grants ALL on new public tables to anon/authenticated by default.
--     Each migration therefore REVOKEs everything and GRANTs back only what a
--     policy is meant to allow (defence in depth on top of RLS).

create extension if not exists pgcrypto with schema extensions;

-- Functions that must never be callable through the API live here.
-- The `private` schema is not exposed by PostgREST.
create schema if not exists private;
revoke all on schema private from public;

-- Keeps updated_at columns honest.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
