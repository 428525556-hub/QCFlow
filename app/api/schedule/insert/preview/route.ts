import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { previewUrgentInsertPg } from "@/src/server/scheduleInputs";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { previewUrgentInsert, type UrgentInsertInput } from "@/src/services/scheduleService";

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json()) as UrgentInsertInput;
  if (!body.order_item_id || !Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0) {
    throw new ApiError("order_item_id and positive quantity are required", 400, "VALIDATION_ERROR");
  }

  if (getDataBackend() === "pg") {
    try {
      const preview = await previewUrgentInsertPg(body);
      if (!preview) throw new ApiError("Order item not found", 404, "NOT_FOUND");
      return apiSuccess(preview);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  try {
    const preview = await previewUrgentInsert(supabase, body);
    if (!preview) throw new ApiError("Order item not found", 404, "NOT_FOUND");
    return apiSuccess(preview);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw databaseError(error as Error);
  }
});
