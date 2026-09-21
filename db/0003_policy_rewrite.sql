-- 0003_policy_rewrite.sql
-- Replaces the row level security policy set with a deliberate one.
--
-- Why this is a rewrite rather than a patch: every policy is permissive, and
-- permissive policies combine with OR. example had six SELECT policies, two of
-- which were simply "true", so the four admin checks did nothing and no
-- condition could be added without first collapsing the set.
--
-- Admin identity moves from the legacy admin_status column to status = 'admin'.
-- Those two disagreed for six accounts, so this also corrects who is an admin.

begin;

-- 1. Correct the role data before anything starts reading it.
update public.profiles set status = 'admin'  where username = 'earthlingadmin25';

-- 2. Helpers. All security definer so they bypass RLS and cannot recurse
--    through the very policies that call them.
create or replace function public.user_role() returns text
  language sql stable security definer set search_path = public as $$
  select status::text from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin(uid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select p.status = 'admin' from public.profiles p where p.id = uid), false);
$$;

-- The single source of truth for "may this person see this example". Everything
-- hanging off an example (sessions, audio, images, checkmarks) defers to it.
create or replace function public.can_read_example(ex uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.example e
     where e.id = ex
       and ( public.is_admin(auth.uid())
             or ( e.verification_status
                  and not e.irb_hold
                  and ( coalesce(public.user_role(), 'anon') <> 'student' or e.class_viewable ) ) )
  );
$$;

create or replace function public.can_read_session(sid uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.recording_session rs
     where rs.id = sid
       and ( public.is_admin(auth.uid())
             or ( rs.verification_status and not rs.irb_hold
                  and public.can_read_example(rs.example_id) ) )
  );
$$;

revoke execute on function public.user_role(), public.is_admin(uuid),
                          public.can_read_example(uuid), public.can_read_session(uuid) from public;
grant execute on function public.user_role(), public.is_admin(uuid),
                         public.can_read_example(uuid), public.can_read_session(uuid) to anon, authenticated;

-- 3. Drop every existing policy on the tables being redefined. profiles keeps
--    the policies added in 0002 and only has its admin check swapped underneath.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
     where schemaname = 'public' and tablename <> 'profiles'
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 4. The new policy set.

-- example ---------------------------------------------------------------
-- Written against the row's own columns on purpose. Calling a STABLE helper
-- that re-queries this table would make "insert ... returning" fail, because
-- the helper cannot see the row its own statement just inserted.
create policy example_read on public.example for select to anon, authenticated
  using (
    public.is_admin(auth.uid())
    or ( verification_status and not irb_hold
         and ( coalesce(public.user_role(), 'anon') <> 'student' or class_viewable ) )
  );

create policy example_insert_creators on public.example for insert to authenticated
  with check (public.user_role() in ('creator', 'admin'));

create policy example_update_admin on public.example for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Admins delete anything. A creator may delete an example only while nothing
-- hangs off it, which is exactly the failed-creation rollback case and not a
-- general power to remove other people's work.
create policy example_delete on public.example for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or ( public.user_role() = 'creator'
         and not exists (select 1 from public.recording_session rs where rs.example_id = example.id)
         and not exists (select 1 from public.image i             where i.example_id  = example.id) )
  );

-- recording_session -----------------------------------------------------
create policy recording_session_read on public.recording_session for select to anon, authenticated
  using (
    public.is_admin(auth.uid())
    or ( verification_status and not irb_hold
         and public.can_read_example(example_id) )
  );

-- A recorder may only submit work that still needs approval. The front end
-- already intends this, but a client-side check is not a control: without the
-- verification_status clause a recorder could publish straight past approval.
create policy recording_session_insert on public.recording_session for insert to authenticated
  with check (
    ( public.user_role() = 'recorder' and verification_status = false )
    or public.user_role() in ('creator', 'admin')
  );

create policy recording_session_update_admin on public.recording_session for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy recording_session_delete_admin on public.recording_session for delete to authenticated
  using (public.is_admin(auth.uid()));

-- audio -----------------------------------------------------------------
create policy audio_read on public.audio for select to anon, authenticated
  using (public.can_read_session(recording_session_id));

create policy audio_insert on public.audio for insert to authenticated
  with check (public.user_role() in ('recorder', 'creator', 'admin'));

create policy audio_update_admin on public.audio for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy audio_delete_admin on public.audio for delete to authenticated
  using (public.is_admin(auth.uid()));

-- image -----------------------------------------------------------------
create policy image_read on public.image for select to anon, authenticated
  using (public.can_read_example(example_id));

create policy image_insert_creators on public.image for insert to authenticated
  with check (public.user_role() in ('creator', 'admin'));

create policy image_update_admin on public.image for update to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy image_delete_admin on public.image for delete to authenticated
  using (public.is_admin(auth.uid()));

