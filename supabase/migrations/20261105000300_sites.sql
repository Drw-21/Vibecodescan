-- 0300 sites: apps a user has added. verified_at unlocks deep checks.
--
-- Users may insert and update only `url` and `monitored` (column grants below).
-- `host` is derived from `url` by a trigger, so it can never disagree with it.
-- Changing the host resets verification and issues a new token, so a user
-- cannot verify one domain and then point the site at another.

create table public.sites (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid()
                            references public.profiles (id) on delete cascade,
  url                     text not null
                            check (char_length(url) <= 2048 and url ~* '^https?://[^/?#[:space:]]+'),
  host                    text not null,
  platform                text not null default 'unknown'
                            check (platform in ('lovable', 'bolt', 'replit', 'v0', 'vercel', 'netlify', 'unknown')),
  verify_token            text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  verify_token_expires_at timestamptz not null default now() + interval '7 days',
  verified_at             timestamptz,
  monitored               boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (user_id, host)
);

create index sites_user_id_idx on public.sites (user_id);
create index sites_host_idx on public.sites (host);
create index sites_monitored_idx on public.sites (monitored) where monitored;

alter table public.sites enable row level security;

revoke all on public.sites from anon, authenticated;
grant select on public.sites to authenticated;
grant insert (url, monitored) on public.sites to authenticated;
grant update (url, monitored) on public.sites to authenticated;

create policy "sites: users read their own"
  on public.sites for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "sites: users add their own"
  on public.sites for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "sites: users change their own"
  on public.sites for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Derive host from url; reset verification whenever the host changes.
create or replace function private.sites_derive_host()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  derived text;
begin
  -- scheme://[userinfo@]host[:port]... -> lower-case host, trailing dot removed
  derived := lower(substring(new.url from '^[a-zA-Z]+://(?:[^@/?#]*@)?([^/?#:]+)'));
  derived := rtrim(derived, '.');
  if derived is null or derived = '' then
    raise exception 'sites.url has no host' using errcode = '22023';
  end if;
  new.host := derived;

  if tg_op = 'UPDATE' and new.host is distinct from old.host then
    new.verified_at := null;
    new.verify_token := encode(extensions.gen_random_bytes(32), 'hex');
    new.verify_token_expires_at := now() + interval '7 days';
  end if;
  return new;
end;
$$;

revoke all on function private.sites_derive_host() from public;

create trigger sites_derive_host
  before insert or update of url on public.sites
  for each row execute function private.sites_derive_host();

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function private.set_updated_at();
