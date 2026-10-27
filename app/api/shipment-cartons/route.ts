import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { pgError } from "@/src/server/db/pgErrors";
import { listShipmentCartons } from "@/src/server/db/shipments";
import { deleteRowsByIds, insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { ShipmentCarton } from "@/lib/types";
import type { Database } from "@/src/types";

type CartonInsert = Database["public"]["Tables"]["shipment_cartons"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const orderId = request.nextUrl.searchParams.get("orderId");

  if (getDataBackend() === "pg") {
    return apiSuccess(await listShipmentCartons(orderId));
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("shipment_cartons").select("*").order("created_at", { ascending: false });
  if (orderId) query = query.eq("order_id", orderId);

  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data ?? []);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as { carton?: CartonInsert };
  if (!body.carton) throw new ApiError("carton is required", 400, "VALIDATION_ERROR");

  const row = { ...body.carton, user_id: user.id };

  if (getDataBackend() === "pg") {
    try {
      const inserted = await insertRows<ShipmentCarton>("shipment_cartons", [row], TABLE_COLUMNS.shipment_cartons);
      return apiSuccess(inserted[0], 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("shipment_cartons").insert(row).select("*").single();
  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

export const DELETE = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("id is required", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    try {
      const deleted = await deleteRowsByIds("shipment_cartons", [id]);
      if (deleted.length === 0) throw new ApiError("Shipment carton not found", 404, "NOT_FOUND");
      return apiSuccess({ id });
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("shipment_cartons").delete().eq("id", id).select("id").maybeSingle();
  if (error) throw databaseError(error);
  if (!data) throw new ApiError("Shipment carton not found", 404, "NOT_FOUND");
  return apiSuccess({ id });
});
