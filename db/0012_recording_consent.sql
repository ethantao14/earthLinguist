-- 0012_recording_consent.sql
-- Records consent to the Recording Consent Form. A row with no subject_name
-- is the signed-in person consenting for themselves, once per form version.
-- A row with a subject_name is someone else's consent, saved with its session.

begin;

create table public.recording_consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  subject_name text
    check (subject_name is null or length(btrim(subject_name)) between 1 and 100),
  recording_session_id uuid
    references public.recording_session(id) on delete set null
    deferrable initially deferred,
  form_version text not null
    check (length(btrim(form_version)) between 1 and 50),
  answers jsonb not null
    check ( jsonb_typeof(answers) = 'object'
            and answers <> '{}'::jsonb
            -- every value must be JSON true; strict so arrays are not unwrapped
            and not jsonb_path_exists(answers, 'strict $.* ? (@.type() != "boolean" || @ != true)',
                                      '{}', true) ),
  created_at timestamptz not null default now(),
  -- Only someone-else rows link to a session; a deleted session leaves the name.
  check (recording_session_id is null or subject_name is not null)
);

-- One self consent per person per version. Someone-else rows may repeat.
create unique index recording_consent_self_once
  on public.recording_consent (user_id, form_version)
  where subject_name is null;

alter table public.recording_consent enable row level security;

create policy recording_consent_select on public.recording_consent for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- True if a recording session with this id exists. Lets the insert rule
-- refuse consent rows that link to a session saved earlier.
create or replace function public.recording_session_exists(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.recording_session where id = p_session);
$$;

revoke all on function public.recording_session_exists(uuid) from public, anon;
grant execute on function public.recording_session_exists(uuid) to authenticated;

-- The rpc inserts the consent row before its session, so a new link passes.
create policy recording_consent_insert on public.recording_consent for insert to authenticated
  with check (
    user_id = auth.uid()
    and ( public.is_admin(auth.uid()) or public.user_role() in ('recorder', 'creator') )
    and ( recording_session_id is null
          or not public.recording_session_exists(recording_session_id) )
  );

-- No update or delete for anyone. Clients cannot set id or created_at.
revoke all on public.recording_consent from anon, authenticated;
grant select on public.recording_consent to authenticated;
grant insert (user_id, subject_name, recording_session_id, form_version, answers)
  on public.recording_consent to authenticated;

-- True if p_user consented for themselves to any version of the form.
-- Only the person themselves or an admin may ask; anyone else always gets false.
create or replace function public.has_recording_consent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user = auth.uid() or public.is_admin(auth.uid()), false)
     and exists (select 1 from public.recording_consent
                 where user_id = p_user and subject_name is null);
$$;

-- True if the caller saved a someone-else consent for this session.
create or replace function public.has_session_consent(p_session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.recording_consent
                 where recording_session_id = p_session and user_id = auth.uid());
$$;

-- True if the caller created this example. Creators cannot read their own
-- unapproved drafts, so the insert rule needs this helper to check ownership.
create or replace function public.owns_example(p_example uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.example
                 where id = p_example and created_by = auth.uid());
$$;

-- Saves someone else's consent and the session it covers in one transaction.
-- Security invoker, so the normal insert rules apply to both rows.
create or replace function public.submit_recording_session_for_other(
  p_session_id uuid,
  p_example_id uuid,
  p_language text,
  p_user text,
  p_subject_name text,
  p_form_version text,
  p_answers jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.recording_consent (subject_name, recording_session_id, form_version, answers)
  values (p_subject_name, p_session_id, p_form_version, p_answers);

  insert into public.recording_session (id, example_id, language, "user", verification_status)
  values (p_session_id, p_example_id, p_language, p_user, public.is_admin(auth.uid()));
end;
$$;

revoke all on function public.has_recording_consent(uuid) from public, anon;
revoke all on function public.has_session_consent(uuid) from public, anon;
revoke all on function public.owns_example(uuid) from public, anon;
revoke all on function public.submit_recording_session_for_other(uuid, uuid, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.has_recording_consent(uuid) to authenticated;
grant execute on function public.has_session_consent(uuid) to authenticated;
grant execute on function public.owns_example(uuid) to authenticated;
grant execute on function public.submit_recording_session_for_other(uuid, uuid, text, text, text, text, jsonb)
  to authenticated;

commit;