-- checkmarks ------------------------------------------------------------
-- The creation wizard clears a table's checkmarks and reinserts them, so
-- creators need delete here, unlike everywhere else.
create policy checkmarks_read on public.checkmarks for select to anon, authenticated
  using (public.can_read_example(example_id));

create policy checkmarks_write_creators on public.checkmarks for insert to authenticated
  with check (public.user_role() in ('creator', 'admin'));

create policy checkmarks_update_creators on public.checkmarks for update to authenticated
  using (public.user_role() in ('creator', 'admin'))
  with check (public.user_role() in ('creator', 'admin'));

create policy checkmarks_delete_creators on public.checkmarks for delete to authenticated
  using (public.user_role() in ('creator', 'admin'));

-- legacy tables ---------------------------------------------------------
-- audio_clips is still read by the front end. The other three are read by
-- nothing, so they become admin-only while keeping their rows.
create policy audio_clips_read on public.audio_clips for select to anon, authenticated
  using (true);

create policy audio_clips_write_admin on public.audio_clips for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy images_admin_only on public.images for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy image_audio_map_admin_only on public.image_audio_map for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy audio_clip_comments_admin_only on public.audio_clip_comments for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create policy recording_sessions_admin_only on public.recording_sessions for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 5. recording_sessions never had row level security switched on, so its
--    policies would have been decorative and its grants alone governed access.
alter table public.recording_sessions enable row level security;

-- 6. Grants. Every table previously handed anon and authenticated the full set
--    including DELETE, TRUNCATE, REFERENCES and TRIGGER. Narrow that to what
--    the policies above actually need.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.example, public.recording_session, public.audio,
                public.image, public.checkmarks, public.audio_clips to anon;

grant select on public.example, public.recording_session, public.audio,
                public.image, public.checkmarks, public.audio_clips,
                public.images, public.image_audio_map, public.audio_clip_comments,
                public.recording_sessions to authenticated;

grant insert, update, delete on public.example, public.recording_session,
                public.audio, public.image, public.checkmarks to authenticated;
grant insert, update, delete on public.audio_clips, public.images,
                public.image_audio_map, public.audio_clip_comments,
                public.recording_sessions to authenticated;

-- profiles keeps what 0002 set.
grant select, insert, update on public.profiles to authenticated;

-- 7. Storage policies on the audio and image buckets check the same legacy
--    column, so they have to move to the role first or the column cannot be
--    dropped. Semantics are preserved exactly: admin_status = true becomes
--    status = 'admin', and where a policy already checked status with
--    admin_status as a fallback, the fallback is simply removed because the
--    role list already contains admin.
alter policy "Give admins access to audio bucket 1jgvrq_0" on storage.objects
  using ( bucket_id = 'audio' and (storage.foldername(name))[1] = 'admin-audios'
          and auth.role() = 'authenticated' and public.is_admin(auth.uid()) );

alter policy "Give admins access to audio bucket 1jgvrq_2" on storage.objects
  using ( bucket_id = 'audio' and (storage.foldername(name))[1] = 'admin-audios'
          and auth.role() = 'authenticated' and public.is_admin(auth.uid()) );

alter policy "Give admins access to audio bucket 1jgvrq_3" on storage.objects
  using ( bucket_id = 'audio' and (storage.foldername(name))[1] = 'admin-audios'
          and auth.role() = 'authenticated' and public.is_admin(auth.uid()) );

alter policy "Give admins access to audio bucket 1jgvrq_1" on storage.objects
  with check ( bucket_id = 'audio' and (storage.foldername(name))[1] = 'admin-audios'
               and auth.role() = 'authenticated'
               and public.user_role() in ('recorder', 'creator', 'admin') );

alter policy "Give admin access to image bucket 1nq2cb_0 1nq2cb_0" on storage.objects
  using ( bucket_id = 'image' and (storage.foldername(name))[1] = 'admin-images'
          and auth.role() = 'authenticated' and public.is_admin(auth.uid()) );

alter policy "Give admin access to image bucket 1nq2cb_0 1nq2cb_1" on storage.objects
  using ( bucket_id = 'image' and (storage.foldername(name))[1] = 'admin-images'
          and auth.role() = 'authenticated' and public.is_admin(auth.uid()) );

alter policy "Give users authenticated access to folder 1nq2cb_1" on storage.objects
  using ( bucket_id = 'image' and (storage.foldername(name))[1] = 'admin-images'
          and auth.role() = 'authenticated' and public.is_admin(auth.uid()) );

alter policy "Give users authenticated access to folder 1nq2cb_0" on storage.objects
  with check ( bucket_id = 'image' and (storage.foldername(name))[1] = 'admin-images'
               and auth.role() = 'authenticated'
               and public.user_role() in ('creator', 'recorder', 'admin') );

-- 8. The legacy admin column, now that nothing reads it.
alter table public.profiles drop column admin_status;

commit;
