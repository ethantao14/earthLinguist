-- 0006_categories.sql
-- The master list of categories, LeetCode-style tags for examples.
--
-- Everyone can read the list; only admins add, rename or delete. The link
-- table to example comes with tagging, in a later migration.

begin;

create table public.categories (
  id bigint generated always as identity primary key,
  category_type text not null
    check (category_type = btrim(category_type)
           and category_type <> ''
           and char_length(category_type) <= 50)
);

-- "Verbs" and "verbs" are the same category.
create unique index categories_name_unique on public.categories (lower(category_type));

alter table public.categories enable row level security;

create policy categories_read on public.categories for select to anon, authenticated
  using (true);

create policy categories_admin_insert on public.categories for insert to authenticated
  with check (public.is_admin(auth.uid()));

create policy categories_admin_update on public.categories for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy categories_admin_delete on public.categories for delete to authenticated
  using (public.is_admin(auth.uid()));

-- Supabase grants every new table to anon and authenticated in full.
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

commit;
