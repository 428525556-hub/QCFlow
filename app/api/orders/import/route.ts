import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { createOrderWithItems } from "@/src/server/db/orders";
import { selectAll } from "@/src/server/db/read";
import { ApiError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import {
  buildDuplicateKeySet,
  findExistingDuplicateKeys,
  importRows,
  MAX_IMPORT_ROWS,
  type ImportCreateOrder
} from "@/src/services/excelImportService";
import type { ExcelImportRow } from "@/src/utils/excelImport";
import type { Order } from "@/lib/types";
import type { Json } from "@/src/types";

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as { rows?: ExcelImportRow[] };
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    throw new ApiError("没有可导入的数据", 400, "VALIDATION_ERROR");
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    throw new ApiError(`单次最多导入 ${MAX_IMPORT_ROWS} 行`, 400, "VALIDATION_ERROR");
  }

  let existingKeys: Set<string>;
  let createOrder: ImportCreateOrder;

  if (getDataBackend() === "pg") {
    const poNumbers = Array.from(new Set(body.rows.map((row) => row.poNumber.trim()).filter(Boolean)));
    const existingOrders =
      poNumbers.length === 0
        ? []
        : await selectAll<Order>("orders", {
            conditions: ["po_number = any($1::text[])", "deleted_at is null", "status <> $2"],
            values: [poNumbers, "已完成"]
          });
    existingKeys = buildDuplicateKeySet(existingOrders);
    createOrder = async ({ order, items }) => {
      try {
        const id = await createOrderWithItems({
          userId: user.id,
          email: user.email ?? "",
          order: order as Record<string, unknown>,
          items: items as Record<string, unknown>[]
        });
        return { data: id, error: null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : "导入失败" } };
      }
    };
  } else {
    const supabase = createRequestSupabaseClient(request);
    existingKeys = await findExistingDuplicateKeys(supabase, body.rows);
    createOrder = async ({ order, items }) => {
      const { data, error } = await supabase.rpc("create_order_with_items", {
        order_payload: order as Json,
        item_payload: items as Json
      });
      return { data, error: error ? { message: error.message } : null };
    };
  }

  const results = await importRows(body.rows, existingKeys, createOrder);

  const successCount = results.filter((result) => result.success).length;
  const failCount = results.length - successCount;
  return apiSuccess({ successCount, failCount, results });
});
