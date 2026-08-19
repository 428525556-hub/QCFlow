import { randomUUID } from "crypto";

import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { previewUrgentInsert, type UrgentInsertInput } from "@/src/services/scheduleService";
import type { Json } from "@/src/types";

type InsertApplyBody = UrgentInsertInput & {
  reason?: string;
  shifted_tasks?: Array<{ task_id: string; to_date: string }>;
};

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json()) as InsertApplyBody;
  if (!body.order_item_id || !Number.isInteger(Number(body.quantity)) || Number(body.quantity) <= 0) {
    throw new ApiError("order_item_id and positive quantity are required", 400, "VALIDATION_ERROR");
  }
  if (!body.reason?.trim()) throw new ApiError("reason is required", 400, "VALIDATION_ERROR");

  const supabase = createRequestSupabaseClient(request);
  const preview = await previewUrgentInsert(supabase, body);
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

  const { data, error } = await supabase.rpc("apply_schedule_insert", {
    payload: {
      run_id: runId,
      tasks,
      shifted_tasks: body.shifted_tasks ?? [],
      reason: body.reason
    } as unknown as Json
  });
  if (error) throw databaseError(error);

  return apiSuccess({ run_id: runId, ...(data as Record<string, unknown>), impactedUnits: preview.impactedUnits, summary: preview.summary });
});
