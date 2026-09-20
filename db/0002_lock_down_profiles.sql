-- 0002_lock_down_profiles.sql
-- Closes anonymous write access to public.profiles.
--
-- The previous policy set granted every command on this table to PUBLIC with no
-- condition, which is far wider than the app needs. The app only ever reads a
-- user's own row, inserts that row at signup, and lets admins manage roles.
--
-- Dependency worth knowing: this requires a session to exist at signup, which
-- holds because email confirmation is effectively auto-confirm on this project.
-- If confirmation is ever turned on, signup has no session when it inserts the
-- profile and will start failing. The fix then is to create profiles from a
-- trigger on auth.users instead of from the browser.

-- 1. The hole.
drop policy if exists allow_all_on_profiles on public.profiles;

-- 2. Anonymous read of every profile row, including participant emails.
drop policy if exists "Anon read profiles" on public.profiles;

-- 3. Four copies of the same "read your own row" rule.
drop policy if exists "Select own profile" on public.profiles;
drop policy if exists profiles_self_select on public.profiles;
drop policy if exists "user can read own profile" on public.profiles;
drop policy if exists user_can_read_own_profile on public.profiles;
drop policy if exists "Insert own profile" on public.profiles;

-- 4. is_admin() reads profiles, so it has to bypass RLS. Without this, an admin
--    policy that calls it either recurses or silently sees nothing.
alter function public.is_admin(uuid) security definer;
alter function public.is_admin(uuid) set search_path = public;
revoke execute on function public.is_admin(uuid) from anon, public;
grant execute on function public.is_admin(uuid) to authenticated;

-- 5. Rebuild only what the app actually uses. Admins keep full visibility,
--    which they already had, and everyone else sees one row: their own.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));

create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Kept so the admin tooling can still change roles.
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- 6. Grants were SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER to anon.
revoke all on table public.profiles from anon;
revoke all on table public.profiles from authenticated;
grant select, insert, update on table public.profiles to authenticated;

-- 7. Username login is the one thing that legitimately needs an unauthenticated
--    lookup. Give it exactly that and nothing else.
create or replace function public.email_for_username(u text) returns text
  language sql stable security definer set search_path = public as $$
  select p.email from public.profiles p where lower(p.username) = lower(u) limit 1;
$$;

revoke all on function public.email_for_username(text) from public;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 8. These three policies query public.profiles but carry no TO clause, so they
--    also apply to signed-out visitors. Anonymous content reads only keep
--    working because Postgres short-circuits the permissive "USING (true)"
--    policy first, which is planner behaviour, not a guarantee. Scoping them to
--    authenticated removes the dependency entirely.
alter policy "admins can read example" on public.example to authenticated;
alter policy "admins can read recording_session" on public.recording_session to authenticated;
alter policy "Delete" on public.checkmarks to authenticated;
