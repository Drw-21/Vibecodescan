-- 0600 subscriptions: written only by billing-webhook (service role).
-- Access is always decided by reading this table server-side, never by the browser.
-- No row = Free plan.

create table public.subscriptions (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  plan                     text not null check (plan in ('monitor')),
  status                   text not null check (status in ('active', 'on_trial', 'past_due', 'paused', 'cancelled', 'expired')),
  provider_customer_id     text,
  provider_subscription_id text unique,
  current_period_end       timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

revoke all on public.subscriptions from anon, authenticated;
grant select on public.subscriptions to authenticated;

create policy "subscriptions: users read their own"
  on public.subscriptions for select
  to authenticated
  using (user_id = (select auth.uid()));

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();
