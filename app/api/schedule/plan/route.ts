import { apiSuccess } from "@/src/server/apiResponse";
import { withApiHandler } from "@/src/server/apiHandler";
import { databaseError } from "@/src/server/errors";
import { createRequestSupabaseClient, requireStaffProfile } from "@/src/server/supabaseServer";
import { addDays, teamCapacityUnits, taskConsumptionUnits, type CalendarDay, type Team } from "@/src/services/scheduling";
import { todayKey, toInspectionStage } from "@/src/services/scheduleService";
import type { InspectionScheduleTask, InspectionStage, InspectionTeam, Order, OrderItem } from "@/src/types";

function riskFromExplanation(explanation: Record<string, unknown> | null): string {
  const level = explanation?.riskLevel;
  return typeof level === "string" ? level : "green";
}

export const GET = withApiHandler(async (request) => {
  await requireStaffProfile(request);
  const params = request.nextUrl.searchParams;
  const from = params.get("from") ?? todayKey();
  const days = Math.min(90, Math.max(1, Number(params.get("days") ?? 14) || 14));
  const to = addDays(from, days - 1);
  const teamFilter = params.get("teamId");
  const supabase = createRequestSupabaseClient(request);

  await supabase.rpc("rollover_schedule", { payload: { date: from } });

  const [{ data: tasks, error: taskError }, { data: teamData, error: teamError }, { data: calendarRows, error: calendarError }, { data: exceptions, error: exceptionError }] =
    await Promise.all([
      supabase.from("inspection_schedule").select("*").gte("scheduled_date", from).lte("scheduled_date", to).not("status", "in", "(\"已取消\",\"已调整\")"),
      supabase.from("inspection_teams").select("*"),
      supabase.from("production_calendar").select("*").gte("date", from).lte("date", to),
      supabase.from("team_work_exceptions").select("*").gte("date", from).lte("date", to)
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
    taskIds.length ? supabase.from("schedule_progress_records").select("*").in("task_id", taskIds) : Promise.resolve({ data: [], error: null })
  ]);

  const orderById = new Map((orderRows ?? []).map((order) => [order.id, order]));
  const itemById = new Map((itemRows ?? []).map((item) => [item.id, item]));
  const teamById = new Map(teamRows.map((team) => [team.id, team]));
  const progressCountByTask = new Map<string, number>();
  for (const row of progressRows ?? []) {
    progressCountByTask.set(row.task_id, (progressCountByTask.get(row.task_id) ?? 0) + 1);
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
  const teamMap = new Map(teams.map((team) => [team.id, team]));

  const calendar: Record<string, CalendarDay> = {};
  for (const entry of calendarRows ?? []) {
    calendar[entry.date] = { isWorkDay: entry.is_work_day, workHours: entry.work_hours != null ? Number(entry.work_hours) : null, teamExceptions: {} };
  }
  for (const exception of exceptions ?? []) {
    const day = calendar[exception.date] ?? { isWorkDay: true, workHours: null, teamExceptions: {} };
    day.teamExceptions[exception.team_id] = {
      isWorking: exception.is_working,
      workHours: exception.work_hours != null ? Number(exception.work_hours) : null,
      factor: exception.capacity_factor != null ? Number(exception.capacity_factor) : null
    };
    calendar[exception.date] = day;
  }

  const filteredTasks = teamFilter ? taskRows.filter((task) => task.team_id === teamFilter) : taskRows;
  const loadMap = new Map<string, { date: string; teamId: string; plannedUnits: number; capacityUnits: number; utilization: number }>();

  for (const task of filteredTasks) {
    const team = task.team_id ? teamMap.get(task.team_id) : undefined;
    if (!team) continue;
    const item = task.order_item_id ? itemById.get(task.order_item_id) : undefined;
    const styleFactor = Number(item?.style_factor ?? 1);
    const consumed = taskConsumptionUnits(task.planned_quantity, styleFactor, team, toInspectionStage(task.inspection_type));
    const key = `${task.scheduled_date}::${task.team_id}`;
    const entry = loadMap.get(key) ?? { date: task.scheduled_date, teamId: task.team_id!, plannedUnits: 0, capacityUnits: 0, utilization: 0 };
    entry.plannedUnits += consumed;
    loadMap.set(key, entry);
  }

  const dailyLoads: Array<{ date: string; teamId: string; plannedUnits: number; capacityUnits: number; utilization: number }> = [];
  for (const entry of loadMap.values()) {
    const team = teamMap.get(entry.teamId);
    const capacityUnits = team ? teamCapacityUnits(team, entry.date, calendar) : 0;
    entry.capacityUnits = Math.round(capacityUnits * 100) / 100;
    entry.plannedUnits = Math.round(entry.plannedUnits * 100) / 100;
    entry.utilization = capacityUnits > 0 ? Math.round((entry.plannedUnits / capacityUnits) * 1000) / 10 : 0;
    dailyLoads.push(entry);
  }
  dailyLoads.sort((a, b) => a.date.localeCompare(b.date) || a.teamId.localeCompare(b.teamId));

  const warnings: string[] = [];
  for (const load of dailyLoads) {
    if (load.utilization > 100) warnings.push(`${load.date} ${teamMap.get(load.teamId)?.name ?? ""} 产能超载（${load.utilization}%）。`);
    else if (load.utilization > 90) warnings.push(`${load.date} ${teamMap.get(load.teamId)?.name ?? ""} 产能利用率 ${load.utilization}%，产能紧张。`);
  }

  const tasksWithInfo = filteredTasks.map((task) => {
    const order = orderById.get(task.order_id);
    const item = task.order_item_id ? itemById.get(task.order_item_id) : undefined;
    return {
      ...task,
      order: order ?? null,
      item: item ?? null,
      teamName: task.team_id ? teamById.get(task.team_id)?.name ?? null : null,
      progressCount: progressCountByTask.get(task.id) ?? 0,
      riskLevel: riskFromExplanation(task.explanation)
    };
  });

  return apiSuccess({ from, to, days, teams, dailyLoads, warnings, tasks: tasksWithInfo });
});
