import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listShipmentItems } from "@/src/server/db/shipments";
import { insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { ShipmentItem } from "@/lib/types";
import type { Database } from "@/src/types";

type ItemInsert = Database["public"]["Tables"]["shipment_items"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const orderId = request.nextUrl.searchParams.get("orderId");

  if (getDataBackend() === "pg") {
    return apiSuccess(await listShipmentItems(orderId));
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("shipment_items").select("*");
  if (orderId) query = query.eq("order_id", orderId);

  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data ?? []);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as { items?: ItemInsert[] };
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) throw new ApiError("items is required", 400, "VALIDATION_ERROR");

  const rows = items.map((item) => ({ ...item, user_id: user.id }));

  if (getDataBackend() === "pg") {
    try {
      const inserted = await insertRows<ShipmentItem>("shipment_items", rows, TABLE_COLUMNS.shipment_items);
      return apiSuccess(inserted, 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("shipment_items").insert(rows).select("*");
  if (error) throw databaseError(error);
  return apiSuccess(data ?? [], 201);
});
