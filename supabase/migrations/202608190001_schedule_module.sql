-- ============================================================
-- QCFlow 自动检品排程模块（第一阶段）
-- 7 张新表 + 订单/明细扩展字段 + 5 个事务函数 + RLS
-- 全部使用 if not exists / add column if not exists，不破坏现有数据
-- ============================================================

-- ---------- 1. 基础配置表 ----------

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

create table if not exists public.style_categories (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null unique,
  factor numeric not null check (factor > 0),
  remark text,
  enabled boolean not null default true
);

insert into public.style_categories (name, factor, remark)
values
  ('普通款', 1.0, '默认款式系数'),
  ('复杂款', 1.3, '复杂工艺款式'),
  ('特殊检品', 1.5, '特殊检品要求')
on conflict (name) do nothing;

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

-- ---------- 2. 订单 / 明细扩展字段 ----------

alter table public.orders
  add column if not exists delivery_date date,
  add column if not exists estimated_inspection_date date,
  add column if not exists inspection_standard text,
  add column if not exists priority text not null default '普通',
  add column if not exists assigned_team_id uuid references public.inspection_teams(id) on delete set null;

alter table public.orders
  drop constraint if exists orders_priority_check;
alter table public.orders
  add constraint orders_priority_check check (priority in ('普通', '加急', '特急'));

alter table public.order_items
  add column if not exists estimated_inspection_date date,
  add column if not exists submitted_quantity integer not null default 0,
  add column if not exists submit_status text not null default 'pending',
  add column if not exists style_factor numeric not null default 1.0;

alter table public.order_items
  drop constraint if exists order_items_submitted_quantity_check;
alter table public.order_items
  add constraint order_items_submitted_quantity_check check (submitted_quantity >= 0);

alter table public.order_items
  drop constraint if exists order_items_submit_status_check;
alter table public.order_items
  add constraint order_items_submit_status_check check (submit_status in ('pending', 'ready', 'paused'));

alter table public.order_items
  drop constraint if exists order_items_style_factor_check;
alter table public.order_items
  add constraint order_items_style_factor_check check (style_factor > 0);

-- 存量数据一次性回填：数量跟随已入库，状态置为可送检（仅初始化）
update public.order_items
set submitted_quantity = inbound_quantity
where submitted_quantity = 0 and inbound_quantity > 0;

update public.order_items
set submit_status = 'ready'
where submit_status = 'pending' and inbound_quantity > 0;

-- ---------- 3. 排程任务 / 进度 / 审计 ----------

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

create index if not exists inspection_schedule_date_idx on public.inspection_schedule (scheduled_date);
create index if not exists inspection_schedule_item_idx on public.inspection_schedule (order_item_id);
create index if not exists inspection_schedule_team_date_idx on public.inspection_schedule (team_id, scheduled_date);
create index if not exists inspection_schedule_status_idx on public.inspection_schedule (status);

create table if not exists public.schedule_progress_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  task_id uuid not null references public.inspection_schedule(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  quantity integer not null check (quantity > 0),
  record_date date not null default current_date,
  remark text
);

create index if not exists schedule_progress_records_task_idx on public.schedule_progress_records (task_id);

create table if not exists public.schedule_change_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null check (action in ('auto_replan', 'manual_adjust', 'progress_update', 'lock', 'unlock', 'insert_urgent', 'rollover', 'cancel', 'submit_update')),
  run_id uuid,
  order_id uuid,
  order_item_id uuid,
  reason text,
  before_data jsonb,
  after_data jsonb
);

create index if not exists schedule_change_logs_order_idx on public.schedule_change_logs (order_id);
create index if not exists schedule_change_logs_run_idx on public.schedule_change_logs (run_id);
create index if not exists schedule_change_logs_created_idx on public.schedule_change_logs (created_at);

-- ---------- 4. RLS ----------

alter table public.inspection_teams enable row level security;
alter table public.style_categories enable row level security;
alter table public.production_calendar enable row level security;
alter table public.team_work_exceptions enable row level security;
alter table public.inspection_schedule enable row level security;
alter table public.schedule_progress_records enable row level security;
alter table public.schedule_change_logs enable row level security;

drop policy if exists "staff can read inspection teams" on public.inspection_teams;
create policy "staff can read inspection teams"
on public.inspection_teams for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "admin can manage inspection teams" on public.inspection_teams;
create policy "admin can manage inspection teams"
on public.inspection_teams for all
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "staff can read style categories" on public.style_categories;
create policy "staff can read style categories"
on public.style_categories for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "admin can manage style categories" on public.style_categories;
create policy "admin can manage style categories"
on public.style_categories for all
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "staff can read production calendar" on public.production_calendar;
create policy "staff can read production calendar"
on public.production_calendar for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "admin can manage production calendar" on public.production_calendar;
create policy "admin can manage production calendar"
on public.production_calendar for all
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "staff can read team work exceptions" on public.team_work_exceptions;
create policy "staff can read team work exceptions"
on public.team_work_exceptions for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "admin can manage team work exceptions" on public.team_work_exceptions;
create policy "admin can manage team work exceptions"
on public.team_work_exceptions for all
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
);

