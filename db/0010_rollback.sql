-- 0010_rollback.sql
-- Removes the creator consent table, every consent row in it, and its helper.
-- Roll back 0011 first, since its insert rule calls has_creator_consent.

begin;

drop function if exists public.has_creator_consent(uuid);
drop table if exists public.creator_consent;

commit;
