-- 0003_rollback.sql
-- Restores the policy set, grants and admin column that 0003 replaced.
-- Generated from the schema dump taken before any of this work started.
--
-- Running this reopens the gaps 0003 closed, including anonymous deletion on
-- the legacy tables. It is a stopgap for a production problem, not a resting
-- state.

begin;

-- The column and its values as they were.
alter table public.profiles add column if not exists admin_status boolean not null default false;
update public.profiles set admin_status = true
 where username in ('etao','etao2','kiyoppi','earthlingadmin25','kylexiong','twerner');
update public.profiles set status = 'student' where username = 'earthlingadmin25';

create or replace function public.is_admin(uid uuid) returns boolean
  language sql stable as $$
  select coalesce((select p.admin_status from public.profiles p where p.id = uid), false);
$$;

alter table public.recording_sessions disable row level security;

-- Remove what 0003 created.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies
            where schemaname='public' and tablename <> 'profiles'
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;

-- Storage policies must go back to the legacy column before the helper
-- functions they now reference are dropped.
alter policy "Give admins access to audio bucket 1jgvrq_0" on storage.objects
  using ((bucket_id = 'audio') and ((storage.foldername(name))[1] = 'admin-audios') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.admin_status = true)));
alter policy "Give admins access to audio bucket 1jgvrq_2" on storage.objects
  using ((bucket_id = 'audio') and ((storage.foldername(name))[1] = 'admin-audios') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.admin_status = true)));
alter policy "Give admins access to audio bucket 1jgvrq_3" on storage.objects
  using ((bucket_id = 'audio') and ((storage.foldername(name))[1] = 'admin-audios') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.admin_status = true)));
alter policy "Give admins access to audio bucket 1jgvrq_1" on storage.objects
  with check ((bucket_id = 'audio') and ((storage.foldername(name))[1] = 'admin-audios') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid()
              and ((profiles.status = any (array['recorder'::public.roles,'creator'::public.roles,'admin'::public.roles])) or profiles.admin_status = true))));
alter policy "Give admin access to image bucket 1nq2cb_0 1nq2cb_0" on storage.objects
  using ((bucket_id = 'image') and ((storage.foldername(name))[1] = 'admin-images') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.admin_status = true)));
alter policy "Give admin access to image bucket 1nq2cb_0 1nq2cb_1" on storage.objects
  using ((bucket_id = 'image') and ((storage.foldername(name))[1] = 'admin-images') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.admin_status = true)));
alter policy "Give users authenticated access to folder 1nq2cb_1" on storage.objects
  using ((bucket_id = 'image') and ((storage.foldername(name))[1] = 'admin-images') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.admin_status = true)));
alter policy "Give users authenticated access to folder 1nq2cb_0" on storage.objects
  with check ((bucket_id = 'image') and ((storage.foldername(name))[1] = 'admin-images') and (auth.role() = 'authenticated')
         and (exists (select 1 from public.profiles where profiles.id = auth.uid()
              and ((profiles.status = any (array['creator'::public.roles,'recorder'::public.roles,'admin'::public.roles])) or profiles.admin_status = true))));

drop function if exists public.can_read_session(uuid);
drop function if exists public.can_read_example(uuid);
drop function if exists public.user_role();

-- The original policies.

CREATE POLICY "Anon read example" ON public.example FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read recording_session" ON public.recording_session FOR SELECT TO anon USING (true);
CREATE POLICY "Anyone can select checkmarks" ON public.checkmarks FOR SELECT USING (true);
CREATE POLICY "Delete" ON public.checkmarks FOR DELETE USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.status = ANY (ARRAY['creator'::public.roles, 'recorder'::public.roles]))))));
CREATE POLICY "Public read image" ON public.image FOR SELECT USING (true);
CREATE POLICY "admins can insert example" ON public.example FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.admin_status, false) = true)))));
CREATE POLICY "admins can insert recording_session" ON public.recording_session FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.admin_status, false) = true)))));
CREATE POLICY "admins can read example" ON public.example FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.admin_status, false) = true)))));
CREATE POLICY "admins can read recording_session" ON public.recording_session FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (COALESCE(p.admin_status, false) = true)))));
CREATE POLICY "admins insert example" ON public.example FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY "admins insert image" ON public.image FOR INSERT WITH CHECK (true);
CREATE POLICY "admins insert recording_session" ON public.recording_session FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY "admins read audio" ON public.audio FOR SELECT USING (true);
CREATE POLICY "admins read example" ON public.example FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY "admins read recording_session" ON public.recording_session FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY allow_all_on_audio_clip_comments ON public.audio_clip_comments USING (true) WITH CHECK (true);
CREATE POLICY allow_all_on_audio_clips ON public.audio_clips USING (true) WITH CHECK (true);
CREATE POLICY allow_all_on_image_audio_map ON public.image_audio_map USING (true) WITH CHECK (true);
CREATE POLICY allow_all_on_images ON public.images USING (true) WITH CHECK (true);
CREATE POLICY audio_admin_insert ON public.audio FOR INSERT WITH CHECK (true);
CREATE POLICY audio_admin_update ON public.audio FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY audio_read_if_session_verified ON public.audio FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM public.recording_session rs
  WHERE ((rs.id = audio.recording_session_id) AND (rs.verification_status = true)))));
CREATE POLICY checkmarks_admin_insert ON public.checkmarks FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.status = ANY (ARRAY['admin'::public.roles, 'creator'::public.roles, 'recorder'::public.roles]))))));
CREATE POLICY checkmarks_admin_update ON public.checkmarks FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY example_admin_insert ON public.example FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY example_admin_select ON public.example FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY example_admin_update ON public.example FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY example_insert_admins ON public.example FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY example_read_authenticated ON public.example FOR SELECT TO authenticated USING (true);
CREATE POLICY example_select_admins ON public.example FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY image_admin_update ON public.image FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false))))) WITH CHECK (true);
CREATE POLICY recording_session_insert_admins ON public.recording_session FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY recording_session_select_admins ON public.recording_session FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY rs_admin_insert ON public.recording_session FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY rs_admin_select ON public.recording_session FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY rs_admin_update ON public.recording_session FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND COALESCE(p.admin_status, false)))));
CREATE POLICY rs_read_verified_anon_auth ON public.recording_session FOR SELECT TO authenticated, anon USING ((verification_status = true));

-- The original grants, except for profiles: 0002 deliberately narrowed those
-- and rolling back the content policies must not undo that hardening.

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audio TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audio TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audio_clip_comments TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audio_clip_comments TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audio_clips TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audio_clips TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.checkmarks TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.checkmarks TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.example TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.example TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.image TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.image TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.image_audio_map TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.image_audio_map TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.images TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.images TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.recording_session TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.recording_session TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.recording_sessions TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.recording_sessions TO authenticated;

commit;
