-- 0008_rollback.sql
-- Removes example tags. The categories list itself is kept.

begin;

drop function if exists public.set_example_categories(uuid, bigint[]);
drop table if exists public.categories_example;

commit;
