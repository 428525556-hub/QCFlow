-- QCFlow 订单回收站
-- 删除订单时先写入 deleted_at，回收站内再次删除才永久删除。

alter table public.orders add column if not exists deleted_at timestamptz;

create index if not exists orders_deleted_at_idx
on public.orders (deleted_at);
