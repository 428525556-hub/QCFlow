-- QCFlow 权限策略（唯一权威版本，可重复执行）
-- 规则：
--   staff / admin：可读全部业务数据，可修改任意订单与明细（团队共享工作流）
--   client：只能读取自己客户(customer_name)匹配的订单数据，禁止写入业务表
--   field_inspector：只能读取/写入自己客户且 inspection_plan='field' 的出差检品
--   inspection_records 删除：仅限记录本人或 admin（防止员工互相删除）

-- ============ user_profiles ============
drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles for select
using (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

drop policy if exists "users can create own profile" on public.user_profiles;
create policy "users can create own profile"
on public.user_profiles for insert
with check (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

drop policy if exists "users can update own profile and admin can update profiles" on public.user_profiles;
create policy "users can update own profile and admin can update profiles"
on public.user_profiles for update
using (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com')
with check (auth.uid() = id or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

-- ============ orders ============
drop policy if exists "users can read own orders" on public.orders;
create policy "users can read own orders"
on public.orders for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'client' and p.customer_name = orders.customer_name)
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'field_inspector' and p.customer_name = orders.customer_name and orders.inspection_plan = 'field')
);

drop policy if exists "users can insert own orders" on public.orders;
create policy "users can insert own orders"
on public.orders for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own orders" on public.orders;
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

drop policy if exists "users can delete own orders" on public.orders;
create policy "users can delete own orders"
on public.orders for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ order_items ============
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
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = order_items.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field'
  )
);

drop policy if exists "users can insert own order items" on public.order_items;
create policy "users can insert own order items"
on public.order_items for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own order items" on public.order_items;
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

drop policy if exists "users can delete own order items" on public.order_items;
create policy "users can delete own order items"
on public.order_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ reservation_cartons ============
drop policy if exists "users can read own reservation cartons" on public.reservation_cartons;
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
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = reservation_cartons.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field'
  )
);

drop policy if exists "users can insert own reservation cartons" on public.reservation_cartons;
create policy "users can insert own reservation cartons"
on public.reservation_cartons for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own reservation cartons" on public.reservation_cartons;
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

drop policy if exists "users can delete own reservation cartons" on public.reservation_cartons;
create policy "users can delete own reservation cartons"
on public.reservation_cartons for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ reservation_carton_items ============
drop policy if exists "users can read own reservation carton items" on public.reservation_carton_items;
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
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = reservation_carton_items.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field'
  )
);

drop policy if exists "users can insert own reservation carton items" on public.reservation_carton_items;
create policy "users can insert own reservation carton items"
on public.reservation_carton_items for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own reservation carton items" on public.reservation_carton_items;
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

drop policy if exists "users can delete own reservation carton items" on public.reservation_carton_items;
create policy "users can delete own reservation carton items"
on public.reservation_carton_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ order_attachments ============
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
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = order_attachments.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field'
  )
);

drop policy if exists "users can insert own order attachments" on public.order_attachments;
create policy "users can insert own order attachments"
on public.order_attachments for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own order attachments" on public.order_attachments;
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

drop policy if exists "users can delete own order attachments" on public.order_attachments;
create policy "users can delete own order attachments"
on public.order_attachments for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ shipment_cartons ============
drop policy if exists "users can read own shipment cartons" on public.shipment_cartons;
create policy "users can read own shipment cartons"
on public.shipment_cartons for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "users can insert own shipment cartons" on public.shipment_cartons;
create policy "users can insert own shipment cartons"
on public.shipment_cartons for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own shipment cartons" on public.shipment_cartons;
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

drop policy if exists "users can delete own shipment cartons" on public.shipment_cartons;
create policy "users can delete own shipment cartons"
on public.shipment_cartons for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ shipment_items ============
drop policy if exists "users can read own shipment items" on public.shipment_items;
create policy "users can read own shipment items"
on public.shipment_items for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "users can insert own shipment items" on public.shipment_items;
create policy "users can insert own shipment items"
on public.shipment_items for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update own shipment items" on public.shipment_items;
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

