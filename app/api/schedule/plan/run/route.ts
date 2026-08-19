import { randomUUID } from "crypto";

import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { runSchedule } from "@/src/services/scheduling";
import { loadScheduleInputs } from "@/src/services/scheduleService";
import type { Json } from "@/src/types";

export const POST = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const supabase = createRequestSupabaseClient(request);

  const rolloverResult = await supabase.rpc("rollover_schedule", { payload: {} as Json });
  if (rolloverResult.error) throw databaseError(rolloverResult.error);

  const inputs = await loadScheduleInputs(supabase, { replaceAuto: true });
  const readyUnits = inputs.units.filter((unit) => unit.submitStatus === "ready" && unit.quantity > 0);
  if (readyUnits.length === 0) {
    return apiSuccess({ run_id: null, inserted: 0, cancelled: 0, unassigned: [], warnings: [], message: "没有可排程的订单明细（请先在订单管理中登记送检并标记为可送检）。" });
  }

  const result = runSchedule({
    units: readyUnits,
    teams: inputs.teams,
    calendar: inputs.calendar,
    existingAssignments: inputs.existingAssignments,
    today: inputs.today
  });

  const runId = randomUUID();
  const tasks = result.assignments.map((assignment) => ({
    order_id: assignment.orderId,
    order_item_id: assignment.unitId,
    inspection_type: assignment.inspectionType,
    scheduled_date: assignment.scheduledDate,
    team_id: assignment.teamId,
    planned_quantity: assignment.plannedQuantity,
    priority: assignment.priority,
    explanation: assignment.explanation,
    remark: assignment.remark ?? null
  }));

  const { data, error } = await supabase.rpc("apply_schedule_run", {
    payload: {
      run_id: runId,
      tasks,
      cancel_ids: inputs.cancelableTaskIds,
      reason: body.reason ?? "自动重新排程"
    } as unknown as Json
  });
  if (error) throw databaseError(error);

  return apiSuccess({
    run_id: runId,
    ...(data as Record<string, unknown>),
    unassigned: result.unassigned,
    warnings: result.warnings,
    taskCount: tasks.length
  });
});
