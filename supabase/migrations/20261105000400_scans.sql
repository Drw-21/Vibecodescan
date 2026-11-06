-- 0400 scans: one row per scan run. Written only by Edge Functions (service role).
--
-- Anonymous free scans have user_id and site_id null. No policy can ever match
-- them, so nobody can list them; create-scan returns the result once.
-- url/host are stored on the scan because anonymous scans have no site row and
-- rate limits are counted per target host.

create table public.scans (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid,
  user_id     uuid references public.profiles (id) on delete cascade,
  url         text not null check (char_length(url) <= 2048),
  host        text not null,
  kind        text not null default 'passive' check (kind in ('passive', 'deep')),
  status      text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  grade       text check (grade in ('A', 'B', 'C', 'D', 'F')),
  score       smallint check (score between 0 and 100),
  error_code  text check (char_length(error_code) <= 64),
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  finished_at timestamptz,
  -- A scan of a site always belongs to that site's owner (composite key below), so a
  -- bug that writes the wrong user_id cannot expose one user's findings to another.
  foreign key (site_id, user_id) references public.sites (id, user_id) on delete cascade,
  check (site_id is null or user_id is not null),
  -- a deep scan always belongs to a signed-in user's site
  check (kind = 'passive' or site_id is not null),
  -- a finished scan has a grade; a failed one has an error code
  check (status <> 'done' or (grade is not null and score is not null)),
  check (status <> 'failed' or error_code is not null)
);

create index scans_site_id_started_at_idx on public.scans (site_id, started_at desc);
create index scans_user_id_idx on public.scans (user_id);
create index scans_site_id_user_id_idx on public.scans (site_id, user_id);
create index scans_host_created_at_idx on public.scans (host, created_at desc);

alter table public.scans enable row level security;

revoke all on public.scans from anon, authenticated;
grant select on public.scans to authenticated;

create policy "scans: users read their own"
  on public.scans for select
  to authenticated
  using (user_id = (select auth.uid()));
