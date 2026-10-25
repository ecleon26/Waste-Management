-- ============================================================
-- migration_v2.sql – Neighborhood Waste Collection Planner
-- Safe to re-run (IF NOT EXISTS / DROP … IF EXISTS / ON CONFLICT).
--
-- Re-run safety notes:
--   • ALTER TABLE … ADD COLUMN IF NOT EXISTS  – idempotent
--   • ALTER TABLE … DROP/ADD CONSTRAINT       – drops old first
--   • CREATE INDEX IF NOT EXISTS              – idempotent
--   • Storage bucket INSERT … ON CONFLICT     – idempotent
--   • DROP POLICY IF EXISTS + CREATE POLICY   – idempotent
--   • DROP FUNCTION IF EXISTS + CREATE …      – only needed when the
--     function signature or return type changes (none here changed)
--   • DROP VIEW IF EXISTS + CREATE VIEW       – required when the
--     view column list changes (Postgres rejects CREATE OR REPLACE
--     if a column would be renamed or reordered, e.g. inserting
--     total_rejected before processed_dry causes the error:
--     "cannot change name of view column processed_dry to total_rejected")
--
-- Paste into the Supabase SQL Editor and click Run.
-- ============================================================

-- ── STEP 1: Add new columns to pickup_requests ─────────────────────────────

-- Flat / unit number
alter table public.pickup_requests
  add column if not exists flat_number text;

-- Street or nearby landmark
alter table public.pickup_requests
  add column if not exists street text;

-- Contact phone (stored as text; validated client-side + check constraint)
alter table public.pickup_requests
  add column if not exists phone text;

-- Waste items (e.g. ['Plastic','Paper/Cardboard'])
alter table public.pickup_requests
  add column if not exists waste_items text[] default '{}';

-- Estimated quantity: 'small' | 'medium' | 'large'
alter table public.pickup_requests
  add column if not exists quantity text
  check (quantity in ('small', 'medium', 'large'));

-- Preferred / scheduled pickup date (date only)
alter table public.pickup_requests
  add column if not exists scheduled_date date;

-- Preferred time slot
alter table public.pickup_requests
  add column if not exists time_slot text
  check (time_slot in ('morning', 'afternoon', 'evening'));

-- Optional image URL (Supabase Storage public URL)
alter table public.pickup_requests
  add column if not exists image_url text;

-- Rejection reason (admin fills when rejecting)
alter table public.pickup_requests
  add column if not exists rejection_reason text;

-- Reviewed at (set when rejected)
alter table public.pickup_requests
  add column if not exists reviewed_at timestamptz;

-- ── STEP 2: Widen the status check constraint ───────────────────────────────
-- Drop the old constraint and create a new one that includes 'rejected'.
alter table public.pickup_requests
  drop constraint if exists pickup_requests_status_check;

alter table public.pickup_requests
  add constraint pickup_requests_status_check
  check (status in ('pending', 'processed', 'rejected'));

-- ── STEP 3: Additional indexes ──────────────────────────────────────────────
create index if not exists idx_pickup_requests_date_slot
  on public.pickup_requests (scheduled_date, time_slot, created_at asc)
  where status = 'pending';

-- ── STEP 4: Storage bucket ──────────────────────────────────────────────────
-- Create the public bucket (safe if already exists)
insert into storage.buckets (id, name, public)
values ('request-images', 'request-images', true)
on conflict (id) do nothing;

-- Storage RLS policies (drop first so re-runs are safe)
drop policy if exists "Users upload own images" on storage.objects;
drop policy if exists "Anyone can view images"  on storage.objects;
drop policy if exists "Users delete own images" on storage.objects;

create policy "Users upload own images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'request-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can view images"
  on storage.objects for select
  using (bucket_id = 'request-images');

create policy "Users delete own images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'request-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── STEP 5: RPCs ────────────────────────────────────────────────────────────

-- 5a. process_request(request_id) – admin only, pending only
create or replace function public.process_request(p_request_id uuid)
returns setof public.pickup_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pickup_requests;
begin
  -- Admin guard
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied: admins only';
  end if;

  -- Lock the specific pending row
  select * into v_row
  from public.pickup_requests
  where id = p_request_id and status = 'pending'
  for update skip locked;

  if not found then
    raise exception 'Request % is not pending or does not exist', p_request_id;
  end if;

  update public.pickup_requests
  set status = 'processed', processed_at = now()
  where id = p_request_id
  returning * into v_row;

  return next v_row;
