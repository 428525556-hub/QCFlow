import { queryRows } from "./query.ts";

/** 通过已保存的附件路径定位订单，用于私有 COS 对象访问鉴权。 */
export async function findOrderIdByStoragePath(path: string): Promise<string | null> {
  const rows = await queryRows<{ order_id: string }>(
    `select order_id from public.inspection_records where photo_path = $1
     union all
     select order_id from public.unboxing_records where photo_path = $1
     union all
     select order_id from public.order_attachments where file_path = $1
     union all
     select order_id from public.dispatch_records
       where vehicle_photo_path = $1
          or carton_photo_path = $1
          or container_photo_path = $1
     limit 1`,
    [path]
  );
  return rows[0]?.order_id ?? null;
}
