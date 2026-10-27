import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { listOrders } from "@/src/server/db/orders";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database, InspectionPlan } from "@/src/types";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
const VALID_INSPECTION_PLANS: InspectionPlan[] = ["normal", "xray", "both", "field"];

export const GET = withApiHandler(async (request) => {
  const { profile } = await requireRequestProfile(request);
  const params = request.nextUrl.searchParams;

  if (getDataBackend() === "pg") {
    const requestedPlan = params.get("inspectionPlan") as InspectionPlan | null;
    const inspectionPlan = requestedPlan && VALID_INSPECTION_PLANS.includes(requestedPlan) ? requestedPlan : null;
    const isCustomerScoped = profile.role === "client" || profile.role === "field_inspector";

    // 与 Supabase 分支保持一致：外检员固定只看 field，且入参与之冲突时结果为空
    if (profile.role === "field_inspector" && inspectionPlan && inspectionPlan !== "field") {
      return apiSuccess([]);
    }

    const orders = await listOrders({
      customerName: isCustomerScoped ? (profile.customer_name ?? "") : params.get("customerName"),
      inspectionPlan: inspectionPlan ?? (profile.role === "field_inspector" ? "field" : null),
      includeDeleted: !isCustomerScoped && params.get("includeDeleted") === "true"
    });
    return apiSuccess(orders);
  }

  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("orders").select("*");

  if (profile.role === "client") {
    query = query.eq("customer_name", profile.customer_name ?? "").is("deleted_at", null);
  } else if (profile.role === "field_inspector") {
    query = query.eq("customer_name", profile.customer_name ?? "").eq("inspection_plan", "field").is("deleted_at", null);
  } else if (params.get("includeDeleted") !== "true") {
    query = query.is("deleted_at", null);
  }
  if (params.get("customerName") && profile.role !== "client") query = query.eq("customer_name", params.get("customerName")!);
  const inspectionPlan = params.get("inspectionPlan") as InspectionPlan | null;
  if (inspectionPlan && ["normal", "xray", "both", "field"].includes(inspectionPlan)) query = query.eq("inspection_plan", inspectionPlan);

  const { data, error } = await query.order("shipping_date", { ascending: true, nullsFirst: false });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  if (!user) throw new ApiError("Unauthorized", 401, "UNAUTHORIZED");
  if (getDataBackend() === "pg") {
    throw new ApiError("写接口尚未迁移到国内数据库", 501, "NOT_IMPLEMENTED");
  }
  const payload = (await request.json()) as OrderInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("orders")
    .insert({ ...payload, user_id: user.id })
    .select("id")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});
