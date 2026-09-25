-- ============================================================
-- QCFlow 国内正式生产数据库 Schema（从零建立，不含任何业务数据）
-- 依据：supabase/schema.sql + migrations/* 合并整理 + DATABASE_REVIEW 修复
-- 说明：
--   1. 认证由应用层（Next.js API）负责，数据库不再依赖 Supabase Auth/RLS；
--   2. 用户信息存 public.users（账号）+ public.user_profiles（角色/资料）；
--   3. 函数内通过 app.current_user_id() / app.current_user_email() 取当前用户；
--   4. 不插入任何测试业务数据。
-- ============================================================

begin;

-- ---------- 0. 应用上下文辅助（替代 Supabase auth.*） ----------
create schema if not exists app;

create or replace function app.set_user(user_id uuid, user_email text)
returns void
language sql
as $$
  select set_config('app.user_id', user_id::text, false),
         set_config('app.user_email', user_email, false);
$$;

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

create or replace function app.current_user_email()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.user_email', true), '');
$$;

-- 更新 updated_at 的通用触发器
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- 1. 用户 ----------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null unique check (email = lower(email)),
  disabled boolean not null default false
);

create table if not exists public.user_profiles (
  id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text not null,
  role text not null default 'staff' check (role in ('admin', 'staff', 'client', 'field_inspector')),
  customer_name text
);

create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function app.set_updated_at();

-- ---------- 2. 班组 / 款式 / 日历 ----------
create table if not exists public.inspection_teams (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  work_start_time time,
  work_end_time time,
  daily_hours numeric not null default 8 check (daily_hours > 0),
  standard_daily_capacity integer not null check (standard_daily_capacity > 0),
  baseline_members integer not null default 1 check (baseline_members > 0),
  current_members integer not null default 0 check (current_members >= 0),
  max_daily_capacity integer not null check (max_daily_capacity >= standard_daily_capacity),
  inspection_types text[] not null default array['normal'],
  capacity_factors jsonb not null default '{"normal":1,"xray":0.8,"field":0.7}'::jsonb,
  enabled boolean not null default true,
  sort_order integer not null default 0
);

create trigger trg_inspection_teams_updated_at
before update on public.inspection_teams
for each row execute function app.set_updated_at();

create table if not exists public.style_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  factor numeric not null check (factor > 0),
  remark text,
  enabled boolean not null default true
);

create table if not exists public.production_calendar (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null unique,
  is_work_day boolean not null default true,
  work_hours numeric check (work_hours is null or work_hours > 0),
  remark text
);

create table if not exists public.team_work_exceptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  team_id uuid not null references public.inspection_teams(id) on delete cascade,
  date date not null,
  is_working boolean not null default true,
  work_hours numeric check (work_hours is null or work_hours > 0),
  capacity_factor numeric check (capacity_factor is null or capacity_factor > 0),
  remark text,
  unique (team_id, date)
);

-- ---------- 3. 订单 ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  user_id uuid not null references public.users(id) on delete cascade,
  order_type text not null default 'reservation' check (order_type in ('reservation', 'inbound')),
  customer_name text not null,
  factory_name text not null,
  po_number text not null,
  sku text not null,
  inbound_date date,
  shipping_date date,
  shipping_date_tbd boolean not null default false,
  inspection_plan text not null default 'both' check (inspection_plan in ('normal', 'xray', 'both', 'field')),
  reservation_remark text,
  color text not null,
  size text not null,
  quantity integer not null check (quantity > 0),
  inbound_quantity integer not null default 0 check (inbound_quantity >= 0 and inbound_quantity <= quantity),
  status text not null default '未开始' check (status in ('未开始', '检品中', '已完成')),
  delivery_date date,
  estimated_inspection_date date,
  inspection_standard text,
  priority text not null default '普通' check (priority in ('普通', '加急', '特急')),
  assigned_team_id uuid references public.inspection_teams(id) on delete set null,
  direct_ship boolean not null default false
);

create trigger trg_orders_updated_at
before update on public.orders
for each row execute function app.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  carton_count integer not null default 0 check (carton_count >= 0),
  quantity_per_carton integer not null default 10 check (quantity_per_carton >= 0),
  quantity integer not null check (quantity > 0),
  inbound_quantity integer not null default 0 check (inbound_quantity >= 0 and inbound_quantity <= quantity),
  estimated_inspection_date date,
  submitted_quantity integer not null default 0 check (submitted_quantity >= 0 and submitted_quantity <= quantity),
  submit_status text not null default 'pending' check (submit_status in ('pending', 'ready', 'paused')),
  style_factor numeric not null default 1.0 check (style_factor > 0)
);

create trigger trg_order_items_updated_at
before update on public.order_items
for each row execute function app.set_updated_at();

-- ---------- 4. 预约箱号 ----------
create table if not exists public.reservation_cartons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  carton_no text not null,
  remark text,
  unique (order_id, carton_no)
);

create table if not exists public.reservation_carton_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  reservation_carton_id uuid not null references public.reservation_cartons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  quantity integer not null check (quantity > 0)
);

-- ---------- 5. 附件 ----------
create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_path text not null,
  mime_type text,
  file_size integer
);

-- ---------- 6. 检品 / 复检 ----------
create table if not exists public.inspection_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete set null,
  user_id uuid not null references public.users(id) on delete cascade,
  inspection_stage text not null default 'normal' check (inspection_stage in ('normal', 'xray', 'field')),
  defect_type text not null,
  quantity integer not null check (quantity > 0),
  remark text,
  photo_url text,
  photo_path text,
  color text,
  size text
);

create trigger trg_inspection_records_updated_at
before update on public.inspection_records
for each row execute function app.set_updated_at();

create table if not exists public.reinspection_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  source_record_id uuid not null references public.inspection_records(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  inspection_stage text not null check (inspection_stage in ('normal', 'xray', 'field')),
  defect_type text not null,
  color text,
  size text,
  passed_quantity integer not null default 0 check (passed_quantity >= 0),
  failed_quantity integer not null default 0 check (failed_quantity >= 0),
  remark text
);

create trigger trg_reinspection_records_updated_at
before update on public.reinspection_records
for each row execute function app.set_updated_at();

-- ---------- 7. 出货 / 装车 ----------
create table if not exists public.shipment_cartons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  carton_no text not null,
  remark text,
  unique (order_id, carton_no)
);

create table if not exists public.shipment_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  carton_id uuid not null references public.shipment_cartons(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  quantity integer not null check (quantity > 0)
);

create table if not exists public.dispatch_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
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

-- ---------- 8. 开箱 ----------
create table if not exists public.unboxing_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  carton_no text not null,
  po_number text not null default '',
  sku text not null default '',
  color text not null,
  size text not null,
  quantity integer not null check (quantity >= 0),
  shortage_quantity integer not null default 0 check (shortage_quantity >= 0),
  remark text,
  photo_url text,
  photo_path text
);

create trigger trg_unboxing_records_updated_at
before update on public.unboxing_records
for each row execute function app.set_updated_at();

-- ---------- 9. 邀请码 ----------
create table if not exists public.registration_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.users(id) on delete set null,
  created_by_email text not null,
  code_hash text not null unique,
  active boolean not null default true,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_email text,
  used_by_user_id uuid references public.users(id) on delete set null,
  role text not null default 'staff' check (role in ('staff', 'client', 'field_inspector')),
  customer_name text
);

-- ---------- 10. 自动排程 ----------
create table if not exists public.inspection_schedule (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid references public.order_items(id) on delete cascade,
  inspection_type text not null check (inspection_type in ('normal', 'xray', 'field')),
  scheduled_date date not null,
  team_id uuid references public.inspection_teams(id) on delete set null,
  planned_quantity integer not null check (planned_quantity > 0),
  priority text not null default '普通' check (priority in ('普通', '加急', '特急')),
  status text not null default '待开始' check (status in ('待开始', '进行中', '已完成', '部分完成', '延期', '已取消', '已调整')),
  source text not null default 'auto' check (source in ('auto', 'manual')),
  locked boolean not null default false,
  run_id uuid,
  completed_quantity integer not null default 0 check (completed_quantity >= 0 and completed_quantity <= planned_quantity),
  explanation jsonb,
  remark text
);

create trigger trg_inspection_schedule_updated_at
before update on public.inspection_schedule
for each row execute function app.set_updated_at();

create table if not exists public.schedule_progress_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  task_id uuid not null references public.inspection_schedule(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  user_email text,
  quantity integer not null check (quantity > 0),
  record_date date not null default current_date,
  remark text
);

create table if not exists public.schedule_change_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.users(id) on delete set null,
  user_email text,
  action text not null check (action in ('auto_replan', 'manual_adjust', 'progress_update', 'lock', 'unlock', 'insert_urgent', 'rollover', 'cancel', 'submit_update')),
  run_id uuid,
  order_id uuid,
  order_item_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb
);

-- ---------- 10.5 出货批次（总单编号/总体备注） ----------
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

-- ---------- 11. 业务函数（改造：auth.* -> app.*） ----------

-- 订单 + 明细事务创建
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
  current_user_id uuid := app.current_user_id();
begin
  if current_user_id is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  if jsonb_typeof(item_payload) <> 'array' or jsonb_array_length(item_payload) = 0 then
    raise exception 'At least one order item is required' using errcode = '22023';
  end if;

  insert into public.orders (
    user_id, order_type, customer_name, factory_name, po_number, sku,
    inbound_date, shipping_date, inspection_plan, reservation_remark,
    color, size, quantity, inbound_quantity, status
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
    order_id, user_id, po_number, sku, color, size,
    carton_count, quantity_per_carton, quantity, inbound_quantity
  )
  select
    new_order_id,
    current_user_id,
    item ->> 'po_number',
    item ->> 'sku',
    item ->> 'color',
    item ->> 'size',
    coalesce((item ->> 'carton_count')::integer, 0),
    coalesce((item ->> 'quantity_per_carton')::integer, 10),
    (item ->> 'quantity')::integer,
    coalesce((item ->> 'inbound_quantity')::integer, 0)
  from jsonb_array_elements(item_payload) as item;

  return new_order_id;
end;
$$;

-- 排程权限校验
create or replace function public.schedule_assert_staff()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
begin
  if app.current_user_id() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select role into user_role from public.user_profiles where id = app.current_user_id();
  if user_role is null then
    user_role := 'staff';
  end if;

  if user_role not in ('admin', 'staff') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.schedule_current_email()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select email from public.user_profiles where id = app.current_user_id()),
    app.current_user_email()
  );
$$;

-- 自动重新排程
create or replace function public.apply_schedule_run(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid := (payload ->> 'run_id')::uuid;
  inserted_count integer := 0;
  cancelled_count integer := 0;
  task jsonb;
begin
  perform public.schedule_assert_staff();

  if jsonb_typeof(payload -> 'cancel_ids') = 'array' then
    update public.inspection_schedule
    set status = '已调整', updated_at = now()
    where id = any (select value::uuid from jsonb_array_elements_text(payload -> 'cancel_ids'))
      and locked = false
      and source = 'auto'
      and status in ('待开始', '进行中', '部分完成', '延期', '已调整');
    get diagnostics cancelled_count = row_count;
  end if;

  if jsonb_typeof(payload -> 'tasks') = 'array' then
    for task in select * from jsonb_array_elements(payload -> 'tasks')
    loop
      insert into public.inspection_schedule (
        order_id, order_item_id, inspection_type, scheduled_date, team_id,
        planned_quantity, priority, source, run_id, explanation, remark
      ) values (
        (task ->> 'order_id')::uuid,
        nullif(task ->> 'order_item_id', '')::uuid,
        task ->> 'inspection_type',
        (task ->> 'scheduled_date')::date,
        nullif(task ->> 'team_id', '')::uuid,
        (task ->> 'planned_quantity')::integer,
        coalesce(task ->> 'priority', '普通'),
        coalesce(task ->> 'source', 'auto'),
        run_id,
        task -> 'explanation',
        task ->> 'remark'
      );
      inserted_count := inserted_count + 1;
    end loop;
  end if;

  insert into public.schedule_change_logs (
    user_id, user_email, action, run_id, reason, before_data, after_data
  ) values (
    app.current_user_id(),
    public.schedule_current_email(),
    'auto_replan',
    run_id,
    payload ->> 'reason',
    jsonb_build_object('cancelled', cancelled_count),
    jsonb_build_object('inserted', inserted_count)
  );

  return jsonb_build_object('inserted', inserted_count, 'cancelled', cancelled_count);
end;
$$;

-- 进度打卡（追加式）
create or replace function public.record_schedule_progress(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_id uuid := (payload ->> 'task_id')::uuid;
  add_quantity integer := (payload ->> 'quantity')::integer;
  task_status text;
  task_date date;
  task_planned integer;
  task_completed integer;
  task_order_id uuid;
  task_item_id uuid;
  new_total integer;
begin
  perform public.schedule_assert_staff();

  if add_quantity <= 0 then
    raise exception 'quantity must be positive' using errcode = '22023';
  end if;

  select status, scheduled_date, planned_quantity, completed_quantity, order_id, order_item_id
  into task_status, task_date, task_planned, task_completed, task_order_id, task_item_id
  from public.inspection_schedule
  where id = task_id
  for update;

  if task_status is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if task_status in ('已完成', '已取消') then
    raise exception 'Task is finished or cancelled' using errcode = '22023';
  end if;

  new_total := task_completed + add_quantity;
  if new_total > task_planned then
    raise exception 'Progress exceeds planned quantity' using errcode = '22023';
  end if;

  insert into public.schedule_progress_records (task_id, user_id, user_email, quantity, record_date, remark)
  values (task_id, app.current_user_id(), public.schedule_current_email(), add_quantity,
          coalesce((payload ->> 'record_date')::date, current_date), payload ->> 'remark');

  update public.inspection_schedule
  set completed_quantity = new_total,
      status = case
        when new_total >= task_planned then '已完成'
        when new_total > 0 then '部分完成'
        else '待开始'
      end,
      updated_at = now()
  where id = task_id;

  insert into public.schedule_change_logs (
    user_id, user_email, action, order_id, order_item_id, reason, before_data, after_data
  ) values (
    app.current_user_id(), public.schedule_current_email(), 'progress_update',
    task_order_id, task_item_id, payload ->> 'reason',
    jsonb_build_object('completed', task_completed),
    jsonb_build_object('completed', new_total, 'added', add_quantity)
  );

  return jsonb_build_object('task_id', task_id, 'completed', new_total, 'remaining', task_planned - new_total);
end;
$$;

-- 人工调整 / 锁定 / 解锁
create or replace function public.apply_manual_adjust(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_id uuid := (payload ->> 'task_id')::uuid;
  task_row public.inspection_schedule%rowtype;
  before_data jsonb;
  after_data jsonb;
  action_text text := coalesce(payload ->> 'action', 'manual_adjust');
begin
  perform public.schedule_assert_staff();

  select * into task_row from public.inspection_schedule where id = task_id for update;
  if task_row.id is null then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;

  before_data := to_jsonb(task_row);

  if task_row.completed_quantity > 0 and payload ? 'planned_quantity' then
    raise exception 'Cannot change planned quantity after work started' using errcode = '22023';
  end if;

  if payload ? 'scheduled_date' then
    task_row.scheduled_date := (payload ->> 'scheduled_date')::date;
  end if;
  if payload ? 'team_id' then
    task_row.team_id := nullif(payload ->> 'team_id', '')::uuid;
  end if;
  if payload ? 'planned_quantity' then
    task_row.planned_quantity := (payload ->> 'planned_quantity')::integer;
  end if;
  if payload ? 'priority' then
    task_row.priority := payload ->> 'priority';
  end if;
  if payload ? 'locked' then
    task_row.locked := (payload ->> 'locked')::boolean;
    if task_row.locked then
      task_row.source := 'manual';
    end if;
  end if;
  if payload ? 'remark' then
    task_row.remark := payload ->> 'remark';
  end if;
  task_row.updated_at := now();

  update public.inspection_schedule
  set scheduled_date = task_row.scheduled_date,
      team_id = task_row.team_id,
      planned_quantity = task_row.planned_quantity,
      priority = task_row.priority,
      locked = task_row.locked,
      source = task_row.source,
      remark = task_row.remark,
      updated_at = now()
  where id = task_id
  returning * into task_row;

  after_data := to_jsonb(task_row);

  insert into public.schedule_change_logs (
    user_id, user_email, action, run_id, order_id, order_item_id, reason, before_data, after_data
  ) values (
    app.current_user_id(), public.schedule_current_email(), action_text,
    nullif(payload ->> 'run_id', '')::uuid, task_row.order_id, task_row.order_item_id,
    payload ->> 'reason', before_data, after_data
  );

  return jsonb_build_object('task_id', task_id, 'locked', task_row.locked);
end;
$$;

-- 紧急插单
create or replace function public.apply_schedule_insert(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid := (payload ->> 'run_id')::uuid;
  task jsonb := payload -> 'task';
  task_item jsonb;
  shift jsonb;
  inserted_count integer := 0;
  shifted_count integer := 0;
begin
  perform public.schedule_assert_staff();

  if jsonb_typeof(payload -> 'tasks') = 'array' then
    for task_item in select * from jsonb_array_elements(payload -> 'tasks')
    loop
      insert into public.inspection_schedule (
        order_id, order_item_id, inspection_type, scheduled_date, team_id,
        planned_quantity, priority, source, locked, run_id, explanation, remark
      ) values (
        (task_item ->> 'order_id')::uuid,
        nullif(task_item ->> 'order_item_id', '')::uuid,
        task_item ->> 'inspection_type',
        (task_item ->> 'scheduled_date')::date,
        nullif(task_item ->> 'team_id', '')::uuid,
        (task_item ->> 'planned_quantity')::integer,
        '特急',
        'manual',
        true,
        run_id,
        task_item -> 'explanation',
        coalesce(task_item ->> 'remark', '紧急插单')
      );
      inserted_count := inserted_count + 1;
    end loop;
  elsif jsonb_typeof(payload -> 'task') = 'object' then
    insert into public.inspection_schedule (
      order_id, order_item_id, inspection_type, scheduled_date, team_id,
      planned_quantity, priority, source, locked, run_id, explanation, remark
    ) values (
      (task ->> 'order_id')::uuid,
      nullif(task ->> 'order_item_id', '')::uuid,
      task ->> 'inspection_type',
      (task ->> 'scheduled_date')::date,
      nullif(task ->> 'team_id', '')::uuid,
      (task ->> 'planned_quantity')::integer,
      '特急',
      'manual',
      true,
      run_id,
      task -> 'explanation',
      coalesce(task ->> 'remark', '紧急插单')
    );
    inserted_count := 1;
  end if;

  if jsonb_typeof(payload -> 'shifted_tasks') = 'array' then
    for shift in select * from jsonb_array_elements(payload -> 'shifted_tasks')
    loop
      update public.inspection_schedule
      set scheduled_date = (shift ->> 'to_date')::date,
          status = case when status = '待开始' then '待开始' else status end,
          updated_at = now()
      where id = (shift ->> 'task_id')::uuid
        and locked = false
        and source = 'auto'
        and completed_quantity = 0;
      if found then
        shifted_count := shifted_count + 1;
      end if;
    end loop;
  end if;

  insert into public.schedule_change_logs (
    user_id, user_email, action, run_id, order_id, order_item_id, reason, before_data, after_data
  ) values (
    app.current_user_id(), public.schedule_current_email(), 'insert_urgent', run_id,
    nullif(task ->> 'order_id', '')::uuid, nullif(task ->> 'order_item_id', '')::uuid,
    payload ->> 'reason',
    jsonb_build_object('shifted', shifted_count),
    jsonb_build_object('inserted', task ->> 'planned_quantity')
  );

  return jsonb_build_object('inserted', inserted_count, 'shifted', shifted_count);
end;
$$;

-- 滚动结转
create or replace function public.rollover_schedule(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  as_of date := coalesce((payload ->> 'date')::date, current_date);
  rolled integer := 0;
begin
  perform public.schedule_assert_staff();

  update public.inspection_schedule
  set status = '延期', updated_at = now()
  where scheduled_date < as_of
    and status in ('待开始', '进行中', '部分完成')
    and completed_quantity < planned_quantity;

  get diagnostics rolled = row_count;

  if rolled > 0 then
    insert into public.schedule_change_logs (
      user_id, user_email, action, reason, before_data, after_data
    ) values (
      app.current_user_id(), public.schedule_current_email(), 'rollover',
      '日期已过未完成任务的剩余量进入后续排程池',
      jsonb_build_object('as_of', as_of),
      jsonb_build_object('rolled_tasks', rolled)
    );
  end if;

  return jsonb_build_object('rolled_tasks', rolled);
end;
$$;

-- ---------- 12. 索引 ----------
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_po_number_idx on public.orders (po_number);
create index if not exists orders_customer_name_idx on public.orders (customer_name);
create index if not exists orders_shipping_date_idx on public.orders (shipping_date);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_user_id_idx on public.order_items (user_id);
create index if not exists reservation_cartons_order_id_idx on public.reservation_cartons (order_id);
create index if not exists reservation_carton_items_carton_idx on public.reservation_carton_items (reservation_carton_id);
create index if not exists order_attachments_order_id_idx on public.order_attachments (order_id);
create index if not exists inspection_records_order_idx on public.inspection_records (order_id, created_at desc);
create index if not exists inspection_records_item_idx on public.inspection_records (order_item_id);
create index if not exists reinspection_records_order_idx on public.reinspection_records (order_id, created_at desc);
create index if not exists shipment_cartons_order_id_idx on public.shipment_cartons (order_id);
create index if not exists shipment_items_carton_id_idx on public.shipment_items (carton_id);
create index if not exists dispatch_records_order_id_idx on public.dispatch_records (order_id);
create index if not exists unboxing_records_order_idx on public.unboxing_records (order_id, created_at desc);
create index if not exists registration_invites_code_hash_idx on public.registration_invites (code_hash);
create index if not exists inspection_schedule_date_idx on public.inspection_schedule (scheduled_date);
create index if not exists inspection_schedule_item_idx on public.inspection_schedule (order_item_id);
create index if not exists inspection_schedule_team_date_idx on public.inspection_schedule (team_id, scheduled_date);
create index if not exists inspection_schedule_status_idx on public.inspection_schedule (status);
create index if not exists schedule_progress_records_task_idx on public.schedule_progress_records (task_id, created_at);
create index if not exists schedule_change_logs_order_idx on public.schedule_change_logs (order_id);
create index if not exists schedule_change_logs_run_idx on public.schedule_change_logs (run_id);
create index if not exists schedule_change_logs_created_idx on public.schedule_change_logs (created_at);

commit;
