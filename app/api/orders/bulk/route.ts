import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { withTransaction } from "@/src/server/db/query";
import { selectAll } from "@/src/server/db/read";
import { deleteRowsByIds } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile } from "@/src/server/supabaseServer";

type BulkDeleteBody = {
  orderIds?: string[];
  customerName?: string;
  shippingDate?: string;
};

// 这些表出现关联记录时禁止删除订单，防止产生孤儿业务数据
const BUSINESS_TABLES = [
  "inspection_records",
  "reinspection_records",
  "shipment_cartons",
  "dispatch_records",
  "unboxing_records",
  "order_attachments",
  "inspection_schedule"
] as const;

export const DELETE = withApiHandler(async (request) => {
  await requireAdminProfile(request);

  const body = (await request.json()) as BulkDeleteBody;
  const orderIds = Array.isArray(body.orderIds) ? body.orderIds.filter(Boolean) : [];
  const customerName = body.customerName?.trim() ?? "";
  const shippingDate = body.shippingDate;

  if (orderIds.length === 0 && customerName === "") {
    throw new ApiError("缺少删除条件：orderIds 或 customerName", 400, "VALIDATION_ERROR");
  }

  if (getDataBackend() === "pg") {
    try {
      const result = await withTransaction(async (client) => {
        const conditions = ["deleted_at is null"];
        const values: unknown[] = [];

        if (orderIds.length > 0) {
          values.push(orderIds);
          conditions.push(`id = any($${values.length}::uuid[])`);
        } else {
          values.push(customerName);
          conditions.push(`customer_name = $${values.length}`);
          if (shippingDate) {
            values.push(shippingDate);
            conditions.push(`shipping_date = $${values.length}`);
          }
        }

        const matchedOrders = await selectAll<{ id: string; po_number: string; quantity: number }>("orders", {
          conditions,
          values,
          client
        });
        if (matchedOrders.length === 0) {
          return { deleted: 0, deletedQuantity: 0, matched: 0, blocked: [] };
        }

        const ids = matchedOrders.map((order) => order.id);
        const blockedIds = new Set<string>();
        for (const table of BUSINESS_TABLES) {
          const rows = await selectAll<{ order_id: string }>(table, {
            conditions: ["order_id = any($1::uuid[])"],
            values: [ids],
            client
          });
          for (const row of rows) blockedIds.add(row.order_id);
        }

        const safeOrders = matchedOrders.filter((order) => !blockedIds.has(order.id));
        const deletedIds = await deleteRowsByIds("orders", safeOrders.map((order) => order.id), client);
        const deletedSet = new Set(deletedIds);

        return {
          deleted: deletedIds.length,
          deletedQuantity: safeOrders
            .filter((order) => deletedSet.has(order.id))
            .reduce((sum, order) => sum + Number(order.quantity || 0), 0),
          matched: matchedOrders.length,
          blocked: matchedOrders
            .filter((order) => blockedIds.has(order.id))
            .map((order) => ({
              id: order.id,
              po_number: order.po_number,
              reason:
                "该订单已产生检品/复检/开箱/装箱/出货/附件/排程等业务记录，不能直接删除，请先处理相关业务数据"
            }))
        };
      });

      return apiSuccess(result);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);

  // 1. 服务端重新查询符合条件、未软删除的订单（不信任前端数量）
  let query = supabase.from("orders").select("id, po_number, quantity, customer_name, shipping_date").is("deleted_at", null);
  if (orderIds.length > 0) {
    query = query.in("id", orderIds);
  } else {
    query = query.eq("customer_name", customerName);
    if (shippingDate) query = query.eq("shipping_date", shippingDate);
  }

  const { data: matchedOrders, error: queryError } = await query;
  if (queryError) throw databaseError(queryError);
  if (!matchedOrders || matchedOrders.length === 0) {
    return apiSuccess({ deleted: 0, deletedQuantity: 0, matched: 0, blocked: [] });
  }

  const ids = matchedOrders.map((order) => order.id);

  // 2. 检查关联业务数据：有任何检品/复检/开箱/装箱/出货/附件/排程记录则禁止删除
  const blockedIds = new Set<string>();
  for (const table of BUSINESS_TABLES) {
    const { data: rows, error: recordError } = await supabase.from(table).select("order_id").in("order_id", ids).range(0, 99999);
    if (recordError) throw databaseError(recordError);
    for (const row of rows ?? []) blockedIds.add(row.order_id);
  }

  const safeOrders = matchedOrders.filter((order) => !blockedIds.has(order.id));
  const safeIds = safeOrders.map((order) => order.id);

  // 3. 一次批量删除（orders 的外键 ON DELETE CASCADE 会连带清理订单明细等）
  let deleted = 0;
  let deletedQuantity = 0;
  if (safeIds.length > 0) {
    const { data: deletedRows, error: deleteError } = await supabase.from("orders").delete().in("id", safeIds).select("quantity");
    if (deleteError) throw databaseError(deleteError);
    deleted = deletedRows?.length ?? 0;
    deletedQuantity = (deletedRows ?? []).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  }

  return apiSuccess({
    deleted,
    deletedQuantity,
    matched: matchedOrders.length,
    blocked: matchedOrders
      .filter((order) => blockedIds.has(order.id))
      .map((order) => ({
        id: order.id,
        po_number: order.po_number,
        reason: "该订单已产生检品/复检/开箱/装箱/出货/附件/排程等业务记录，不能直接删除，请先处理相关业务数据"
      }))
  });
});
