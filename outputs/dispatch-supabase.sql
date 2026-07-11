-- QCFlow 真正出货/运输记录
-- 用于记录货物搬上车辆/集装箱后的最终出货状态、差异和照片

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

alter table public.dispatch_records enable row level security;

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
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
)
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

create policy "staff can delete dispatch records"
on public.dispatch_records for delete
using (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);
