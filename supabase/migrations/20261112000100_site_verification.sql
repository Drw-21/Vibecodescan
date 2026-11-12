-- 0100 (milestone 6): proving ownership of a site.
--
-- Called ONLY by Edge Functions with the service role (EXECUTE revoked from everyone else).
-- Users still cannot write verified_at, verify_token or host themselves (milestone 1 grants).

-- When ownership was last checked, so checks cannot be used to hammer someone's server.
alter table public.sites add column last_verify_attempt_at timestamptz;

-- A user's own site, with what is needed to verify it. Nothing if it is not theirs.
create function public.site_for_owner(p_site_id uuid, p_user_id uuid)
returns table (
  id uuid,
  url text,
  host text,
  verify_token text,
  verify_token_expires_at timestamptz,
  verified_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select s.id, s.url, s.host, s.verify_token, s.verify_token_expires_at, s.verified_at
  from public.sites s
  where s.id = p_site_id and s.user_id = p_user_id;
$$;

-- Records one ownership check. False if this site, or ANY site with the same host (any
-- account), was checked less than the cooldown ago: checks cannot be used to hammer a server.
create function public.begin_verify_attempt(p_site_id uuid, p_user_id uuid, p_cooldown_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_host text;
begin
  select s.host into v_host from public.sites s where s.id = p_site_id and s.user_id = p_user_id;
  if v_host is null then
    return false;
  end if;
  -- One decision at a time per host.
  perform pg_advisory_xact_lock(hashtext('verify:' || v_host));
  if exists (
    select 1 from public.sites s
    where s.host = v_host
      and s.last_verify_attempt_at > now() - make_interval(secs => p_cooldown_seconds)
  ) then
    return false;
  end if;
  update public.sites set last_verify_attempt_at = now() where id = p_site_id;
  return true;
end;
$$;

-- Marks a site verified, but ONLY if its host and token are still the ones that were checked:
-- if the owner changed the URL while the check ran, the trigger from milestone 1 has already
-- issued a new token and this does nothing. Unverifying needs no condition.
create function public.set_site_verified(
  p_site_id uuid,
  p_verified boolean,
  p_host text default null,
  p_token text default null
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_verified then
    update public.sites
    set verified_at = now()
    where id = p_site_id and host = p_host and verify_token = p_token;
  else
    update public.sites set verified_at = null where id = p_site_id;
  end if;
  return found;
end;
$$;

-- Issues a fresh 32-byte token valid for 7 days, for a site that is not verified.
create function public.rotate_site_token(p_site_id uuid)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.sites
  set verify_token = encode(extensions.gen_random_bytes(32), 'hex'),
      verify_token_expires_at = now() + interval '7 days'
  where id = p_site_id and verified_at is null;
  return found;
end;
$$;

revoke all on function public.site_for_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.begin_verify_attempt(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.set_site_verified(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.rotate_site_token(uuid) from public, anon, authenticated;

grant execute on function public.site_for_owner(uuid, uuid) to service_role;
grant execute on function public.begin_verify_attempt(uuid, uuid, integer) to service_role;
grant execute on function public.set_site_verified(uuid, boolean, text, text) to service_role;
grant execute on function public.rotate_site_token(uuid) to service_role;
