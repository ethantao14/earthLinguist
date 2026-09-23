-- 0004_require_approval.sql
-- Creator-made content waits for admin approval like everyone else's.
--
-- Run this only after the matching front end is deployed. It forbids a creator
-- from inserting already-verified rows, and the previous front end does exactly
-- that, so applying it first would break example creation.

begin;

-- example.verification_status defaulted to true, so any insert omitting the
-- column published without review. Content should have to earn approval.
alter table public.example alter column verification_status set default false;


-- Only an admin may insert content that is already approved.
drop policy if exists example_insert_creators on public.example;
create policy example_insert_creators on public.example for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() = 'creator' and verification_status = false )
  );

drop policy if exists recording_session_insert on public.recording_session;
create policy recording_session_insert on public.recording_session for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() in ('recorder', 'creator') and verification_status = false )
  );

commit;