drop policy if exists "staff can read inspection schedule" on public.inspection_schedule;
create policy "staff can read inspection schedule"
on public.inspection_schedule for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "staff can read schedule progress" on public.schedule_progress_records;
create policy "staff can read schedule progress"
on public.schedule_progress_records for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role in ('admin', 'staff'))
);

drop policy if exists "admin can read schedule change logs" on public.schedule_change_logs;
create policy "admin can read schedule change logs"
on public.schedule_change_logs for select
using (
  (auth.jwt() ->> 'email') = 'shuoyuqc@163.com'
  or exists (select 1 from public.user_profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- ---------- 5. 事务函数 ----------

create or replace function public.schedule_assert_staff()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  user_role text;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select role into user_role from public.user_profiles where id = auth.uid();
  if user_role is null then
    user_role := case
      when auth.jwt() ->> 'email' = 'shuoyuqc@163.com' then 'admin'
      else 'staff'
    end;
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
    (select email from public.user_profiles where id = auth.uid()),
    auth.jwt() ->> 'email'
  );
$$;

-- 自动重新排程：旧 auto 任务标"已调整"，插入新任务，写审计
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

  -- 旧 auto 任务标记"已调整"（跳过锁定与已完成/已取消）
  if jsonb_typeof(payload -> 'cancel_ids') = 'array' then
    update public.inspection_schedule
    set status = '已调整', updated_at = now()
    where id = any (select value::uuid from jsonb_array_elements_text(payload -> 'cancel_ids'))
      and locked = false
      and source = 'auto'
      and status in ('待开始', '进行中', '部分完成', '延期', '已调整');
    get diagnostics cancelled_count = row_count;
  end if;

  -- 插入新任务
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
    auth.uid(),
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

-- 进度打卡：追加式，累计不得超过计划量
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
  values (task_id, auth.uid(), public.schedule_current_email(), add_quantity,
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
    auth.uid(), public.schedule_current_email(), 'progress_update',
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

  -- 已开始的任务不允许改计划数量（防止覆盖历史计划）
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
    auth.uid(), public.schedule_current_email(), action_text,
    nullif(payload ->> 'run_id', '')::uuid, task_row.order_id, task_row.order_item_id,
    payload ->> 'reason', before_data, after_data
  );

  return jsonb_build_object('task_id', task_id, 'locked', task_row.locked);
end;
$$;

-- 紧急插单：插入特急锁定任务（支持多日多任务）+ 受影响 auto 任务顺延 + 审计
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
    auth.uid(), public.schedule_current_email(), 'insert_urgent', run_id,
    nullif(task ->> 'order_id', '')::uuid, nullif(task ->> 'order_item_id', '')::uuid,
    payload ->> 'reason',
    jsonb_build_object('shifted', shifted_count),
    jsonb_build_object('inserted', task ->> 'planned_quantity')
  );

  return jsonb_build_object('inserted', inserted_count, 'shifted', shifted_count);
end;
$$;

-- 滚动结转：过期未完成任务标记延期，剩余量进入排程池
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
      auth.uid(), public.schedule_current_email(), 'rollover',
      '日期已过未完成任务的剩余量进入后续排程池',
      jsonb_build_object('as_of', as_of),
      jsonb_build_object('rolled_tasks', rolled)
    );
  end if;

  return jsonb_build_object('rolled_tasks', rolled);
end;
$$;

revoke all on function public.schedule_assert_staff() from public;
revoke all on function public.schedule_current_email() from public;
revoke all on function public.apply_schedule_run(jsonb) from public;
revoke all on function public.record_schedule_progress(jsonb) from public;
revoke all on function public.apply_manual_adjust(jsonb) from public;
revoke all on function public.apply_schedule_insert(jsonb) from public;
revoke all on function public.rollover_schedule(jsonb) from public;

grant execute on function public.apply_schedule_run(jsonb) to authenticated;
grant execute on function public.record_schedule_progress(jsonb) to authenticated;
grant execute on function public.apply_manual_adjust(jsonb) to authenticated;
grant execute on function public.apply_schedule_insert(jsonb) to authenticated;
grant execute on function public.rollover_schedule(jsonb) to authenticated;
