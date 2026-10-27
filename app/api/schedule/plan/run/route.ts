import { randomUUID } from "crypto";

import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { callScheduleRpc } from "@/src/server/db/scheduleRpc";
import { loadScheduleInputsPg } from "@/src/server/scheduleInputs";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { runSchedule } from "@/src/services/scheduling";
import { loadScheduleInputs } from "@/src/services/scheduleService";
import type { Json } from "@/src/types";

export const POST = withApiHandler(async (request) => {
  const { user } = await requireStaffProfile(request);
  const body = (await request.json().catch(() => ({}))) as { reason?: string };
  const backend = getDataBackend();
  const supabase = backend === "supabase" ? createRequestSupabaseClient(request) : null;

  let inputs;
  if (backend === "pg") {
    try {
      await callScheduleRpc({
        userId: user.id,
        email: user.email ?? "",
        fn: "rollover_schedule",
        payload: {}
      });
      inputs = await loadScheduleInputsPg({ replaceAuto: true });
    } catch (error) {
      throw pgError(error);
    }
  } else {
    const rolloverResult = await supabase!.rpc("rollover_schedule", { payload: {} as Json });
    if (rolloverResult.error) throw databaseError(rolloverResult.error);
    inputs = await loadScheduleInputs(supabase!, { replaceAuto: true });
  }

  const noTeamSet = new Set(inputs.noTeamUnitIds);
  const readyUnits = inputs.units.filter((unit) => unit.submitStatus === "ready" && unit.quantity > 0 && !noTeamSet.has(unit.id));
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

  const payload = {
    run_id: runId,
    tasks,
    cancel_ids: inputs.cancelableTaskIds,
    reason: body.reason ?? "自动重新排程"
  };

  let data: unknown;
  if (backend === "pg") {
    try {
      data = await callScheduleRpc({
        userId: user.id,
        email: user.email ?? "",
        fn: "apply_schedule_run",
        payload
      });
    } catch (error) {
      throw pgError(error);
    }
  } else {
    const result = await supabase!.rpc("apply_schedule_run", { payload: payload as unknown as Json });
    if (result.error) throw databaseError(result.error);
    data = result.data;
  }

  return apiSuccess({
    run_id: runId,
    ...(data as Record<string, unknown>),
    unassigned: result.unassigned,
    warnings: result.warnings,
    taskCount: tasks.length,
    skipSummary: inputs.skipSummary,
    skipDetails: inputs.skipDetails
  });
});
