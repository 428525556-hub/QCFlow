import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { callScheduleRpc } from "@/src/server/db/scheduleRpc";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Json } from "@/src/types";

type Context = { params: { id: string } };

export const POST = withApiHandler<Context>(async (request, { params }) => {
  const { user } = await requireStaffProfile(request);
  const payload = (await request.json()) as { quantity?: number; record_date?: string; remark?: string };
  const quantity = Number(payload.quantity ?? 0);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError("quantity must be a positive integer", 400, "VALIDATION_ERROR");

  const rpcPayload: Record<string, unknown> = { task_id: params.id, quantity };
  if (payload.record_date) rpcPayload.record_date = payload.record_date;
  if (payload.remark) rpcPayload.remark = payload.remark;

  if (getDataBackend() === "pg") {
    try {
      return apiSuccess(
        await callScheduleRpc({
          userId: user.id,
          email: user.email ?? "",
          fn: "record_schedule_progress",
          payload: rpcPayload
        })
      );
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("record_schedule_progress", { payload: rpcPayload as Json });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});
