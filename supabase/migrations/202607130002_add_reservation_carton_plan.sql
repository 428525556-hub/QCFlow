create table if not exists public.reservation_cartons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  carton_no text not null,
  remark text,
  unique (order_id, carton_no)
);

create table if not exists public.reservation_carton_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reservation_carton_id uuid not null references public.reservation_cartons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  quantity integer not null check (quantity > 0)
);

alter table public.reservation_cartons enable row level security;
alter table public.reservation_carton_items enable row level security;

drop policy if exists "users can read own reservation cartons" on public.reservation_cartons;
create policy "users can read own reservation cartons"
on public.reservation_cartons for select
using (auth.uid() = user_id);

drop policy if exists "users can insert own reservation cartons" on public.reservation_cartons;
create policy "users can insert own reservation cartons"
on public.reservation_cartons for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own reservation cartons" on public.reservation_cartons;
create policy "users can update own reservation cartons"
on public.reservation_cartons for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own reservation cartons" on public.reservation_cartons;
create policy "users can delete own reservation cartons"
on public.reservation_cartons for delete
using (auth.uid() = user_id);

drop policy if exists "users can read own reservation carton items" on public.reservation_carton_items;
create policy "users can read own reservation carton items"
on public.reservation_carton_items for select
using (auth.uid() = user_id);

drop policy if exists "users can insert own reservation carton items" on public.reservation_carton_items;
create policy "users can insert own reservation carton items"
on public.reservation_carton_items for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own reservation carton items" on public.reservation_carton_items;
create policy "users can update own reservation carton items"
on public.reservation_carton_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users can delete own reservation carton items" on public.reservation_carton_items;
create policy "users can delete own reservation carton items"
on public.reservation_carton_items for delete
using (auth.uid() = user_id);
