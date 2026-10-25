-- ============================================================
-- Neighborhood Waste Collection Planner – Full Schema (v2)
-- SDG 11 · Sustainable Cities and Communities
-- Paste this entire file into the Supabase SQL Editor for fresh setup.
-- For existing databases use migration_v2.sql instead.
-- ============================================================

-- ── 1. PROFILES ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id    uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role  text not null default 'user' check (role in ('user', 'admin'))
);

-- ── 2. AUTO-CREATE PROFILE ON SIGNUP ────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'user');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 3. PICKUP REQUESTS ──────────────────────────────────────────────────────
--    FIFO order by created_at ASC.
--    status: 'pending' | 'processed' | 'rejected'
create table if not exists public.pickup_requests (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  -- Location
  building         text        not null,
  flat_number      text,
  street           text,
  -- Contact
  phone            text,
  -- Waste
  waste_type       text        not null check (waste_type in ('dry', 'wet')),
  waste_items      text[]      default '{}',
  quantity         text        check (quantity in ('small', 'medium', 'large')),
  -- Schedule
  scheduled_date   date,
  time_slot        text        check (time_slot in ('morning', 'afternoon', 'evening')),
  -- Misc
  note             text,
  image_url        text,
  status           text        not null default 'pending'
                               check (status in ('pending', 'processed', 'rejected')),
  -- Timestamps
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  reviewed_at      timestamptz,
  rejection_reason text
);

create index if not exists idx_pickup_requests_status_created
  on public.pickup_requests (status, created_at asc);

create index if not exists idx_pickup_requests_date_slot
  on public.pickup_requests (scheduled_date, time_slot, created_at asc)
  where status = 'pending';

-- ── 4. ROW-LEVEL SECURITY ───────────────────────────────────────────────────
alter table public.profiles        enable row level security;
alter table public.pickup_requests enable row level security;

drop policy if exists "Users see own profile"       on public.profiles;
drop policy if exists "Users update own profile"    on public.profiles;
drop policy if exists "Users insert own requests"   on public.pickup_requests;
drop policy if exists "Users select own requests"   on public.pickup_requests;
drop policy if exists "Admins update requests"      on public.pickup_requests;

create policy "Users see own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);

create policy "Users insert own requests"
  on public.pickup_requests for insert
  with check (auth.uid() = user_id);

create policy "Users select own requests"
  on public.pickup_requests for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Admins update requests"
  on public.pickup_requests for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ── 5. STORAGE ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('request-images', 'request-images', true)
on conflict (id) do nothing;

drop policy if exists "Users upload own images" on storage.objects;
drop policy if exists "Anyone can view images"  on storage.objects;
drop policy if exists "Users delete own images" on storage.objects;

create policy "Users upload own images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'request-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Anyone can view images"
  on storage.objects for select using (bucket_id = 'request-images');

create policy "Users delete own images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'request-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 6. RPCs ─────────────────────────────────────────────────────────────────

-- 6a. process_next_request() – kept for backward compatibility
create or replace function public.process_next_request()
returns setof public.pickup_requests language plpgsql security definer set search_path = public
as $$
declare v_row public.pickup_requests;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Access denied: admins only';
  end if;
  select * into v_row from public.pickup_requests
  where status = 'pending' order by created_at asc limit 1 for update skip locked;
  if not found then return; end if;
  update public.pickup_requests set status = 'processed', processed_at = now()
  where id = v_row.id returning * into v_row;
  return next v_row;
end;
$$;

-- 6b. process_request(request_id)
create or replace function public.process_request(p_request_id uuid)
returns setof public.pickup_requests language plpgsql security definer set search_path = public
as $$
declare v_row public.pickup_requests;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Access denied: admins only';
  end if;
  select * into v_row from public.pickup_requests
  where id = p_request_id and status = 'pending' for update skip locked;
  if not found then raise exception 'Request % is not pending or does not exist', p_request_id; end if;
  update public.pickup_requests set status = 'processed', processed_at = now()
  where id = p_request_id returning * into v_row;
  return next v_row;
end;
$$;

-- 6c. reject_request(request_id, reason)
create or replace function public.reject_request(p_request_id uuid, p_reason text)
returns setof public.pickup_requests language plpgsql security definer set search_path = public
as $$
declare v_row public.pickup_requests;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Access denied: admins only';
  end if;
  if length(trim(p_reason)) < 3 then raise exception 'Rejection reason must be at least 3 characters'; end if;
  select * into v_row from public.pickup_requests
  where id = p_request_id and status = 'pending' for update skip locked;
  if not found then raise exception 'Request % is not pending or does not exist', p_request_id; end if;
  update public.pickup_requests
  set status = 'rejected', rejection_reason = trim(p_reason), reviewed_at = now()
  where id = p_request_id returning * into v_row;
  return next v_row;
end;
$$;

-- 6d. reschedule_request(request_id, new_date, new_slot)
create or replace function public.reschedule_request(p_request_id uuid, p_new_date date, p_new_slot text)
returns setof public.pickup_requests language plpgsql security definer set search_path = public
as $$
declare
  v_row   public.pickup_requests;
  v_count int;
  v_max   constant int := 5;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Access denied: admins only';
  end if;
  if p_new_slot not in ('morning', 'afternoon', 'evening') then
    raise exception 'Invalid slot: must be morning, afternoon, or evening';
  end if;
  select count(*) into v_count from public.pickup_requests
  where scheduled_date = p_new_date and time_slot = p_new_slot and status = 'pending' and id <> p_request_id;
  if v_count >= v_max then
    raise exception 'Slot % on % is full (capacity %)', p_new_slot, p_new_date, v_max;
  end if;
  select * into v_row from public.pickup_requests
  where id = p_request_id and status = 'pending' for update skip locked;
  if not found then raise exception 'Request % is not pending or does not exist', p_request_id; end if;
  update public.pickup_requests set scheduled_date = p_new_date, time_slot = p_new_slot
  where id = p_request_id returning * into v_row;
  return next v_row;
end;
$$;

-- 6e. get_slot_count(date, slot)
create or replace function public.get_slot_count(p_date date, p_slot text)
returns int language sql security definer set search_path = public
as $$
  select count(*)::int from public.pickup_requests
  where scheduled_date = p_date and time_slot = p_slot and status = 'pending';
$$;

-- ── 7. STATS VIEW ───────────────────────────────────────────────────────────
-- DROP first so this script is safe to re-run on an existing database.
-- Postgres raises "cannot change name of view column" if the column list
-- changes (e.g. inserting total_rejected before processed_dry).
-- A plain DROP + CREATE avoids this; the view holds no data, so it is safe.
drop view if exists public.request_stats;

create view public.request_stats as
select
  count(*) filter (where status = 'pending')                          as total_pending,
  count(*) filter (where status = 'processed')                        as total_processed,
  count(*) filter (where status = 'rejected')                         as total_rejected,
  count(*) filter (where status = 'processed' and waste_type = 'dry') as processed_dry,
  count(*) filter (where status = 'processed' and waste_type = 'wet') as processed_wet
from public.pickup_requests;

-- Grant so supabase-js (anon/authenticated roles) can SELECT this view.
grant select on public.request_stats to authenticated, anon;

-- ── Promote a user to admin ──────────────────────────────────────────────────
-- update public.profiles set role = 'admin' where email = 'admin@example.com';
