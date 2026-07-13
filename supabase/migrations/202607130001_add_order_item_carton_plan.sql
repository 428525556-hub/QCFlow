alter table public.order_items
  add column if not exists carton_count integer not null default 0,
  add column if not exists quantity_per_carton integer not null default 10;

alter table public.order_items
  drop constraint if exists order_items_carton_count_check,
  add constraint order_items_carton_count_check check (carton_count >= 0);

alter table public.order_items
  drop constraint if exists order_items_quantity_per_carton_check,
  add constraint order_items_quantity_per_carton_check check (quantity_per_carton >= 0);
