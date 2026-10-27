import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { withTransaction } from "@/src/server/db/query";
import { updateRowsWhere } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";

type Identity = { po_number: string; sku: string; color: string; size: string };

const FULL_MATCH_TABLES = ["reservation_carton_items", "unboxing_records", "shipment_items"] as const;
const COLOR_SIZE_TABLES = ["inspection_records", "reinspection_records"] as const;

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json()) as { orderId?: string; from?: Identity; to?: Identity };

  if (!body.orderId || !body.from || !body.to) {
    throw new ApiError("orderId、from 与 to 均为必填", 400, "VALIDATION_ERROR");
  }
  for (const key of ["po_number", "sku", "color", "size"] as const) {
    if (typeof body.from[key] !== "string" || typeof body.to[key] !== "string") {
      throw new ApiError(`字段格式不正确: ${key}`, 400, "VALIDATION_ERROR");
    }
  }
  const orderId = body.orderId;
  const from = body.from;
  const to = body.to;

  if (getDataBackend() === "pg") {
    try {
      const updated = await withTransaction(async (client) => {
        let count = 0;
        for (const table of FULL_MATCH_TABLES) {
          count += await updateRowsWhere(
            table,
            { po_number: to.po_number, sku: to.sku, color: to.color, size: to.size },
            {
              order_id: orderId,
              po_number: from.po_number,
              sku: from.sku,
              color: from.color,
              size: from.size
            },
            client
          );
        }
        for (const table of COLOR_SIZE_TABLES) {
          count += await updateRowsWhere(
            table,
            { color: to.color, size: to.size },
            { order_id: orderId, color: from.color, size: from.size },
            client
          );
        }
        return count;
      });
      return apiSuccess({ updated });
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const results = await Promise.all([
    ...FULL_MATCH_TABLES.map((table) =>
      supabase
        .from(table)
        .update(to, { count: "exact" })
        .eq("order_id", orderId)
        .eq("po_number", from.po_number)
        .eq("sku", from.sku)
        .eq("color", from.color)
        .eq("size", from.size)
    ),
    ...COLOR_SIZE_TABLES.map((table) =>
      supabase
        .from(table)
        .update({ color: to.color, size: to.size }, { count: "exact" })
        .eq("order_id", orderId)
        .eq("color", from.color)
        .eq("size", from.size)
    )
  ]);

  const error = results.find((result) => result.error)?.error;
  if (error) throw databaseError(error);
  return apiSuccess({ updated: results.reduce((sum, result) => sum + (result.count ?? 0), 0) });
});
