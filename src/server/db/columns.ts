/**
 * 各表读取列清单（与 Supabase 线上结构一致，由 PostgREST OpenAPI 生成）。
 * 新增列时同步更新这里，避免 API 返回结构发生意外变化。
 */
export const TABLE_COLUMNS = {
  orders:
    "id, created_at, user_id, customer_name, factory_name, po_number, sku, color, size, quantity, status, inbound_date, shipping_date, order_type, inbound_quantity, inspection_plan, reservation_remark, deleted_at, delivery_date, estimated_inspection_date, inspection_standard, priority, assigned_team_id, direct_ship, shipping_date_tbd",
  order_items:
    "id, created_at, order_id, user_id, color, size, quantity, po_number, sku, inbound_quantity, carton_count, quantity_per_carton, estimated_inspection_date, submitted_quantity, submit_status, style_factor",
  inspection_records:
    "id, created_at, order_id, user_id, defect_type, quantity, remark, photo_url, photo_path, inspection_stage, color, size",
  reinspection_records:
    "id, created_at, order_id, source_record_id, user_id, inspection_stage, defect_type, color, size, passed_quantity, failed_quantity, remark",
  unboxing_records:
    "id, created_at, order_id, user_id, carton_no, po_number, sku, color, size, quantity, shortage_quantity, remark, photo_url, photo_path",
  shipment_cartons: "id, created_at, order_id, user_id, carton_no, remark",
  shipment_items: "id, created_at, carton_id, order_id, user_id, po_number, sku, color, size, quantity",
  shipment_batches: "id, created_at, updated_at, customer_name, shipping_date, batch_no, remark",
  dispatch_records:
    "id, created_at, order_id, user_id, total_cartons, total_quantity, expected_quantity, is_full_dispatch, shortage_detail, vehicle_plate, remark, vehicle_photo_url, vehicle_photo_path, carton_photo_url, carton_photo_path, container_photo_url, container_photo_path",
  reservation_cartons: "id, created_at, order_id, user_id, carton_no, remark",
  reservation_carton_items: "id, created_at, reservation_carton_id, order_id, user_id, po_number, sku, color, size, quantity",
  order_attachments: "id, created_at, order_id, user_id, file_name, file_url, file_path, mime_type, file_size",
  user_profiles: "id, created_at, email, role, customer_name",
  registration_invites:
    "id, created_at, created_by_user_id, created_by_email, code_hash, active, expires_at, used_at, used_by_email, used_by_user_id, role, customer_name",
  inspection_teams:
    "id, created_at, updated_at, name, work_start_time, work_end_time, daily_hours, standard_daily_capacity, baseline_members, current_members, max_daily_capacity, inspection_types, capacity_factors, enabled, sort_order",
  style_categories: "id, created_at, name, factor, remark, enabled",
  production_calendar: "id, created_at, date, is_work_day, work_hours, remark",
  team_work_exceptions: "id, created_at, team_id, date, is_working, work_hours, capacity_factor, remark",
  inspection_schedule:
    "id, created_at, updated_at, order_id, order_item_id, inspection_type, scheduled_date, team_id, planned_quantity, priority, status, source, locked, run_id, completed_quantity, explanation, remark",
  schedule_progress_records: "id, created_at, task_id, user_id, user_email, quantity, record_date, remark",
  schedule_change_logs: "id, created_at, user_id, user_email, action, run_id, order_id, order_item_id, reason, before_data, after_data"
} as const;

export type TableName = keyof typeof TABLE_COLUMNS;
