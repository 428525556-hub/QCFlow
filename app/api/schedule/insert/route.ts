import { randomUUID } from "crypto";

import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { callScheduleRpc } from "@/src/server/db/scheduleRpc";
import { previewUrgentInsertPg } from "@/src/server/scheduleInputs";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { previewUrgentInsert, type UrgentInsertInput } from "@/src/services/scheduleService";
import type { Json } from "@/src/types";

type InsertApplyBody = UrgentInsertInput & {
  reason?: string;
  shifted_tasks?: Array<{ task_id: string; to_date: string }>;
};

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json()) as InsertApplyBody;
  if (!body.order_item_id || !Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0) {
    throw new ApiError("order_item_id and positive quantity are required", 400, "VALIDATION_ERROR");
  }
  if (!body.reason?.trim()) throw new ApiError("reason is required", 400, "VALIDATION_ERROR");

  const backend = getDataBackend();
  const supabase = backend === "supabase" ? createRequestSupabaseClient(request) : null;
  let preview;
  try {
    preview = backend === "pg" ? await previewUrgentInsertPg(body) : await previewUrgentInsert(supabase!, body);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw backend === "pg" ? pgError(error) : databaseError(error as Error);
  }
  if (!preview) throw new ApiError("Order item not found", 404, "NOT_FOUND");
  if (!preview.canFit) {
    throw new ApiError(`当前产能不足，缺口 ${preview.capacityGap} 双，无法应用插单。请先调整产能或缩减数量。`, 400, "CAPACITY_GAP");
  }

  const runId = randomUUID();
  const tasks = preview.urgentAssignments.map((assignment) => ({
    order_id: assignment.orderId,
    order_item_id: assignment.unitId,
    inspection_type: assignment.inspectionType,
    scheduled_date: assignment.scheduledDate,
    team_id: assignment.teamId,
    planned_quantity: assignment.plannedQuantity,
    priority: "特急",
    explanation: assignment.explanation,
    remark: `紧急插单（${body.reason ?? ""}）`
  }));

  const payload = {
    run_id: runId,
    tasks,
    shifted_tasks: body.shifted_tasks ?? [],
    reason: body.reason
  };

  let data: unknown;
  if (backend === "pg") {
    try {
      data = await callScheduleRpc({
        userId: user.id,
        email: user.email ?? "",
        fn: "apply_schedule_insert",
        payload
      });
    } catch (error) {
      throw pgError(error);
    }
  } else {
    const result = await supabase!.rpc("apply_schedule_insert", { payload: payload as unknown as Json });
    if (result.error) throw databaseError(result.error);
    data = result.data;
  }

  return apiSuccess({ run_id: runId, ...(data as Record<string, unknown>), impactedUnits: preview.impactedUnits, summary: preview.summary });
});
