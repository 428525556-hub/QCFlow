create or replace function public.create_order_with_items(
  order_payload jsonb,
  item_payload jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_order_id uuid;
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required' using errcode = '22023';
  end if;

  insert into public.orders (
    user_id,
    order_type,
    customer_name,
    factory_name,
    po_number,
    sku,
    inbound_date,
    shipping_date,
    inspection_plan,
    reservation_remark,
    color,
    size,
    quantity,
    inbound_quantity,
    status
  )
  values (
    current_user_id,
    coalesce(order_payload ->> 'order_type', 'reservation'),
    order_payload ->> 'customer_name',
    order_payload ->> 'factory_name',
    order_payload ->> 'po_number',
    order_payload ->> 'sku',
    nullif(order_payload ->> 'inbound_date', '')::date,
    nullif(order_payload ->> 'shipping_date', '')::date,
    coalesce(order_payload ->> 'inspection_plan', 'both'),
    nullif(order_payload ->> 'reservation_remark', ''),
    order_payload ->> 'color',
    order_payload ->> 'size',
    (order_payload ->> 'quantity')::integer,
    coalesce((order_payload ->> 'inbound_quantity')::integer, 0),
    order_payload ->> 'status'
  )
  returning id into new_order_id;

  insert into public.order_items (
    order_id,
    user_id,
    po_number,
    sku,
    color,
    size,
    quantity,
    inbound_quantity
  )
  select
    new_order_id,
    current_user_id,
    item ->> 'po_number',
    item ->> 'sku',
    item ->> 'color',
    item ->> 'size',
    (item ->> 'quantity')::integer,
    coalesce((item ->> 'inbound_quantity')::integer, 0)
  from jsonb_array_elements(item_payload) as item;

  return new_order_id;
end;
$$;

revoke all on function public.create_order_with_items(jsonb, jsonb) from public;
grant execute on function public.create_order_with_items(jsonb, jsonb) to authenticated;

