create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_type text not null default 'reservation',
  customer_name text not null,
  factory_name text not null,
  po_number text not null,
  sku text not null,
  inbound_date date,
  shipping_date date,
  inspection_plan text not null default 'both',
  reservation_remark text,
  color text not null,
  size text not null,
  quantity integer not null check (quantity > 0),
  inbound_quantity integer not null default 0 check (inbound_quantity >= 0),
  status text not null default '未开始'
);

alter table public.orders add column if not exists deleted_at timestamptz;
alter table public.orders add column if not exists order_type text not null default 'reservation';
alter table public.orders add column if not exists inbound_quantity integer not null default 0;
alter table public.orders add column if not exists inspection_plan text not null default 'both';
alter table public.orders add column if not exists reservation_remark text;
alter table public.orders drop constraint if exists orders_inspection_plan_check;
alter table public.orders add constraint orders_inspection_plan_check check (inspection_plan in ('normal', 'xray', 'both'));
alter table public.orders drop constraint if exists orders_order_type_check;
alter table public.orders add constraint orders_order_type_check check (order_type in ('reservation', 'inbound'));
alter table public.orders add column if not exists inbound_date date;
alter table public.orders add column if not exists shipping_date date;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in ('未开始', '检品中', '已完成'));

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  carton_count integer not null default 0 check (carton_count >= 0),
  quantity_per_carton integer not null default 10 check (quantity_per_carton >= 0),
  quantity integer not null check (quantity > 0)
  ,
  inbound_quantity integer not null default 0 check (inbound_quantity >= 0)
);

alter table public.order_items add column if not exists po_number text not null default '';
alter table public.order_items add column if not exists sku text not null default '';
alter table public.order_items add column if not exists carton_count integer not null default 0;
alter table public.order_items add column if not exists quantity_per_carton integer not null default 10;
alter table public.order_items add column if not exists inbound_quantity integer not null default 0;

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_path text not null,
  mime_type text,
  file_size integer
);

create table if not exists public.shipment_cartons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  carton_no text not null,
  remark text
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  carton_id uuid not null references public.shipment_cartons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  quantity integer not null check (quantity > 0)
);

create table if not exists public.dispatch_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_cartons integer not null default 0 check (total_cartons >= 0),
  total_quantity integer not null default 0 check (total_quantity >= 0),
  expected_quantity integer not null default 0 check (expected_quantity >= 0),
  is_full_dispatch boolean not null default false,
  shortage_detail text,
  vehicle_plate text,
  remark text,
  vehicle_photo_url text,
  vehicle_photo_path text,
  carton_photo_url text,
  carton_photo_path text,
  container_photo_url text,
  container_photo_path text
);

create table if not exists public.inspection_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inspection_stage text not null default 'normal',
  defect_type text not null,
  quantity integer not null check (quantity > 0),
  remark text,
  photo_url text,
  photo_path text
);

create table if not exists public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_email text not null,
  code_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_email text,
  used_by_user_id uuid references auth.users(id) on delete set null
);

alter table public.inspection_records drop constraint if exists inspection_records_defect_type_check;
alter table public.inspection_records add column if not exists inspection_stage text not null default 'normal';
alter table public.inspection_records drop constraint if exists inspection_records_inspection_stage_check;
alter table public.inspection_records add constraint inspection_records_inspection_stage_check check (inspection_stage in ('normal', 'xray'));

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_attachments enable row level security;
alter table public.shipment_cartons enable row level security;
alter table public.shipment_items enable row level security;
alter table public.dispatch_records enable row level security;
alter table public.inspection_records enable row level security;
alter table public.registration_invites enable row level security;

drop policy if exists "users can read own orders" on public.orders;
drop policy if exists "users can insert own orders" on public.orders;
drop policy if exists "users can update own orders" on public.orders;
drop policy if exists "users can delete own orders" on public.orders;
drop policy if exists "users can read own order items" on public.order_items;
drop policy if exists "users can insert own order items" on public.order_items;
drop policy if exists "users can update own order items" on public.order_items;
drop policy if exists "users can read own order attachments" on public.order_attachments;
drop policy if exists "users can insert own order attachments" on public.order_attachments;
drop policy if exists "users can update own order attachments" on public.order_attachments;
drop policy if exists "users can read own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can insert own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can update own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can delete own shipment cartons" on public.shipment_cartons;
drop policy if exists "users can read own shipment items" on public.shipment_items;
drop policy if exists "users can insert own shipment items" on public.shipment_items;
drop policy if exists "users can update own shipment items" on public.shipment_items;
drop policy if exists "users can delete own shipment items" on public.shipment_items;
drop policy if exists "users can read own records" on public.inspection_records;
drop policy if exists "users can insert own records" on public.inspection_records;
drop policy if exists "users can update own records" on public.inspection_records;
drop policy if exists "admin can read invites and visitors can validate active invites" on public.registration_invites;
drop policy if exists "admin can insert invites" on public.registration_invites;
drop policy if exists "admin can update invites and visitors can consume invites" on public.registration_invites;
drop policy if exists "users can upload inspection photos" on storage.objects;
drop policy if exists "users can view inspection photos" on storage.objects;
drop policy if exists "users can upload order attachments" on storage.objects;
drop policy if exists "users can view order attachments" on storage.objects;

