import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireRequestUser } from "@/src/server/supabaseServer";
import type { Database } from "@/src/types";

type ReinspectionInsert = Database["public"]["Tables"]["reinspection_records"]["Insert"];

export const GET = withApiHandler(async (request) => {
  await requireRequestUser(request);
  const params = request.nextUrl.searchParams;
  const orderId = params.get("orderId");
  const ascending = params.get("ascending") === "true";
  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("reinspection_records").select("*");
  if (orderId) query = query.eq("order_id", orderId);

  const { data, error } = await query.order("created_at", { ascending });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});

export const POST = withApiHandler(async (request) => {
  const user = await requireRequestUser(request);
  const payload = (await request.json()) as ReinspectionInsert;
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase
    .from("reinspection_records")
    .insert({ ...payload, user_id: user.id })
    .select("*")
    .single();

  if (error) throw databaseError(error);
  return apiSuccess(data, 201);
});

