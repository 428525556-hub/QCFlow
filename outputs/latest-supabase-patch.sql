-- QCFlow latest patch: client portal, defect color/size, unboxing
-- Safe to run multiple times in Supabase SQL Editor.

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  email text not null,
  role text not null default 'staff',
  customer_name text
);

alter table public.user_profiles drop constraint if exists user_profiles_role_check;
alter table public.user_profiles add constraint user_profiles_role_check check (role in ('admin', 'staff', 'client'));
alter table public.user_profiles enable row level security;

alter table public.registration_invites add column if not exists role text not null default 'staff';
alter table public.registration_invites add column if not exists customer_name text;
alter table public.registration_invites drop constraint if exists registration_invites_role_check;
alter table public.registration_invites add constraint registration_invites_role_check check (role in ('staff', 'client'));

alter table public.inspection_records add column if not exists color text;
alter table public.inspection_records add column if not exists size text;

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
