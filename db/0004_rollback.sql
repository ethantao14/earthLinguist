-- 0004_rollback.sql
-- Lets creators publish without approval again, as before 0004.

begin;

-- 0004 flipped this default; put it back.
alter table public.example alter column verification_status set default true;


drop policy if exists example_insert_creators on public.example;
create policy example_insert_creators on public.example for insert to authenticated
  with check (public.user_role() in ('creator', 'admin'));

drop policy if exists recording_session_insert on public.recording_session;
create policy recording_session_insert on public.recording_session for insert to authenticated
  with check (
    ( public.user_role() = 'recorder' and verification_status = false )
    or public.user_role() in ('creator', 'admin')
  );

commit;
