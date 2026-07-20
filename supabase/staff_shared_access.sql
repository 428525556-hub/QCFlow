-- QCFlow staff shared access policy
-- Purpose:
-- 1. Admin and staff accounts can see and operate the same company orders.
-- 2. Client accounts can only read orders that match their customer_name.
-- 3. Existing auth users are backfilled into public.user_profiles.
--
-- Run this in Supabase SQL Editor.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff', 'client')),
  customer_name text
);

alter table public.user_profiles enable row level security;

insert into public.user_profiles (id, email, role, customer_name)
select
  u.id,
  lower(coalesce(u.email, '')),
  case
    when lower(coalesce(u.email, '')) = 'shuoyuqc@163.com' then 'admin'
    when coalesce(u.raw_user_meta_data ->> 'role', '') in ('admin', 'staff', 'client') then u.raw_user_meta_data ->> 'role'
    else 'staff'
  end as role,
  nullif(u.raw_user_meta_data ->> 'customer_name', '') as customer_name
from auth.users u
where u.email is not null
on conflict (id) do update
set
  email = excluded.email,
  role = case
    when excluded.email = 'shuoyuqc@163.com' then 'admin'
    when public.user_profiles.role in ('admin', 'staff', 'client') then public.user_profiles.role
    else excluded.role
  end,
  customer_name = coalesce(public.user_profiles.customer_name, excluded.customer_name);

drop policy if exists "users can read own profile" on public.user_profiles;
drop policy if exists "users can create own profile" on public.user_profiles;
drop policy if exists "users can update own profile and admin can update profiles" on public.user_profiles;

create policy "users can read own profile"
on public.user_profiles for select
using (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

create policy "users can create own profile"
on public.user_profiles for insert
with check (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

create policy "users can update own profile and admin can update profiles"
on public.user_profiles for update
using (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com')
with check (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

-- Orders
drop policy if exists "users can read own orders" on public.orders;
drop policy if exists "users can insert own orders" on public.orders;
drop policy if exists "users can update own orders" on public.orders;
drop policy if exists "users can delete own orders" on public.orders;

create policy "users can read own orders"
on public.orders for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'client' and p.customer_name = orders.customer_name)
);

create policy "users can insert own orders"
on public.orders for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own orders"
on public.orders for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own orders"
on public.orders for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Order items
drop policy if exists "users can read own order items" on public.order_items;
drop policy if exists "users can insert own order items" on public.order_items;
drop policy if exists "users can update own order items" on public.order_items;
drop policy if exists "users can delete own order items" on public.order_items;

create policy "users can read own order items"
on public.order_items for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = order_items.order_id and p.role = 'client' and p.customer_name = o.customer_name
  )
);

create policy "users can insert own order items"
on public.order_items for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own order items"
on public.order_items for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own order items"
on public.order_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Reservation carton plan
drop policy if exists "users can read own reservation cartons" on public.reservation_cartons;
drop policy if exists "users can insert own reservation cartons" on public.reservation_cartons;
drop policy if exists "users can update own reservation cartons" on public.reservation_cartons;
drop policy if exists "users can delete own reservation cartons" on public.reservation_cartons;

create policy "users can read own reservation cartons"
on public.reservation_cartons for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = reservation_cartons.order_id and p.role = 'client' and p.customer_name = o.customer_name
  )
);

create policy "users can insert own reservation cartons"
on public.reservation_cartons for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own reservation cartons"
on public.reservation_cartons for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own reservation cartons"
on public.reservation_cartons for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "users can read own reservation carton items" on public.reservation_carton_items;
drop policy if exists "users can insert own reservation carton items" on public.reservation_carton_items;
drop policy if exists "users can update own reservation carton items" on public.reservation_carton_items;
drop policy if exists "users can delete own reservation carton items" on public.reservation_carton_items;

create policy "users can read own reservation carton items"
on public.reservation_carton_items for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = reservation_carton_items.order_id and p.role = 'client' and p.customer_name = o.customer_name
  )
);

create policy "users can insert own reservation carton items"
on public.reservation_carton_items for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own reservation carton items"
on public.reservation_carton_items for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own reservation carton items"
on public.reservation_carton_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Order attachments
drop policy if exists "users can read own order attachments" on public.order_attachments;
drop policy if exists "users can insert own order attachments" on public.order_attachments;
drop policy if exists "users can update own order attachments" on public.order_attachments;
drop policy if exists "users can delete own order attachments" on public.order_attachments;

