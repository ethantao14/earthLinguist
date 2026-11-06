-- 0011_rollback.sql
-- Restores the 0007 insert rule: creators no longer need consent.

begin;

drop policy if exists example_insert_creators on public.example;
create policy example_insert_creators on public.example for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() = 'creator'
         and verification_status = false
         and created_by = auth.uid() )
  );

commit;
