import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { pgError } from "@/src/server/db/pgErrors";
import { getScheduleTaskById, listScheduleProgress } from "@/src/server/db/schedule";
import { callScheduleRpc } from "@/src/server/db/scheduleRpc";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { Database, Json } from "@/src/types";

type TaskUpdate = Database["public"]["Tables"]["inspection_schedule"]["Update"];
type Context = { params: { id: string } };

export const GET = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  if (getDataBackend() === "pg") {
    try {
      const [task, progress] = await Promise.all([
        getScheduleTaskById(params.id),
        listScheduleProgress(params.id)
      ]);
      if (!task) throw new ApiError("Task not found", 404, "NOT_FOUND");
      return apiSuccess({ task, progress });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const [{ data: task, error }, { data: progress, error: progressError }] = await Promise.all([
    supabase.from("inspection_schedule").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("schedule_progress_records").select("*").eq("task_id", params.id).order("created_at", { ascending: true })
  ]);
  if (error) throw databaseError(error, error.code === "PGRST116" ? 404 : 400);
  if (progressError) throw databaseError(progressError);
  if (!task) throw new ApiError("Task not found", 404, "NOT_FOUND");
  return apiSuccess({ task, progress });
});

export const PATCH = withApiHandler<Context>(async (request, { params }) => {
  const { user } = await requireStaffProfile(request);
  const payload = (await request.json()) as TaskUpdate & { reason?: string; action?: string };
  if (!payload.reason?.trim()) throw new ApiError("reason is required", 400, "VALIDATION_ERROR");

  const rpcPayload: Record<string, unknown> = {
    task_id: params.id,
    reason: payload.reason,
    action: payload.action ?? (payload.locked !== undefined ? (payload.locked ? "lock" : "unlock") : "manual_adjust")
  };
  if (payload.scheduled_date !== undefined) rpcPayload.scheduled_date = payload.scheduled_date || null;
  if (payload.team_id !== undefined) rpcPayload.team_id = payload.team_id || null;
  if (payload.planned_quantity !== undefined) rpcPayload.planned_quantity = payload.planned_quantity;
  if (payload.priority !== undefined) rpcPayload.priority = payload.priority;
  if (payload.locked !== undefined) rpcPayload.locked = payload.locked;
  if (payload.remark !== undefined) rpcPayload.remark = payload.remark;

  if (getDataBackend() === "pg") {
    try {
      return apiSuccess(
        await callScheduleRpc({
          userId: user.id,
          email: user.email ?? "",
          fn: "apply_manual_adjust",
          payload: rpcPayload
        })
      );
    } catch (error) {
      throw pgError(error);
    }
  }

  const supabase = createRequestSupabaseClient(request);
  const { data, error } = await supabase.rpc("apply_manual_adjust", { payload: rpcPayload as Json });
  if (error) throw databaseError(error);
  return apiSuccess(data);
});