create policy "users can read own order attachments"
on public.order_attachments for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = order_attachments.order_id and p.role = 'client' and p.customer_name = o.customer_name
  )
);

create policy "users can insert own order attachments"
on public.order_attachments for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own order attachments"
on public.order_attachments for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own order attachments"
on public.order_attachments for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Inspection and reinspection
drop policy if exists "users can read own records" on public.inspection_records;
drop policy if exists "users can insert own records" on public.inspection_records;
drop policy if exists "users can update own records" on public.inspection_records;
drop policy if exists "users can delete own records" on public.inspection_records;

create policy "users can read own records"
on public.inspection_records for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = inspection_records.order_id and p.role = 'client' and p.customer_name = o.customer_name
  )
);

create policy "users can insert own records"
on public.inspection_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own records"
on public.inspection_records for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own records"
on public.inspection_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "users can read reinspection records" on public.reinspection_records;
drop policy if exists "users can insert reinspection records" on public.reinspection_records;
drop policy if exists "users can update reinspection records" on public.reinspection_records;
drop policy if exists "users can delete reinspection records" on public.reinspection_records;

create policy "users can read reinspection records"
on public.reinspection_records for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = reinspection_records.order_id and p.role = 'client' and p.customer_name = o.customer_name
  )
);

create policy "users can insert reinspection records"
on public.reinspection_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update reinspection records"
on public.reinspection_records for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete reinspection records"
on public.reinspection_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Unboxing, packing, shipment and dispatch
drop policy if exists "staff can read unboxing records" on public.unboxing_records;
drop policy if exists "staff can insert unboxing records" on public.unboxing_records;
drop policy if exists "staff can update unboxing records" on public.unboxing_records;
drop policy if exists "staff can delete unboxing records" on public.unboxing_records;

create policy "staff can read unboxing records"
on public.unboxing_records for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "staff can insert unboxing records"
on public.unboxing_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "staff can update unboxing records"
on public.unboxing_records for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "staff can delete unboxing records"
on public.unboxing_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "users can read own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can insert own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can update own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can delete own shipment cartons" on public.shipment_cartons;

create policy "users can read own shipment cartons"
on public.shipment_cartons for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can insert own shipment cartons"
on public.shipment_cartons for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own shipment cartons"
on public.shipment_cartons for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own shipment cartons"
on public.shipment_cartons for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "users can read own shipment items" on public.shipment_items;
drop policy if exists "users can insert own shipment items" on public.shipment_items;
drop policy if exists "users can update own shipment items" on public.shipment_items;
drop policy if exists "users can delete own shipment items" on public.shipment_items;

create policy "users can read own shipment items"
on public.shipment_items for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can insert own shipment items"
on public.shipment_items for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "users can update own shipment items"
on public.shipment_items for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "users can delete own shipment items"
on public.shipment_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "staff can read dispatch records" on public.dispatch_records;
drop policy if exists "staff can insert dispatch records" on public.dispatch_records;
drop policy if exists "staff can update dispatch records" on public.dispatch_records;
drop policy if exists "staff can delete dispatch records" on public.dispatch_records;

create policy "staff can read dispatch records"
on public.dispatch_records for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "staff can insert dispatch records"
on public.dispatch_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "staff can update dispatch records"
on public.dispatch_records for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

create policy "staff can delete dispatch records"
on public.dispatch_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- Storage read policies. Upload still uses each user's own folder.
insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('order-attachments', 'order-attachments', true)
on conflict (id) do nothing;

drop policy if exists "users can upload inspection photos" on storage.objects;
drop policy if exists "users can view inspection photos" on storage.objects;
drop policy if exists "users can upload order attachments" on storage.objects;
drop policy if exists "users can view order attachments" on storage.objects;

create policy "users can upload inspection photos"
on storage.objects for insert
with check (bucket_id = 'inspection-photos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can view inspection photos"
on storage.objects for select
using (bucket_id = 'inspection-photos');

create policy "users can upload order attachments"
on storage.objects for insert
with check (bucket_id = 'order-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "users can view order attachments"
on storage.objects for select
using (bucket_id = 'order-attachments');
