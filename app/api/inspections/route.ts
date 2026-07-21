import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database, InspectionStage } from "@/src/types";

type InspectionInsert = Database["public"]["Tables"]["inspection_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const stage = params.get("stage") as InspectionStage | null;
  const ascending = params.get("ascending") === "true";
  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("inspection_records").select("*");

  if (orderId) query = query.eq("order_id", orderId);
  if (stage) query = query.eq("inspection_stage", stage);

  const { data, error } = await query.order("created_at", { ascending });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const user = await requireRequestUser(request);
  const payload = (await request.json()) as InspectionInsert;
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
  await requireRequestUser(request);
  const id = request.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError("id is required", 400, "VALIDATION_ERROR");

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.from("inspection_records").delete().eq("id", id).select("id").single();

  if (error) throw databaseError(error);
  return apiSuccess(data);
});
