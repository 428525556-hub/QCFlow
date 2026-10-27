import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { getInspectionRecordById, listInspectionRecords } from "@/src/server/db/inspections";
import { getOrderById, listOrders } from "@/src/server/db/orders";
import { pgError } from "@/src/server/db/pgErrors";
import { deleteRowsByIds, insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile } from "@/src/server/supabaseServer";
import { ADMIN_EMAIL } from "@/lib/security";
import type { InspectionRecord } from "@/lib/types";
import type { Database, InspectionStage } from "@/src/types";

type InspectionInsert = Database["public"]["Tables"]["inspection_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  const { profile } = await requireRequestProfile(request);
  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const stage = params.get("stage") as InspectionStage | null;
  const ascending = params.get("ascending") === "true";

  if (getDataBackend() === "pg") {
    let orderIds: string[] | undefined;

    if (profile.role === "field_inspector") {
      if (orderId) {
        const order = await getOrderById(orderId);
        if (!order) throw new ApiError("Order not found", 404, "NOT_FOUND");
        if (order.customer_name !== profile.customer_name) throw new ApiError("Forbidden", 403, "FORBIDDEN");
      } else {
        const allowedOrders = await listOrders({ customerName: profile.customer_name ?? "" });
        if (allowedOrders.length === 0) return apiSuccess([]);
        orderIds = allowedOrders.map((order) => order.id);
      }
    }

    const records = await listInspectionRecords({
      orderId,
      orderIds,
      stage: profile.role === "field_inspector" ? "field" : stage,
      ascending
    });
    return apiSuccess(records);
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("inspection_records").select("*");

  if (orderId) query = query.eq("order_id", orderId);
  if (profile.role === "field_inspector") {
    query = query.eq("inspection_stage", "field");
    if (orderId) {
      const { data: order, error: orderError } = await supabase.from("orders").select("customer_name").eq("id", orderId).single();
      if (orderError) throw databaseError(orderError, orderError.code === "PGRST116" ? 404 : 400);
      if (order.customer_name !== profile.customer_name) throw new ApiError("Forbidden", 403, "FORBIDDEN");
    } else {
      const { data: allowedOrders, error: ordersError } = await supabase.from("orders").select("id").eq("customer_name", profile.customer_name ?? "").is("deleted_at", null);
      if (ordersError) throw databaseError(ordersError);
      const allowedOrderIds = (allowedOrders ?? []).map((order) => order.id);
      if (allowedOrderIds.length === 0) return apiSuccess([]);
      query = query.in("order_id", allowedOrderIds);
    }
  } else if (stage) {
    query = query.eq("inspection_stage", stage);
  }

  const { data, error } = await query.order("created_at", { ascending });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const { user, profile } = await requireRequestProfile(request);
  const payload = (await request.json()) as InspectionInsert;
  const backend = getDataBackend();

  if (profile.role === "client") throw new ApiError("Client accounts cannot create inspection records", 403, "FORBIDDEN");
  if (payload.inspection_stage === "field" || profile.role === "field_inspector") {
    if (profile.role === "field_inspector" && payload.inspection_stage !== "field") throw new ApiError("Field inspector can only create field inspection records", 403, "FORBIDDEN");

    const order = backend === "pg"
      ? await getOrderById(payload.order_id)
      : await (async () => {
          const supabase = createRequestSupabaseClient(request);
          const { data, error: orderError } = await supabase
            .from("orders")
            .select("customer_name, inspection_plan")
            .eq("id", payload.order_id)
            .single();
          if (orderError) throw databaseError(orderError, orderError.code === "PGRST116" ? 404 : 400);
          return data;
        })();
    if (!order) throw new ApiError("Order not found", 404, "NOT_FOUND");
    if (payload.inspection_stage === "field" && order.inspection_plan !== "field") throw new ApiError("This order is not a field inspection order", 403, "FORBIDDEN");
    if (profile.role === "field_inspector" && order.customer_name !== profile.customer_name) throw new ApiError("Forbidden", 403, "FORBIDDEN");
  }

  if (backend === "pg") {
    try {
      const inserted = await insertRows<InspectionRecord>(
        "inspection_records",
        [{ ...payload, user_id: user.id }],
        TABLE_COLUMNS.inspection_records
      );
      return apiSuccess(inserted[0], 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("inspection_records")
    .insert({ ...payload, user_id: user.id })
    .select("*")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

export const DELETE = withApiHandler(async (request) => {
  const { user, profile } = await requireRequestProfile(request);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("id is required", 400, "VALIDATION_ERROR");

  if (getDataBackend() === "pg") {
    const existing = await getInspectionRecordById(id);
    if (!existing) throw new ApiError("Inspection record not found", 404, "NOT_FOUND");
    if (existing.user_id !== user.id && profile.role !== "admin" && user.email !== ADMIN_EMAIL) {
      throw new ApiError("You can only delete your own inspection records", 403, "FORBIDDEN");
    }
    try {
      const deleted = await deleteRowsByIds("inspection_records", [id]);
      if (deleted.length === 0) throw new ApiError("Inspection record not found", 404, "NOT_FOUND");
      return apiSuccess({ id });
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data: existing, error: existingError } = await supabase.from("inspection_records").select("user_id").eq("id", id).maybeSingle();
  if (existingError) throw databaseError(existingError);
  if (!existing) throw new ApiError("Inspection record not found", 404, "NOT_FOUND");
  if (existing.user_id !== user.id && profile.role !== "admin" && user.email !== ADMIN_EMAIL) {
    throw new ApiError("You can only delete your own inspection records", 403, "FORBIDDEN");
  }

  const { data, error } = await supabase.from("inspection_records").delete().eq("id", id).select("id").single();

  if (error) throw databaseError(error);
  return apiSuccess(data);
});
