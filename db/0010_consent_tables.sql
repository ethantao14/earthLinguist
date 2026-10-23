-- 0010_consent_tables.sql
-- Append-only consent submissions. Only admins can read them.

begin;

create table public.creator_consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  box text not null
    check (char_length(btrim(box)) between 1 and 200),
  checked boolean not null,
  created_at timestamptz not null default now()
);

create table public.recording_consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  box text not null
    check (char_length(btrim(box)) between 1 and 200),
  checked boolean not null,
  created_at timestamptz not null default now(),
  recording_session_id uuid references public.recording_session(id) on delete cascade,
  subject_name text
    check (char_length(btrim(subject_name)) between 1 and 100),
  check ((recording_session_id is null) = (subject_name is null))
);

alter table public.creator_consent enable row level security;
alter table public.recording_consent enable row level security;

create policy creator_consent_admin_read on public.creator_consent for select to authenticated
  using (public.is_admin(auth.uid()));

create policy creator_consent_insert on public.creator_consent for insert to authenticated
  with check (user_id = auth.uid());

create policy recording_consent_admin_read on public.recording_consent for select to authenticated
  using (public.is_admin(auth.uid()));

create policy recording_consent_insert on public.recording_consent for insert to authenticated
  with check (user_id = auth.uid());

-- Clients cannot change submissions or supply their IDs and timestamps.
revoke all on public.creator_consent from anon, authenticated;
revoke all on public.recording_consent from anon, authenticated;
grant select on public.creator_consent to authenticated;
grant select on public.recording_consent to authenticated;
grant insert (user_id, box, checked) on public.creator_consent to authenticated;
grant insert (user_id, box, checked, recording_session_id, subject_name)
  on public.recording_consent to authenticated;

commit;
