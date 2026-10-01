-- 0006_rollback.sql
-- Removes the categories list and every category in it.

begin;

drop table if exists public.categories;

commit;
