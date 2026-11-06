-- 0012_rollback.sql
-- Removes the recording consent table, every consent row in it, and its helpers.
-- Roll back 0013 first, since its insert rule calls these helpers.

begin;

drop function if exists public.submit_recording_session_for_other(uuid, uuid, text, text, text, text, jsonb);
drop function if exists public.owns_example(uuid);
drop function if exists public.has_session_consent(uuid);
drop function if exists public.has_recording_consent(uuid);
drop table if exists public.recording_consent;

commit;
