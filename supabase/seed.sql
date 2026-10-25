-- ============================================================
-- seed.sql v2 – 12 sample pickup requests for demo
-- ============================================================
-- Requires: at least ONE user signed up through the app first.
-- The script uses the first profile's id automatically.
-- Spread across today and the next 2 days, all 3 slots,
-- both waste types, different buildings, phones, items.
-- 1 row is pre-rejected to demonstrate the rejected flow.
-- ============================================================

do $$
declare
  demo_user uuid;
  today     date := current_date;
begin
  -- Use the first available user (sign up before running this)
  select id into demo_user from public.profiles limit 1;

  if demo_user is null then
    raise notice 'No profile found. Sign up at least one account first, then re-run seed.sql.';
    return;
  end if;

  -- Clear old seed data for idempotency
  delete from public.pickup_requests where user_id = demo_user;

  insert into public.pickup_requests
    (user_id, building, flat_number, street, phone,
     waste_type, waste_items, quantity,
     scheduled_date, time_slot,
     note, status, created_at)
  values
    -- TODAY – Morning slot (2 requests)
    (demo_user, 'Sunrise Apartments', '101', 'MG Road',      '+919876543210',
     'dry',  ARRAY['Plastic','Paper/Cardboard'],  'small',
     today, 'morning',
     'Bags near gate',             'pending',  now() - interval '9 hours'),

    (demo_user, 'Green View Society', '204', 'Station Road', '+919876543211',
     'wet',  ARRAY['Kitchen/Food waste'],         'medium',
     today, 'morning',
     null,                         'pending',  now() - interval '8 hours 30 minutes'),

    -- TODAY – Afternoon slot (3 requests)
    (demo_user, 'Lakeview Residency', '305', 'Lake Road',   '+919876543212',
     'dry',  ARRAY['Glass','Metal'],               'small',
     today, 'afternoon',
     'Fragile – handle carefully', 'pending',  now() - interval '8 hours'),

    (demo_user, 'Palm Heights',       '402', 'Bus Stand Rd','+919876543213',
     'wet',  ARRAY['Garden waste'],                'large',
     today, 'afternoon',
     'Garden clippings in bin',    'pending',  now() - interval '7 hours'),

    (demo_user, 'Sunset Towers',      'B2',  'Ring Road',   '+919876543214',
     'dry',  ARRAY['Cloth','Other: Old furniture'],'medium',
     today, 'afternoon',
     null,                         'pending',  now() - interval '6 hours'),

    -- TODAY – Evening slot (2 requests, one rejected)
    (demo_user, 'Orchid Enclave',     '501', 'Park Avenue',  '+919876543215',
     'wet',  ARRAY['Kitchen/Food waste','Garden waste'], 'small',
     today, 'evening',
     null,                         'pending',  now() - interval '5 hours'),

    (demo_user, 'Maple Gardens',      '103', 'Old Bus Rd',   '+919876543216',
     'dry',  ARRAY['Plastic','Glass'],             'small',
     today, 'evening',
     null,   /* Rejected example */  'rejected', now() - interval '4 hours 30 minutes'),

    -- TOMORROW – Morning + Afternoon slots (3 requests)
    (demo_user, 'Blue Ridge Flats',   '201', 'Hill Street',  '+919876543217',
     'wet',  ARRAY['Kitchen/Food waste'],          'medium',
     today + 1, 'morning',
     null,                         'pending',  now() - interval '4 hours'),

    (demo_user, 'Cedar Grove',        '302', 'Temple Road',  '+919876543218',
     'dry',  ARRAY['Paper/Cardboard','Metal'],     'large',
     today + 1, 'morning',
     'Tied with rope',             'pending',  now() - interval '3 hours'),

    (demo_user, 'The Meridian',       '404', 'Central Ave',  '+919876543219',
     'wet',  ARRAY['Garden waste','Other: Leaves'],'small',
     today + 1, 'afternoon',
     null,                         'pending',  now() - interval '2 hours'),

    -- DAY AFTER TOMORROW (2 requests)
    (demo_user, 'Royal Palms',        '601', 'East Wing',    '+919876543220',
     'dry',  ARRAY['Plastic','Cloth'],             'medium',
     today + 2, 'morning',
     'Third floor, no lift',       'pending',  now() - interval '1 hour'),

    (demo_user, 'Amber Heights',      '702', 'West Gate',    '+919876543221',
     'wet',  ARRAY['Kitchen/Food waste'],          'large',
     today + 2, 'evening',
     null,                         'pending',  now() - interval '30 minutes');

  -- Set rejection details on the pre-rejected row
  update public.pickup_requests
  set rejection_reason = 'Outside service area for this slot',
      reviewed_at      = now() - interval '4 hours'
  where user_id = demo_user
    and building = 'Maple Gardens'
    and status   = 'rejected';

  raise notice 'Inserted 12 seed requests for user %', demo_user;
end;
$$;