end;
$$;

-- 5b. reject_request(request_id, reason) – admin only, pending only
create or replace function public.reject_request(
  p_request_id uuid,
  p_reason     text
)
returns setof public.pickup_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.pickup_requests;
begin
  -- Admin guard
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied: admins only';
  end if;

  -- Reason must be at least 3 characters
  if length(trim(p_reason)) < 3 then
    raise exception 'Rejection reason must be at least 3 characters';
  end if;

  select * into v_row
  from public.pickup_requests
  where id = p_request_id and status = 'pending'
  for update skip locked;

  if not found then
    raise exception 'Request % is not pending or does not exist', p_request_id;
  end if;

  update public.pickup_requests
  set
    status           = 'rejected',
    rejection_reason = trim(p_reason),
    reviewed_at      = now()
  where id = p_request_id
  returning * into v_row;

  return next v_row;
end;
$$;

-- 5c. reschedule_request(request_id, new_date, new_slot) – admin only
--     Validates slot capacity (MAX_PER_SLOT = 5) before rescheduling.
create or replace function public.reschedule_request(
  p_request_id uuid,
  p_new_date   date,
  p_new_slot   text
)
returns setof public.pickup_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row     public.pickup_requests;
  v_count   int;
  v_max     constant int := 5;
begin
  -- Admin guard
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Access denied: admins only';
  end if;

  -- Validate slot value
  if p_new_slot not in ('morning', 'afternoon', 'evening') then
    raise exception 'Invalid slot: must be morning, afternoon, or evening';
  end if;

  -- Capacity check (exclude the current request from count)
  select count(*) into v_count
  from public.pickup_requests
  where scheduled_date = p_new_date
    and time_slot = p_new_slot
    and status = 'pending'
    and id <> p_request_id;

  if v_count >= v_max then
    raise exception 'Slot % on % is full (capacity %)', p_new_slot, p_new_date, v_max;
  end if;

  select * into v_row
  from public.pickup_requests
  where id = p_request_id and status = 'pending'
  for update skip locked;

  if not found then
    raise exception 'Request % is not pending or does not exist', p_request_id;
  end if;

  update public.pickup_requests
  set scheduled_date = p_new_date, time_slot = p_new_slot
  where id = p_request_id
  returning * into v_row;

  return next v_row;
end;
$$;

-- 5d. get_slot_count(date, slot) – for client capacity checks
create or replace function public.get_slot_count(p_date date, p_slot text)
returns int
language sql
security definer
set search_path = public
as $$
  select count(*)::int
  from public.pickup_requests
  where scheduled_date = p_date
    and time_slot = p_slot
    and status = 'pending';
$$;

-- ── STEP 6: Update the stats view ──────────────────────────────────────────
-- DROP first: Postgres cannot rename or reorder view columns with
-- CREATE OR REPLACE VIEW.  Dropping + recreating is the safe pattern
-- whenever the column list changes.  No data is stored in the view itself
-- (it is a query alias), so dropping it is risk-free.
drop view if exists public.request_stats;

create view public.request_stats as
select
  count(*) filter (where status = 'pending')                          as total_pending,
  count(*) filter (where status = 'processed')                        as total_processed,
  count(*) filter (where status = 'rejected')                         as total_rejected,
  count(*) filter (where status = 'processed' and waste_type = 'dry') as processed_dry,
  count(*) filter (where status = 'processed' and waste_type = 'wet') as processed_wet
from public.pickup_requests;

-- Re-grant SELECT to authenticated and anon roles so RLS-bypassing queries
-- from supabase-js (anon key) still work after the view is recreated.
grant select on public.request_stats to authenticated, anon;

-- ── Done ────────────────────────────────────────────────────────────────────
-- After running this migration:
--   1. Verify the new columns exist in pickup_requests.
--   2. Check that the status constraint now allows 'rejected'.
--   3. Verify the request-images bucket appears in Storage.
--   4. Run seed.sql to populate sample data.
