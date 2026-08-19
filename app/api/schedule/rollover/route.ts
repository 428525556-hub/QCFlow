import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Json } from "@/src/types";

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("rollover_schedule", {
    payload: (body.date ? { date: body.date } : {}) as Json
  });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});
