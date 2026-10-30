-- One-time setup for the capture spike. Paste into Supabase → SQL Editor → Run.
-- Safe to run again.
--
-- Testers' phones use the anon key: they can add new files and session rows,
-- but can't read, list, overwrite or delete anything. You read everything in the
-- dashboard (Storage → captures, Table Editor → capture_sessions) or with
-- scripts/fetch-capture.mjs and the service role key.

-- Private bucket. Video goes up as the recorder's 2 s chunks (about 1 MB each),
-- which keeps every upload far below the free plan's 50 MB file limit.
insert into storage.buckets (id, name, public, file_size_limit)
values ('captures', 'captures', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "capture uploads" on storage.objects;
create policy "capture uploads" on storage.objects
  for insert to anon
  with check (
    bucket_id = 'captures'
    -- <session id>/seg<N>/<seq>.part or <session id>/session.json
    and name ~ '^[0-9a-f-]{32,36}/(seg[0-9]+/[0-9]{6}\.part|session\.json)$'
  );

create table if not exists public.capture_sessions (
  id text primary key,
  created_at timestamptz not null default now(),
  recorded_at timestamptz,
  platform text,
  user_agent text,
  codec text,
  duration_s numeric,
  segments int,
  chunks int,
  bytes bigint,
  fps_mean numeric,
  fps_min numeric,
  quality_hz numeric,
  drift_deg numeric,
  auto_pauses int,
  summary jsonb,
  segment_files jsonb
);

alter table public.capture_sessions enable row level security;

drop policy if exists "capture inserts" on public.capture_sessions;
create policy "capture inserts" on public.capture_sessions
  for insert to anon
  with check (true);
