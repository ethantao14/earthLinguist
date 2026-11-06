-- 0013_rollback.sql
-- Restores the 0004 insert rule: recording sessions no longer need consent.

begin;

drop policy if exists recording_session_insert on public.recording_session;
create policy recording_session_insert on public.recording_session for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() in ('recorder', 'creator') and verification_status = false )
  );

commit;
