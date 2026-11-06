-- 0010_creator_consent.sql
-- Records that a creator agreed to the Creator Consent Form, one row per
-- person per form version. A decline is never saved, so every row means
-- "agreed to every box". Only the person and admins can read a row.

begin;

create table public.creator_consent (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id),
  form_version text not null
    check (length(btrim(form_version)) between 1 and 50),
  answers jsonb not null
    check ( jsonb_typeof(answers) = 'object'
            and answers <> '{}'::jsonb
            -- every value must be JSON true; strict so arrays are not unwrapped
            and not jsonb_path_exists(answers, 'strict $.* ? (@.type() != "boolean" || @ != true)',
                                      '{}', true) ),
  created_at timestamptz not null default now(),
  unique (user_id, form_version)
);

alter table public.creator_consent enable row level security;

create policy creator_consent_select on public.creator_consent for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

create policy creator_consent_insert on public.creator_consent for insert to authenticated
  with check (user_id = auth.uid());

-- No update or delete for anyone. Clients cannot set id or created_at.
revoke all on public.creator_consent from anon, authenticated;
grant select on public.creator_consent to authenticated;
grant insert (user_id, form_version, answers) on public.creator_consent to authenticated;

-- True if p_user agreed to any version of the form. Only the person
-- themselves or an admin may ask; anyone else always gets false.
create or replace function public.has_creator_consent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p_user = auth.uid() or public.is_admin(auth.uid()), false)
     and exists (select 1 from public.creator_consent where user_id = p_user);
$$;

revoke all on function public.has_creator_consent(uuid) from public, anon;
grant execute on function public.has_creator_consent(uuid) to authenticated;

commit;
