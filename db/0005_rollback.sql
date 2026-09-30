-- 0005_rollback.sql
-- Allows repeated checkmarks again. The deleted rows are not restored here;
-- they were exported to a file outside the repo before 0005 was applied.

begin;

drop function if exists public.save_checkmarks(uuid, jsonb);
alter table public.checkmarks
  drop constraint if exists checkmarks_one_per_cell,
  alter column example_id drop not null,
  alter column row_index drop not null,
  alter column column_index drop not null;

commit;
