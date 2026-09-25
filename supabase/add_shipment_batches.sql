-- ============================================================
-- 出货批次（总单编号/总体备注）
-- 一个批次 = 同一客户 + 同一出货日期 的所有订单
-- 在 Supabase SQL Editor 中运行
-- ============================================================

create table if not exists public.shipment_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null,
  shipping_date date not null,
  batch_no text,
  remark text,
  unique (customer_name, shipping_date)
);

alter table public.shipment_batches enable row level security;

drop policy if exists "staff can read shipment batches" on public.shipment_batches;
create policy "staff can read shipment batches"
on public.shipment_batches for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'client' and p.customer_name = shipment_batches.customer_name)
);

drop policy if exists "staff can insert shipment batches" on public.shipment_batches;
create policy "staff can insert shipment batches"
on public.shipment_batches for insert
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "staff can update shipment batches" on public.shipment_batches;
create policy "staff can update shipment batches"
on public.shipment_batches for update
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);
