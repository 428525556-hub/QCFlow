import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database, InspectionStage } from "@/src/types";

type InspectionInsert = Database["public"]["Tables"]["inspection_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  const { profile } = await requireRequestProfile(request);
  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const stage = params.get("stage") as InspectionStage | null;
  const ascending = params.get("ascending") === "true";
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
  const supabase = createRequestSupabaseClient(request);

  if (payload.inspection_stage === "field" || profile.role === "field_inspector") {
    if (profile.role === "field_inspector" && payload.inspection_stage !== "field") throw new ApiError("Field inspector can only create field inspection records", 403, "FORBIDDEN");
    const { data: order, error: orderError } = await supabase.from("orders").select("customer_name, inspection_plan").eq("id", payload.order_id).single();
    if (orderError) throw databaseError(orderError, orderError.code === "PGRST116" ? 404 : 400);
    if (payload.inspection_stage === "field" && order.inspection_plan !== "field") throw new ApiError("This order is not a field inspection order", 403, "FORBIDDEN");
    if (profile.role === "field_inspector" && order.customer_name !== profile.customer_name) throw new ApiError("Forbidden", 403, "FORBIDDEN");
  }

  const { data, error } = await supabase
    .from("inspection_records")
    .insert({ ...payload, user_id: user.id })
    .select("*")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

export const DELETE = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("id is required", 400, "VALIDATION_ERROR");

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("inspection_records").delete().eq("id", id).select("id").single();

  if (error) throw databaseError(error);
  return apiSuccess(data);
});
