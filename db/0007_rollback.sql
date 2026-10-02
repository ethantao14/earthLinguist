-- 0007_rollback.sql
-- Forgets example owners and restores the 0004 insert rule.

begin;

drop policy if exists example_insert_creators on public.example;
create policy example_insert_creators on public.example for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() = 'creator' and verification_status = false )
  );

alter table public.example drop column if exists created_by;

commit;
