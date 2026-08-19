import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireAdminProfile } from "@/src/server/supabaseServer";

export const GET = withApiHandler(async (request) => {
  await requireAdminProfile(request);
  const params = request.nextUrl.searchParams;
  const supabase = createRequestSupabaseClient(request);
  let query = supabase.from("schedule_change_logs").select("*").order("created_at", { ascending: false }).limit(300);
  if (params.get("orderId")) query = query.eq("order_id", params.get("orderId")!);
  if (params.get("runId")) query = query.eq("run_id", params.get("runId")!);
  const { data, error } = await query;
  if (error) throw databaseError(error);
  return apiSuccess(data);
});
