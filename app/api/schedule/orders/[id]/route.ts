import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { getDataBackend } from "@/src/server/db/backend";
import { getOrderById, listOrderItems } from "@/src/server/db/orders";
import { pgError } from "@/src/server/db/pgErrors";
import {
  listInspectionTeams,
  listScheduleProgressByTaskIds,
  listScheduleTasks
} from "@/src/server/db/schedule";
import { ApiError, databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import type { InspectionScheduleTask, InspectionTeam, Order, OrderItem } from "@/src/types";

type Context = { params: { id: string } };

function riskFromExplanation(explanation: Record<string, unknown> | null): string {
  const level = explanation?.riskLevel;
  return typeof level === "string" ? level : "green";
}

export const GET = withApiHandler<Context>(async (request, { params }) => {
  await requireStaffProfile(request);
  const backend = getDataBackend();
  const supabase = backend === "supabase" ? createRequestSupabaseClient(request) : null;

  let order: Order | null;
  let taskRows: InspectionScheduleTask[];
  let itemRows: OrderItem[];
  let teamRows: InspectionTeam[];
  let progressRows: Array<{ task_id: string }>;

  if (backend === "pg") {
    try {
      [order, taskRows, itemRows, teamRows] = await Promise.all([
        getOrderById(params.id),
        listScheduleTasks({ orderId: params.id, excludeCancelled: true }),
        listOrderItems({ orderId: params.id }),
        listInspectionTeams()
      ]);
      progressRows = await listScheduleProgressByTaskIds(taskRows.map((task) => task.id));
    } catch (error) {
      throw pgError(error);
    }
  } else {
    const [
      { data: orderData, error: orderError },
      { data: tasks, error: taskError },
      { data: items, error: itemError },
      { data: teams, error: teamError }
    ] = await Promise.all([
      supabase!.from("orders").select("*").eq("id", params.id).maybeSingle(),
      supabase!.from("inspection_schedule").select("*").eq("order_id", params.id).not("status", "in", "(\"已取消\",\"已调整\")").order("scheduled_date", { ascending: true }),
      supabase!.from("order_items").select("*").eq("order_id", params.id),
      supabase!.from("inspection_teams").select("*")
    ]);
    if (orderError) throw databaseError(orderError, orderError.code === "PGRST116" ? 404 : 400);
    if (taskError) throw databaseError(taskError);
    if (itemError) throw databaseError(itemError);
    if (teamError) throw databaseError(teamError);
    order = orderData as Order | null;
    taskRows = (tasks ?? []) as InspectionScheduleTask[];
    itemRows = (items ?? []) as OrderItem[];
    teamRows = (teams ?? []) as InspectionTeam[];
    const taskIds = taskRows.map((task) => task.id);
    const { data: progress, error: progressError } = taskIds.length
      ? await supabase!.from("schedule_progress_records").select("task_id").in("task_id", taskIds)
      : { data: [], error: null };
    if (progressError) throw databaseError(progressError);
    progressRows = (progress ?? []) as Array<{ task_id: string }>;
  }

  if (!order) throw new ApiError("Order not found", 404, "NOT_FOUND");

  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const progressCountByTask = new Map<string, number>();
  for (const row of progressRows) {
    progressCountByTask.set(row.task_id, (progressCountByTask.get(row.task_id) ?? 0) + 1);
  }

  const perDate: Array<{ date: string; quantity: number; completed: number; urgent: boolean }> = [];
  const dateMap = new Map<string, { date: string; quantity: number; completed: number; urgent: boolean }>();
  let remainingPlanned = 0;
  let projectedDate: string | null = null;
  let worstRisk: string = "green";
  let targetDate: string | null = null;
  let latestAcceptable: string | null = null;

  for (const task of taskRows) {
    const explanation = (task.explanation ?? {}) as Record<string, unknown>;
    remainingPlanned += Math.max(0, task.planned_quantity - task.completed_quantity);
    if (!projectedDate || task.scheduled_date > projectedDate) projectedDate = task.scheduled_date;
    const risk = riskFromExplanation(task.explanation);
    const rank: Record<string, number> = { green: 0, yellow: 1, red: 2, overload: 3 };
    if ((rank[risk] ?? 0) > (rank[worstRisk] ?? 0)) worstRisk = risk;
    if (typeof explanation.targetDate === "string") targetDate = explanation.targetDate;
    if (typeof explanation.latestAcceptable === "string") latestAcceptable = explanation.latestAcceptable;

    const row = dateMap.get(task.scheduled_date) ?? { date: task.scheduled_date, quantity: 0, completed: 0, urgent: false };
    row.quantity += task.planned_quantity;
    row.completed += task.completed_quantity;
    const urgency = explanation.urgency;
    if (urgency === "P0" || urgency === "P1") row.urgent = true;
    dateMap.set(task.scheduled_date, row);
  }
  for (const row of dateMap.values()) perDate.push(row);
  perDate.sort((a, b) => a.date.localeCompare(b.date));

  return apiSuccess({
    order,
    items: itemRows,
    tasks: taskRows.map((task) => ({
      ...task,
      teamName: task.team_id ? teamById.get(task.team_id)?.name ?? null : null,
      progressCount: progressCountByTask.get(task.id) ?? 0,
      riskLevel: riskFromExplanation(task.explanation)
    })),
    summary: {
      remainingPlanned,
      projectedDate,
      riskLevel: worstRisk,
      targetDate,
      latestAcceptable,
      perDate
    }
  });
});
