-- 0013_require_recording_consent.sql
-- A recorder or creator needs consent before saving a recording session: their
-- own, or the recorded person's saved with that session. A creator's own new
-- example is covered by creator consent. Admins are exempt.
-- Apply only after the new front end is live: the old one has no consent screen.

begin;

drop policy if exists recording_session_insert on public.recording_session;
create policy recording_session_insert on public.recording_session for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() in ('recorder', 'creator')
         and verification_status = false
         and ( public.has_recording_consent(auth.uid())
               or public.has_session_consent(id)
               or ( public.has_creator_consent(auth.uid()) and public.owns_example(example_id) ) ) )
  );

commit;
