import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { callScheduleRpc } from "@/src/server/db/scheduleRpc";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Json } from "@/src/types";

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json().catch(() => ({}))) as { date?: string };
  const payload: Record<string, unknown> = body.date ? { date: body.date } : {};

  if (getDataBackend() === "pg") {
    try {
      return apiSuccess(
        await callScheduleRpc({
          userId: user.id,
          email: user.email ?? "",
          fn: "rollover_schedule",
          payload
        })
      );
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("rollover_schedule", {
    payload: payload as Json
  });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});
