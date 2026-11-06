-- Local development data only (loaded by `supabase db reset`). Never run in production.
-- Two users, each with one site, so you can check by hand that neither sees the other's data.

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'alice@example.test', '{}', now(), now()),
  ('00000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'bob@example.test', '{}', now(), now());

insert into public.sites (user_id, url, platform)
values
  ('00000000-0000-4000-8000-00000000000a', 'https://alice-app.example.test', 'lovable'),
  ('00000000-0000-4000-8000-00000000000b', 'https://bob-app.example.test', 'bolt');