drop policy if exists "users can delete own shipment items" on public.shipment_items;
create policy "users can delete own shipment items"
on public.shipment_items for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ inspection_records ============
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
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = inspection_records.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field' and inspection_records.inspection_stage = 'field'
  )
);

drop policy if exists "users can insert own records" on public.inspection_records;
create policy "users can insert own records"
on public.inspection_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
    or exists (
      select 1 from public.orders o
      join public.user_profiles p on p.id = auth.uid()
      where o.id = inspection_records.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field' and inspection_records.inspection_stage = 'field'
    )
  )
);

drop policy if exists "users can update own records" on public.inspection_records;
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

drop policy if exists "users can delete own records" on public.inspection_records;
create policy "users can delete own records"
on public.inspection_records for delete
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ============ reinspection_records ============
drop policy if exists "users can read reinspection records" on public.reinspection_records;
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
  or exists (
    select 1 from public.orders o
    join public.user_profiles p on p.id = auth.uid()
    where o.id = reinspection_records.order_id and p.role = 'field_inspector' and p.customer_name = o.customer_name and o.inspection_plan = 'field' and reinspection_records.inspection_stage = 'field'
  )
);

drop policy if exists "users can insert reinspection records" on public.reinspection_records;
create policy "users can insert reinspection records"
on public.reinspection_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "users can update reinspection records" on public.reinspection_records;
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

drop policy if exists "users can delete reinspection records" on public.reinspection_records;
create policy "users can delete reinspection records"
on public.reinspection_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ unboxing_records ============
drop policy if exists "staff can read unboxing records" on public.unboxing_records;
create policy "staff can read unboxing records"
on public.unboxing_records for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "staff can insert unboxing records" on public.unboxing_records;
create policy "staff can insert unboxing records"
on public.unboxing_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "staff can update unboxing records" on public.unboxing_records;
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

drop policy if exists "staff can delete unboxing records" on public.unboxing_records;
create policy "staff can delete unboxing records"
on public.unboxing_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ dispatch_records ============
drop policy if exists "staff can read dispatch records" on public.dispatch_records;
create policy "staff can read dispatch records"
on public.dispatch_records for select
using (
  auth.uid() = user_id
  or (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "staff can insert dispatch records" on public.dispatch_records;
create policy "staff can insert dispatch records"
on public.dispatch_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  )
);

drop policy if exists "staff can update dispatch records" on public.dispatch_records;
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

drop policy if exists "staff can delete dispatch records" on public.dispatch_records;
create policy "staff can delete dispatch records"
on public.dispatch_records for delete
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

-- ============ registration_invites ============
drop policy if exists "admin can read invites and visitors can validate active invites" on public.registration_invites;
create policy "admin can read invites and visitors can validate active invites"
on public.registration_invites for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or (active = true and used_at is null and expires_at > now())
);

drop policy if exists "admin can insert invites" on public.registration_invites;
create policy "admin can insert invites"
on public.registration_invites for insert
with check ((auth.jwt() ->> 'email') = 'shuoyuqc@163.com');

drop policy if exists "admin can update invites and visitors can consume invites" on public.registration_invites;
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

-- ============ storage.objects ============
drop policy if exists "users can upload inspection photos" on storage.objects;
create policy "users can upload inspection photos"
on storage.objects for insert
with check (bucket_id = 'inspection-photos' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can view inspection photos" on storage.objects;
create policy "users can view inspection photos"
on storage.objects for select
using (bucket_id = 'inspection-photos');

drop policy if exists "users can upload order attachments" on storage.objects;
create policy "users can upload order attachments"
on storage.objects for insert
with check (bucket_id = 'order-attachments' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can view order attachments" on storage.objects;
create policy "users can view order attachments"
on storage.objects for select
using (bucket_id = 'order-attachments');
