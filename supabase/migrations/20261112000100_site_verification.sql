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

-- Records one ownership check, at most once per cooldown per site. False = too soon.
create function public.begin_verify_attempt(p_site_id uuid, p_user_id uuid, p_cooldown_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.sites
  set last_verify_attempt_at = now()
  where id = p_site_id
    and user_id = p_user_id
    and (last_verify_attempt_at is null
         or last_verify_attempt_at <= now() - make_interval(secs => p_cooldown_seconds));
  return found;
end;
$$;

-- Marks a site verified (now) or not verified.
create function public.set_site_verified(p_site_id uuid, p_verified boolean)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.sites
  set verified_at = case when p_verified then now() else null end
  where id = p_site_id;
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
revoke all on function public.set_site_verified(uuid, boolean) from public, anon, authenticated;
revoke all on function public.rotate_site_token(uuid) from public, anon, authenticated;

grant execute on function public.site_for_owner(uuid, uuid) to service_role;
grant execute on function public.begin_verify_attempt(uuid, uuid, integer) to service_role;
grant execute on function public.set_site_verified(uuid, boolean) to service_role;
grant execute on function public.rotate_site_token(uuid) to service_role;
