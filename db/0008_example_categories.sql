-- 0008_example_categories.sql
-- Tags examples with categories, many to many.
--
-- Tags are visible to whoever can see the example. They change only through
-- set_example_categories, which allows an admin, or the example's own creator
-- while it is still an unapproved draft. Creators cannot read their drafts, so
-- the function runs as its owner and checks permission itself.

begin;

create table public.categories_example (
  id bigint generated always as identity primary key,
  category_id bigint not null references public.categories(id) on delete cascade,
  example_id uuid not null references public.example(id) on delete cascade,
  constraint categories_example_once unique (category_id, example_id)
);

create index categories_example_by_example on public.categories_example (example_id);

alter table public.categories_example enable row level security;

create policy categories_example_read on public.categories_example for select to anon, authenticated
  using (public.can_read_example(example_id));

-- Read only for everyone; writes go through the function below.
revoke all on public.categories_example from anon, authenticated;
grant select on public.categories_example to anon, authenticated;


-- Replaces an example's tags with exactly p_category_ids.
create or replace function public.set_example_categories(p_example_id uuid, p_category_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not ( public.is_admin(auth.uid())
           or exists (select 1 from public.example e
                       where e.id = p_example_id
                         and e.created_by = auth.uid()
                         and e.verification_status = false) ) then
    raise exception 'not allowed to change categories on this example' using errcode = '42501';
  end if;

  delete from public.categories_example
   where example_id = p_example_id
     and category_id <> all (coalesce(p_category_ids, '{}'));

  insert into public.categories_example (category_id, example_id)
  select distinct c, p_example_id from unnest(coalesce(p_category_ids, '{}')) as c
  on conflict (category_id, example_id) do nothing;
end;
$$;

revoke all on function public.set_example_categories(uuid, bigint[]) from public, anon;
grant execute on function public.set_example_categories(uuid, bigint[]) to authenticated;

commit;
