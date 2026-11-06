-- 0500 findings: the results of a scan. Written only by Edge Functions.
-- evidence_redacted holds at most the first 4 and last 4 characters of a secret
-- (e.g. "sk_l…x9Q2"). The check below is a backstop against a redaction bug: real
-- secrets contain a long unbroken run of letters/digits (Stripe, OpenAI, Anthropic,
-- GitHub, AWS keys, JWTs), so any run of 20 or more such characters is refused.

create table public.findings (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid not null references public.scans (id) on delete cascade,
  check_id          text not null check (char_length(check_id) <= 64),
  severity          text not null check (severity in ('critical', 'high', 'medium', 'low', 'info')),
  status            text not null check (status in ('fail', 'pass', 'incomplete')),
  title             text not null check (char_length(title) <= 200),
  explanation       text not null check (char_length(explanation) <= 4000),
  evidence_redacted text check (
                      char_length(evidence_redacted) <= 200
                      and evidence_redacted !~ '[A-Za-z0-9+/=]{20,}'
                    ),
  fix_prompt        text check (char_length(fix_prompt) <= 8000),
  created_at        timestamptz not null default now()
);

create index findings_scan_id_idx on public.findings (scan_id);

alter table public.findings enable row level security;

revoke all on public.findings from anon, authenticated;
grant select on public.findings to authenticated;

create policy "findings: users read findings of their own scans"
  on public.findings for select
  to authenticated
  using (
    exists (
      select 1 from public.scans s
      where s.id = findings.scan_id
        and s.user_id = (select auth.uid())
    )
  );
