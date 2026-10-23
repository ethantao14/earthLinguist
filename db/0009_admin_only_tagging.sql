-- 0009_admin_only_tagging.sql
-- Only admins may change example tags. Existing tags are kept.

begin;

-- Replaces an example's tags with exactly p_category_ids.
create or replace function public.set_example_categories(p_example_id uuid, p_category_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
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
