-- 0007_example_owner.sql
-- Records which account created each example, so later rules can let a
-- creator change their own drafts and nobody else's.
--
-- example only stored a first name as text. Existing examples get an owner
-- only where that name matches exactly one creator or admin account; the
-- rest stay ownerless rather than guessed, and only admins can manage them.

begin;

alter table public.example
  add column created_by uuid references public.profiles(id) on delete set null;

update public.example e
   set created_by = p.id
  from public.profiles p
 where p.first_name = e."user"
   and p.status in ('creator', 'admin')
   and (select count(*) from public.profiles q
         where q.first_name = e."user" and q.status in ('creator', 'admin')) = 1;

-- Set after the backfill, so existing rows are not stamped with the
-- migration's own (empty) identity.
alter table public.example alter column created_by set default auth.uid();

-- A creator's new example must be theirs. Admins may insert as before.
drop policy if exists example_insert_creators on public.example;
create policy example_insert_creators on public.example for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() = 'creator'
         and verification_status = false
         and created_by = auth.uid() )
  );

commit;
