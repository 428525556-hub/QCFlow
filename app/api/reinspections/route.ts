import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { TABLE_COLUMNS } from "@/src/server/db/columns";
import { listReinspections } from "@/src/server/db/inspections";
import { getOrderById, listOrders } from "@/src/server/db/orders";
import { pgError } from "@/src/server/db/pgErrors";
import { insertRows } from "@/src/server/db/write";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { ReinspectionRecord } from "@/lib/types";
import type { Database } from "@/src/types";

type ReinspectionInsert = Database["public"]["Tables"]["reinspection_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  const { profile } = await requireRequestProfile(request);
  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const ascending = params.get("ascending") === "true";
  const isCustomerScoped = profile.role === "client" || profile.role === "field_inspector";

  if (getDataBackend() === "pg") {
    let orderIds: string[] | undefined;

    if (isCustomerScoped) {
      if (orderId) {
        const order = await getOrderById(orderId);
        if (!order || order.deleted_at !== null) throw new ApiError("Order not found", 404, "NOT_FOUND");
        if (
          order.customer_name !== profile.customer_name ||
          (profile.role === "field_inspector" && order.inspection_plan !== "field")
        ) {
          throw new ApiError("Forbidden", 403, "FORBIDDEN");
        }
      } else {
        const allowedOrders = await listOrders({
          customerName: profile.customer_name ?? "",
          inspectionPlan: profile.role === "field_inspector" ? "field" : null
        });
        if (allowedOrders.length === 0) return apiSuccess([]);
        orderIds = allowedOrders.map((order) => order.id);
      }
    }

    const records = await listReinspections({ orderId, orderIds, ascending });
    return apiSuccess(records);
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("reinspection_records").select("*");
  if (orderId) query = query.eq("order_id", orderId);
  if (isCustomerScoped) {
    if (orderId) {
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("customer_name, inspection_plan")
        .eq("id", orderId)
        .is("deleted_at", null)
        .single();
      if (orderError) throw databaseError(orderError, orderError.code === "PGRST116" ? 404 : 400);
      if (
        order.customer_name !== profile.customer_name ||
        (profile.role === "field_inspector" && order.inspection_plan !== "field")
      ) {
        throw new ApiError("Forbidden", 403, "FORBIDDEN");
      }
    } else {
      let allowedQuery = supabase
        .from("orders")
        .select("id")
        .eq("customer_name", profile.customer_name ?? "")
        .is("deleted_at", null);
      if (profile.role === "field_inspector") allowedQuery = allowedQuery.eq("inspection_plan", "field");
      const { data: allowedOrders, error: ordersError } = await allowedQuery;
      if (ordersError) throw databaseError(ordersError);
      const allowedOrderIds = (allowedOrders ?? []).map((order) => order.id);
      if (allowedOrderIds.length === 0) return apiSuccess([]);
      query = query.in("order_id", allowedOrderIds);
    }
  }
  if (profile.role === "field_inspector") {
    query = query.eq("inspection_stage", "field");
  }

  const { data, error } = await query.order("created_at", { ascending });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const payload = (await request.json()) as ReinspectionInsert;

  if (getDataBackend() === "pg") {
    try {
      const inserted = await insertRows<ReinspectionRecord>(
        "reinspection_records",
        [{ ...payload, user_id: user.id }],
        TABLE_COLUMNS.reinspection_records
      );
      return apiSuccess(inserted[0], 201);
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("reinspection_records")
    .insert({ ...payload, user_id: user.id })
    .select("*")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
