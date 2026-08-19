import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { teamCapacityUnits, taskConsumptionUnits, type CalendarDay, type Team } from "@/src/services/scheduling";
import { todayKey, toInspectionStage } from "@/src/services/scheduleService";
import type { InspectionScheduleTask, InspectionStage, InspectionTeam, Order, OrderItem, ScheduleProgressRecord } from "@/src/types";

function riskFromExplanation(explanation: Record<string, unknown> | null): string {
  const level = explanation?.riskLevel;
  return typeof level === "string" ? level : "green";
}

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const date = request.nextUrl.searchParams.get("date") ?? todayKey();
  const supabase = createRequestSupabaseClient(request);

  await supabase.rpc("rollover_schedule", { payload: { date } });

  const [{ data: tasks, error: taskError }, { data: teamData, error: teamError }, { data: calendarRows, error: calendarError }, { data: exceptions, error: exceptionError }] =
    await Promise.all([
      supabase.from("inspection_schedule").select("*").eq("scheduled_date", date).not("status", "in", "(\"已取消\",\"已调整\")"),
      supabase.from("inspection_teams").select("*"),
      supabase.from("production_calendar").select("*").eq("date", date),
      supabase.from("team_work_exceptions").select("*").eq("date", date)
    ]);
  if (taskError) throw databaseError(taskError);
  if (teamError) throw databaseError(teamError);
  if (calendarError) throw databaseError(calendarError);
  if (exceptionError) throw databaseError(exceptionError);

  const taskRows = (tasks ?? []) as InspectionScheduleTask[];
  const teamRows = (teamData ?? []) as InspectionTeam[];
  const orderIds = Array.from(new Set(taskRows.map((task) => task.order_id)));
  const itemIds = Array.from(new Set(taskRows.map((task) => task.order_item_id).filter((id): id is string => Boolean(id))));
  const taskIds = taskRows.map((task) => task.id);

  const [{ data: orderRows }, { data: itemRows }, { data: progressRows }] = await Promise.all([
    orderIds.length ? supabase.from("orders").select("*").in("id", orderIds) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? supabase.from("order_items").select("*").in("id", itemIds) : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("schedule_progress_records").select("*").in("task_id", taskIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [], error: null })
  ]);

  const orderById = new Map((orderRows ?? []).map((order) => [order.id, order]));
  const itemById = new Map((itemRows ?? []).map((item) => [item.id, item]));
  const progressByTask = new Map<string, ScheduleProgressRecord[]>();
  for (const row of (progressRows ?? []) as ScheduleProgressRecord[]) {
    progressByTask.set(row.task_id, [...(progressByTask.get(row.task_id) ?? []), row]);
  }

  const calendarDay: CalendarDay = {
    isWorkDay: (calendarRows?.[0]?.is_work_day ?? true),
    workHours: calendarRows?.[0]?.work_hours != null ? Number(calendarRows[0].work_hours) : null,
    teamExceptions: {}
  };
  for (const exception of exceptions ?? []) {
    calendarDay.teamExceptions[exception.team_id] = {
      isWorking: exception.is_working,
      workHours: exception.work_hours != null ? Number(exception.work_hours) : null,
      factor: exception.capacity_factor != null ? Number(exception.capacity_factor) : null
    };
  }

  const teams: Team[] = teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    enabled: team.enabled,
    standardDailyCapacity: Number(team.standard_daily_capacity),
    baselineMembers: Number(team.baseline_members),
    currentMembers: Number(team.current_members),
    maxDailyCapacity: Number(team.max_daily_capacity),
    dailyHours: Number(team.daily_hours),
    inspectionTypes: (team.inspection_types ?? ["normal"]) as InspectionStage[],
    capacityFactors: team.capacity_factors ?? {},
    sortOrder: team.sort_order
  }));
  const teamConfigById = new Map(teams.map((team) => [team.id, team]));

  const teamGroups = new Map<string, { teamId: string; teamName: string; capacityUnits: number; plannedUnits: number; completed: number; tasks: unknown[] }>();
  for (const team of teams) {
    teamGroups.set(team.id, { teamId: team.id, teamName: team.name, capacityUnits: 0, plannedUnits: 0, completed: 0, tasks: [] });
  }

  const warnings: string[] = [];
  let plannedTotal = 0;
  let completedTotal = 0;
  let capacityTotal = 0;
  let urgentCount = 0;
  let riskCount = 0;

  for (const task of taskRows) {
    const order = orderById.get(task.order_id);
    const item = task.order_item_id ? itemById.get(task.order_item_id) : undefined;
    const team = task.team_id ? teamConfigById.get(task.team_id) : undefined;
    const groupKey = task.team_id ?? "unassigned";

    if (!teamGroups.has(groupKey)) {
      teamGroups.set(groupKey, { teamId: task.team_id ?? "", teamName: team?.name ?? "未分配", capacityUnits: 0, plannedUnits: 0, completed: 0, tasks: [] });
    }
    const group = teamGroups.get(groupKey)!;

    const styleFactor = Number(item?.style_factor ?? 1);
    const type = toInspectionStage(task.inspection_type);
    const consumedUnits = team ? taskConsumptionUnits(task.planned_quantity, styleFactor, team, type) : task.planned_quantity;
    group.plannedUnits += consumedUnits;
    group.completed += task.completed_quantity;
    group.tasks.push({ task, order, item, progress: progressByTask.get(task.id) ?? [] });
    plannedTotal += task.planned_quantity;
    completedTotal += task.completed_quantity;

    const risk = riskFromExplanation(task.explanation);
    if (risk === "red" || risk === "orange") {
      riskCount += 1;
      warnings.push(`${task.priority === "特急" ? "紧急" : "订单"} ${order?.po_number ?? task.order_id} ${risk === "red" ? "存在延期风险" : "存在送货延误风险"}。`);
    }
    if (task.priority === "加急" || task.priority === "特急" || task.status === "延期" || risk === "red") urgentCount += 1;
  }

  const teamList = Array.from(teamGroups.values()).map((group) => {
    const team = teamConfigById.get(group.teamId);
    const capacityUnits = team ? teamCapacityUnits(team, date, { [date]: calendarDay }) : 0;
    group.capacityUnits = capacityUnits;
    if (capacityUnits > 0) {
      const utilization = group.plannedUnits / capacityUnits;
      if (utilization > 1) warnings.push(`${group.teamName} 当日产能超载（利用率 ${Math.round(utilization * 100)}%）。`);
      else if (utilization > 0.9) warnings.push(`${group.teamName} 当日产能利用率 ${Math.round(utilization * 100)}%，产能紧张。`);
    }
    capacityTotal += capacityUnits;
    return group;
  });

  return apiSuccess({
    date,
    metrics: {
      planned: plannedTotal,
      completed: completedTotal,
      difference: plannedTotal - completedTotal,
      capacityUnits: Math.round(capacityTotal * 100) / 100,
      utilization: capacityTotal > 0 ? Math.round((plannedTotal / capacityTotal) * 1000) / 10 : 0,
      urgentCount,
      riskCount
    },
    teams: teamList,
    warnings
  });
});
