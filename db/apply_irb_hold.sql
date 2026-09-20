-- apply_irb_hold.sql
-- Withhold one contributor's tables and recordings pending IRB permission.
-- The contributor is named only at run time, never in this file: the repo is public.
-- Run 0001_irb_hold.sql first.
--
-- Run each step separately and read the output before moving on. Steps 1 and 2
-- change nothing. Do not run step 3 until step 2 shows exactly the rows you mean
-- to withhold.
--
-- Note: example.user and recording_session.user are free text, written at insert
-- time. example.user gets the profile first name; recording_session.user gets
-- first name, or username, or email, whichever existed. So the same person can
-- appear under more than one string, and a common first name can collide with a
-- different person. That is why step 1 exists.

-- Step 1: find out how this person appears in the data. Read all four results.
-- Replace <SURNAME> below before running.
select first_name, last_name, username, email from public.profiles
 where last_name ilike '%<SURNAME>%' or first_name ilike '%<SURNAME>%'
    or username ilike '%<SURNAME>%' or email ilike '%<SURNAME>%';

select "user", count(*) as examples from public.example
 group by 1 order by 2 desc;

select "user", count(*) as sessions, min(created_at) as first_seen, max(created_at) as last_seen
  from public.recording_session group by 1 order by 2 desc;

select "user", language, count(*) as sessions from public.recording_session
 group by 1, 2 order by 3 desc;

-- Step 2: replace the array below with the exact strings step 1 identified,
-- then review every row this would withhold. Still changes nothing.
with target as (select unnest(array['REPLACE_WITH_EXACT_USER_STRINGS']) as name)
select 'example' as source, e.id, e.title, e."user", e.created_at,
       e.verification_status, e.irb_hold
  from public.example e join target t on e."user" = t.name
union all
select 'recording_session', rs.id, e.title, rs."user", rs.created_at,
       rs.verification_status, rs.irb_hold
  from public.recording_session rs
  join target t on rs."user" = t.name
  left join public.example e on e.id = rs.example_id
 order by source, created_at;

-- Step 2b: recordings by other people that sit on his examples. Withholding his
-- examples hides these too. Confirm with Tom that this is intended.
with target as (select unnest(array['REPLACE_WITH_EXACT_USER_STRINGS']) as name)
select rs.id, rs."user" as recorded_by, e.title, rs.language, rs.created_at
  from public.recording_session rs
  join public.example e on e.id = rs.example_id
  join target t on e."user" = t.name
 where rs."user" <> all (array(select name from target))
 order by rs.created_at;

-- Step 3: apply the hold. Save both result sets: they are the record of what was
-- changed and the input to the revert below.
with target as (select unnest(array['REPLACE_WITH_EXACT_USER_STRINGS']) as name)
update public.example e set irb_hold = true
  from target t where e."user" = t.name and e.irb_hold = false
returning e.id, e.title, e."user";

with target as (select unnest(array['REPLACE_WITH_EXACT_USER_STRINGS']) as name)
update public.recording_session rs set irb_hold = true
  from target t where rs."user" = t.name and rs.irb_hold = false
returning rs.id, rs.example_id, rs."user", rs.language;

-- Revert, once Tom has the retroactive permission. Use the id lists returned by
-- step 3, not the name match, so that holds added later for other reasons are
-- left alone.
-- update public.example set irb_hold = false where id in ('...','...');
-- update public.recording_session set irb_hold = false where id in ('...','...');
