import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Json } from "@/src/types";

type Context = { params: { id: string } };

export const POST = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  const payload = (await request.json()) as { quantity?: number; record_date?: string; remark?: string };
  const quantity = Number(payload.quantity ?? 0);
  if (!Number.isInteger(quantity) || quantity <= 0) throw new ApiError("quantity must be a positive integer", 400, "VALIDATION_ERROR");

  const supabase = createRequestSupabaseClient(request);
  const rpcPayload: Record<string, unknown> = { task_id: params.id, quantity };
  if (payload.record_date) rpcPayload.record_date = payload.record_date;
  if (payload.remark) rpcPayload.remark = payload.remark;

  const { data, error } = await supabase.rpc("record_schedule_progress", { payload: rpcPayload as Json });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});