create policy "users can read own orders"
on public.orders for select
using (auth.uid() = user_id);

create policy "users can insert own orders"
on public.orders for insert
with check (auth.uid() = user_id);

create policy "users can update own orders"
on public.orders for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own orders"
on public.orders for delete
using (auth.uid() = user_id);

create policy "users can read own order items"
on public.order_items for select
using (auth.uid() = user_id);

create policy "users can insert own order items"
on public.order_items for insert
with check (auth.uid() = user_id);

create policy "users can update own order items"
on public.order_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can read own order attachments" on public.order_attachments;
create policy "users can read own order attachments"
on public.order_attachments for select
using (auth.uid() = user_id);

drop policy if exists "users can insert own order attachments" on public.order_attachments;
create policy "users can insert own order attachments"
on public.order_attachments for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own order attachments" on public.order_attachments;
create policy "users can update own order attachments"
on public.order_attachments for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can read own shipment cartons"
on public.shipment_cartons for select
using (auth.uid() = user_id);

create policy "users can insert own shipment cartons"
on public.shipment_cartons for insert
with check (auth.uid() = user_id);

create policy "users can update own shipment cartons"
on public.shipment_cartons for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own shipment cartons"
on public.shipment_cartons for delete
using (auth.uid() = user_id);

create policy "users can read own shipment items"
on public.shipment_items for select
using (auth.uid() = user_id);

create policy "users can insert own shipment items"
on public.shipment_items for insert
with check (auth.uid() = user_id);

create policy "users can update own shipment items"
on public.shipment_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "users can delete own shipment items"
on public.shipment_items for delete
using (auth.uid() = user_id);

create policy "users can read own records"
on public.inspection_records for select
using (auth.uid() = user_id);

create policy "users can insert own records"
on public.inspection_records for insert
with check (auth.uid() = user_id);

create policy "users can update own records"
on public.inspection_records for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "admin can read invites and visitors can validate active invites"
on public.registration_invites for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or (active = true and used_at is null and expires_at > now())
);

create policy "admin can insert invites"
on public.registration_invites for insert
with check ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

create policy "admin can update invites and visitors can consume invites"
on public.registration_invites for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or (active = true and used_at is null and expires_at > now())
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or used_at is not null
);

insert into storage.buckets (id, name, public)
values ('inspection-photos', 'inspection-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('order-attachments', 'order-attachments', true)
on conflict (id) do nothing;

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

-- Customer portal and role based access
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff', 'client')),
  customer_name text
);

alter table public.registration_invites add column if not exists role text not null default 'staff';
alter table public.registration_invites add column if not exists customer_name text;
alter table public.registration_invites drop constraint if exists registration_invites_role_check;
alter table public.registration_invites add constraint registration_invites_role_check check (role in ('staff', 'client'));

alter table public.user_profiles enable row level security;

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

drop policy if exists "users can read own orders" on public.orders;
create policy "users can read own orders"
on public.orders for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'client' and p.customer_name = orders.customer_name)
);

drop policy if exists "users can insert own orders" on public.orders;
create policy "users can insert own orders"
on public.orders for insert
with check (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

drop policy if exists "users can update own orders" on public.orders;
create policy "users can update own orders"
on public.orders for update
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
)
with check (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

drop policy if exists "users can delete own orders" on public.orders;
create policy "users can delete own orders"
on public.orders for delete
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

drop policy if exists "users can read own order items" on public.order_items;
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

drop policy if exists "users can read own records" on public.inspection_records;
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

drop policy if exists "users can read own order attachments" on public.order_attachments;
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

-- Defect color and size tracking
alter table public.inspection_records add column if not exists color text;
alter table public.inspection_records add column if not exists size text;

-- Unboxing records for cartons arriving on the production line
create table if not exists public.unboxing_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  carton_no text not null,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  quantity integer not null check (quantity >= 0),
  shortage_quantity integer not null default 0 check (shortage_quantity >= 0),
  remark text,
  photo_url text,
  photo_path text
);

alter table public.unboxing_records enable row level security;

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
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

create policy "staff can update unboxing records"
on public.unboxing_records for update
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
)
with check (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

create policy "staff can delete unboxing records"
on public.unboxing_records for delete
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

-- Reinspection records for repaired defects returning to the line
create table if not exists public.reinspection_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  source_record_id uuid not null references public.inspection_records(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inspection_stage text not null,
  defect_type text not null,
  color text,
  size text,
  passed_quantity integer not null default 0 check (passed_quantity >= 0),
  failed_quantity integer not null default 0 check (failed_quantity >= 0),
  remark text
);

alter table public.reinspection_records drop constraint if exists reinspection_records_inspection_stage_check;
alter table public.reinspection_records add constraint reinspection_records_inspection_stage_check check (inspection_stage in ('normal', 'xray'));
alter table public.reinspection_records enable row level security;

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
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

create policy "users can update reinspection records"
on public.reinspection_records for update
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
)
with check (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

create policy "users can delete reinspection records"
on public.reinspection_records for delete
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

-- Final dispatch records for truck/container handover
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
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

create policy "staff can update dispatch records"
on public.dispatch_records for update
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
)
with check (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);

create policy "staff can delete dispatch records"
on public.dispatch_records for delete
using (
  auth.uid() = user_id
  and ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com' or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff')))
);
