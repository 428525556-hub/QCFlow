import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestProfile, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database, InspectionPlan } from "@/src/types";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];

export const GET = withApiHandler(async (request) => {
  const { profile } = await requireRequestProfile(request);
  const supabase = createRequestSupabaseClient(request);
  const params = request.nextUrl.searchParams;
  let query = supabase.from("orders").select("*");

  if (profile.role === "field_inspector") {
    query = query.eq("customer_name", profile.customer_name ?? "").eq("inspection_plan", "field").is("deleted_at", null);
  } else if (params.get("includeDeleted") !== "true") {
    query = query.is("deleted_at", null);
  }
  if (params.get("customerName")) query = query.eq("customer_name", params.get("customerName")!);
  const inspectionPlan = params.get("inspectionPlan") as InspectionPlan | null;
  if (inspectionPlan && ["normal", "xray", "both", "field"].includes(inspectionPlan)) query = query.eq("inspection_plan", inspectionPlan);

  const { data, error } = await query.order("shipping_date", { ascending: true, nullsFirst: false });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const user = await requireRequestUser(request);
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
