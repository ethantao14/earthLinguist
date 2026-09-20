-- 0001_irb_hold.sql
-- Adds an explicit IRB hold flag to examples and recording sessions.
--
-- This is deliberately separate from verification_status. verification_status
-- means "a creator approved the content quality". irb_hold means "this may not
-- be shown for study-compliance reasons". Reusing verification_status would put
-- held rows back into the creator approval queue, where they could be approved
-- again by mistake.
--
-- Run this BEFORE deploying the front end change. The app filters on irb_hold,
-- and PostgREST returns an error for an unknown column, so the old database
-- plus the new front end breaks the Listen and Record tabs.

alter table public.example
  add column if not exists irb_hold boolean not null default false;

alter table public.recording_session
  add column if not exists irb_hold boolean not null default false;

comment on column public.example.irb_hold is
  'True means withheld for IRB/compliance reasons. Separate from verification_status.';

comment on column public.recording_session.irb_hold is
  'True means withheld for IRB/compliance reasons. Separate from verification_status.';
