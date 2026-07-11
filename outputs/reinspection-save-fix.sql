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
);

create policy "users can insert reinspection records"
on public.reinspection_records for insert
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  )
);

create policy "users can update reinspection records"
on public.reinspection_records for update
using (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  )
)
with check (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  )
);

create policy "users can delete reinspection records"
on public.reinspection_records for delete
using (
  auth.uid() = user_id
  and (
    (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
    or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
    or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())
  )
);
