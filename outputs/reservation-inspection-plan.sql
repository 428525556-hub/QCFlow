alter table public.orders add column if not exists inspection_plan text not null default 'both';
alter table public.orders add column if not exists reservation_remark text;

alter table public.orders drop constraint if exists orders_inspection_plan_check;
alter table public.orders add constraint orders_inspection_plan_check
check (inspection_plan in ('normal', 'xray', 'both'));
