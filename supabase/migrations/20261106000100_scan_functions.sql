-- 0100 (milestone 4): scan creation with rate limits, and the scan lifecycle.
--
-- These functions are called ONLY by Edge Functions with the service role. They live in
-- `public` so the Supabase client can call them (rpc), but EXECUTE is revoked from
-- everyone else, including anon and authenticated (tests prove it).
-- Each one does its work in a single transaction, so limits cannot be raced past and a
-- scan cannot be half-saved.

-- Per-IP rate limiting stores only a keyed hash of the IP, never the address itself.
alter table public.scans
  add column client_ip_hash text check (client_ip_hash ~ '^[0-9a-f]{64}$');

create index scans_client_ip_hash_created_at_idx on public.scans (client_ip_hash, created_at desc);
create index scans_user_id_created_at_idx on public.scans (user_id, created_at desc);

-- Creates a queued scan if the requester is within their limits.
-- outcome: 'ok' | 'daily_limit' | 'host_cooldown'
create function public.create_scan_with_limits(
  p_url text,
  p_host text,
  p_user_id uuid,
  p_site_id uuid,
  p_kind text,
  p_client_ip_hash text,
  p_daily_limit integer,
  p_host_cooldown_seconds integer
)
returns table (scan_id uuid, outcome text, retry_after_seconds integer)
language plpgsql
set search_path = ''
as $$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  last_host_scan timestamptz;
  new_id uuid;
begin
  -- One scan creation at a time: counts and insert happen as one step.
  perform pg_advisory_xact_lock(hashtext('public.create_scan_with_limits'));

  if p_user_id is not null and (
    select count(*) from public.scans s where s.user_id = p_user_id and s.created_at >= day_start
  ) >= p_daily_limit then
    return query select null::uuid, 'daily_limit'::text,
      ceil(extract(epoch from (day_start + interval '1 day' - now())))::integer;
    return;
  end if;

  if p_client_ip_hash is not null and (
    select count(*) from public.scans s
    where s.client_ip_hash = p_client_ip_hash and s.created_at >= day_start
  ) >= p_daily_limit then
    return query select null::uuid, 'daily_limit'::text,
      ceil(extract(epoch from (day_start + interval '1 day' - now())))::integer;
    return;
  end if;

  select max(s.created_at) into last_host_scan from public.scans s where s.host = p_host;
  if last_host_scan is not null
     and last_host_scan > now() - make_interval(secs => p_host_cooldown_seconds) then
    return query select null::uuid, 'host_cooldown'::text,
      ceil(extract(epoch from (last_host_scan + make_interval(secs => p_host_cooldown_seconds) - now())))::integer;
    return;
  end if;

  insert into public.scans (url, host, user_id, site_id, kind, client_ip_hash)
  values (p_url, p_host, p_user_id, p_site_id, p_kind, p_client_ip_hash)
  returning id into new_id;

  return query select new_id, 'ok'::text, 0;
end;
$$;

-- Moves a scan from queued to running exactly once. Returns the row, or nothing if it was
-- already claimed (so running the same scan twice does nothing the second time).
create function public.claim_scan(p_scan_id uuid)
returns setof public.scans
language sql
set search_path = ''
as $$
  update public.scans
  set status = 'running', started_at = now()
  where id = p_scan_id and status = 'queued'
  returning *;
$$;

-- Saves all findings and the result together. Only a running scan can be completed.
create function public.complete_scan(
  p_scan_id uuid,
  p_findings jsonb,
  p_grade text,
  p_score integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.scans
  set status = 'done', grade = p_grade, score = p_score, finished_at = now()
  where id = p_scan_id and status = 'running';
  if not found then
    return false;
  end if;

  insert into public.findings
    (scan_id, check_id, severity, status, title, explanation, evidence_redacted, fix_prompt)
  select p_scan_id, f.check_id, f.severity, f.status, f.title, f.explanation,
         f.evidence_redacted, f.fix_prompt
  from jsonb_to_recordset(p_findings) as f(
    check_id text, severity text, status text, title text, explanation text,
    evidence_redacted text, fix_prompt text
  );
  return true;
end;
$$;

-- Marks a scan as failed with a short error code.
-- p_only_queued = true is used when the claim itself failed: then the scan may be running in
-- another call, and that call's work must not be thrown away.
create function public.fail_scan(p_scan_id uuid, p_error_code text, p_only_queued boolean)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  update public.scans
  set status = 'failed', error_code = p_error_code, finished_at = now()
  where id = p_scan_id
    and (status = 'queued' or (status = 'running' and not p_only_queued));
  return found;
end;
$$;

revoke all on function public.create_scan_with_limits(text, text, uuid, uuid, text, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_scan(uuid) from public, anon, authenticated;
revoke all on function public.complete_scan(uuid, jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.fail_scan(uuid, text, boolean) from public, anon, authenticated;

grant execute on function public.create_scan_with_limits(text, text, uuid, uuid, text, text, integer, integer)
  to service_role;
grant execute on function public.claim_scan(uuid) to service_role;
grant execute on function public.complete_scan(uuid, jsonb, text, integer) to service_role;
grant execute on function public.fail_scan(uuid, text, boolean) to service_role;
