-- 0002_rollback.sql
-- Restores public.profiles to exactly the state captured before 0002 ran.
-- Only for use if 0002 breaks something in production. Note that running this
-- reopens the anonymous privilege escalation, so treat it as a stopgap while a
-- corrected fix is prepared, not as a resting state.

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;

create policy "Anon read profiles" on public.profiles for select to anon using (true);
create policy "Insert own profile" on public.profiles for insert with check ((id = auth.uid()));
create policy "Select own profile" on public.profiles for select using ((id = auth.uid()));
create policy allow_all_on_profiles on public.profiles using (true) with check (true);
create policy profiles_self_select on public.profiles for select to authenticated using ((id = auth.uid()));
create policy "user can read own profile" on public.profiles for select to authenticated using ((id = auth.uid()));
create policy user_can_read_own_profile on public.profiles for select to authenticated using ((id = auth.uid()));

grant select,insert,references,delete,trigger,truncate,update on table public.profiles to anon;
grant select,insert,references,delete,trigger,truncate,update on table public.profiles to authenticated;
grant select,insert,references,delete,trigger,truncate,update on table public.profiles to service_role;

alter function public.is_admin(uuid) security invoker;
alter function public.is_admin(uuid) reset search_path;
grant all on function public.is_admin(uuid) to anon;
grant all on function public.is_admin(uuid) to authenticated;
grant all on function public.is_admin(uuid) to service_role;

alter policy "admins can read example" on public.example to public;
alter policy "admins can read recording_session" on public.recording_session to public;
alter policy "Delete" on public.checkmarks to public;

drop function if exists public.email_for_username(text);
