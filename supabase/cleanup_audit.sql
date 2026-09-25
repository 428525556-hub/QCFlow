-- ============================================================
-- QCFlow 清理审计 SQL（第一阶段：只读审计，不删除任何数据）
-- 在 Supabase SQL Editor 中运行全部内容，把输出发回即可
-- ============================================================

-- 1. 数据库对象完整清单（表/视图/函数/触发器）
select 'TABLE' as obj_type, table_name as obj_name
from information_schema.tables where table_schema = 'public'
union all select 'VIEW', table_name from information_schema.views where table_schema = 'public'
union all select 'FUNCTION', p.proname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
union all select 'TRIGGER', trigger_name from information_schema.triggers where trigger_schema = 'public'
order by 1, 2;

-- 2. 索引清单
select tablename, indexname
from pg_indexes where schemaname = 'public'
order by 1, 2;

-- 3. 外键清单（含删除行为）
select tc.table_name, kcu.column_name, ccu.table_name as ref_table,
       rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
order by 1, 2;

-- 4. RLS 状态与策略
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
select tablename, policyname, cmd, qual from pg_policies where schemaname = 'public' order by 1, 2;

-- 5. 各表行数统计
select 'orders' as tbl, count(*) as rows_count from public.orders
union all select 'order_items', count(*) from public.order_items
union all select 'reservation_cartons', count(*) from public.reservation_cartons
union all select 'reservation_carton_items', count(*) from public.reservation_carton_items
union all select 'order_attachments', count(*) from public.order_attachments
union all select 'shipment_cartons', count(*) from public.shipment_cartons
union all select 'shipment_items', count(*) from public.shipment_items
union all select 'dispatch_records', count(*) from public.dispatch_records
union all select 'inspection_records', count(*) from public.inspection_records
union all select 'reinspection_records', count(*) from public.reinspection_records
union all select 'unboxing_records', count(*) from public.unboxing_records
union all select 'registration_invites', count(*) from public.registration_invites
union all select 'user_profiles', count(*) from public.user_profiles
union all select 'inspection_teams', count(*) from public.inspection_teams
union all select 'style_categories', count(*) from public.style_categories
union all select 'production_calendar', count(*) from public.production_calendar
union all select 'team_work_exceptions', count(*) from public.team_work_exceptions
union all select 'inspection_schedule', count(*) from public.inspection_schedule
union all select 'schedule_progress_records', count(*) from public.schedule_progress_records
union all select 'schedule_change_logs', count(*) from public.schedule_change_logs
union all select 'shipment_batches', count(*) from public.shipment_batches
order by 1;

-- 6. orders 软删除 / 时间范围
select
  count(*) filter (where deleted_at is not null) as soft_deleted,
  count(*) filter (where deleted_at is null) as active,
  min(created_at) as earliest_created,
  max(created_at) as latest_created,
  min(shipping_date) as earliest_shipping,
  max(shipping_date) as latest_shipping
from public.orders;

-- 7. 孤立数据检查（子表有记录但父订单不存在）
select 'order_items' as orphan, count(*) as cnt from public.order_items oi
  left join public.orders o on o.id = oi.order_id where o.id is null
union all select 'inspection_records', count(*) from public.inspection_records ir
  left join public.orders o on o.id = ir.order_id where o.id is null
union all select 'reinspection_records', count(*) from public.reinspection_records rr
  left join public.orders o on o.id = rr.order_id where o.id is null
union all select 'unboxing_records', count(*) from public.unboxing_records ur
  left join public.orders o on o.id = ur.order_id where o.id is null
union all select 'shipment_cartons', count(*) from public.shipment_cartons sc
  left join public.orders o on o.id = sc.order_id where o.id is null
union all select 'dispatch_records', count(*) from public.dispatch_records dr
  left join public.orders o on o.id = dr.order_id where o.id is null
union all select 'order_attachments', count(*) from public.order_attachments oa
  left join public.orders o on o.id = oa.order_id where o.id is null
union all select 'reservation_cartons', count(*) from public.reservation_cartons rc
  left join public.orders o on o.id = rc.order_id where o.id is null
union all select 'inspection_schedule', count(*) from public.inspection_schedule s
  left join public.orders o on o.id = s.order_id where o.id is null;

-- 8. 明显测试数据（只列出，不删除）
select id, customer_name, po_number, sku, quantity, created_at
from public.orders
where customer_name ~* '(test|demo|测试|示例|abc)'
   or po_number ~* '(test|demo|测试|示例|abc)'
   or sku ~* '(test|demo|测试|示例|abc)'
   or po_number ~ '^[0-9]+$'
order by created_at;

-- 9. Storage bucket 统计
select b.name as bucket,
       count(o.id) as files,
       coalesce(sum(cast(o.metadata ->> 'size' as bigint)), 0) as total_bytes,
       max(o.created_at) as last_modified
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.name
order by b.name;

-- 10. Storage 文件按顶层目录分组（用于分析孤儿文件）
select bucket_id,
       split_part(name, '/', 1) as top_folder,
       count(*) as files
from storage.objects
group by bucket_id, 2
order by 1, 2;

-- 11. 数据库引用了但 Storage 文件不存在的附件（反向孤儿）
select count(*) as attachments_missing_file
from public.order_attachments oa
where not exists (
  select 1 from storage.objects so
  where so.bucket_id in ('order-attachments', 'inspection-photos')
    and so.name = oa.file_path
);
