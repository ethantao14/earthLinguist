-- 0005_dedupe_checkmarks.sql
-- Removes repeated checkmarks and allows only one per cell from now on.
--
-- Resubmitting the wizard saved every checkmark again, because the clear-first
-- delete cannot see a creator's unapproved draft. The earliest copy is kept.
-- Apply this, then promote the front end that calls save_checkmarks.

begin;

delete from public.checkmarks c
  using public.checkmarks k
  where c.example_id = k.example_id
    and c.row_index = k.row_index
    and c.column_index = k.column_index
    and (k.created_at, k.id) < (c.created_at, c.id);

-- Blank cells would slip past the unique rule, since nulls never count as equal.
alter table public.checkmarks
  alter column example_id set not null,
  alter column row_index set not null,
  alter column column_index set not null,
  add constraint checkmarks_one_per_cell unique (example_id, row_index, column_index);


-- Saves a grid's checkmarks, skipping cells already saved. It must be the bare
-- "on conflict do nothing": naming the columns makes Postgres require read
-- access to the draft, which creators do not have. Runs as the caller.
create or replace function public.save_checkmarks(p_example_id uuid, p_cells jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.checkmarks (example_id, row_index, column_index)
  select p_example_id, cell.row_index, cell.column_index
  from jsonb_to_recordset(p_cells) as cell(row_index integer, column_index integer)
  on conflict do nothing;
$$;

revoke all on function public.save_checkmarks(uuid, jsonb) from public, anon;
grant execute on function public.save_checkmarks(uuid, jsonb) to authenticated;

commit;
