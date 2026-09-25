-- 出货日期待定标记（手动预约 + Excel 导入共用）
-- 在 Supabase SQL Editor 中运行
alter table public.orders
  add column if not exists shipping_date_tbd boolean not null default false;
