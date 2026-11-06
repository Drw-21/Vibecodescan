-- 0700 billing_events: idempotency record for billing webhooks.
-- billing-webhook inserts event_id first; a duplicate key means "already handled".
-- No policies and no grants: only the service role can touch it.

create table public.billing_events (
  event_id    text primary key check (char_length(event_id) <= 128),
  type        text not null check (char_length(type) <= 64),
  received_at timestamptz not null default now()
);

alter table public.billing_events enable row level security;

revoke all on public.billing_events from anon, authenticated;
