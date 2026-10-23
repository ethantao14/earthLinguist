-- 0010_rollback.sql
-- Removes both consent tables and their submissions.

begin;

drop table if exists public.recording_consent;
drop table if exists public.creator_consent;

commit;
