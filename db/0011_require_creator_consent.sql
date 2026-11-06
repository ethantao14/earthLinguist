-- 0011_require_creator_consent.sql
-- A creator needs a consent row before creating an example. Admins are exempt.
-- Apply only after the new front end is live: the old one has no consent
-- screen, so creators on it could no longer create examples.

begin;

drop policy if exists example_insert_creators on public.example;
create policy example_insert_creators on public.example for insert to authenticated
  with check (
    public.is_admin(auth.uid())
    or ( public.user_role() = 'creator'
         and verification_status = false
         and created_by = auth.uid()
         and public.has_creator_consent(auth.uid()) )
  );

commit;
