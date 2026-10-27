import type {
  InspectionScheduleTask,
  InspectionTeam,
  ProductionCalendarEntry,
  ScheduleChangeLog,
  ScheduleProgressRecord,
  StyleCategory,
  TeamWorkException
} from "@/lib/types";

import { selectAll } from "./read.ts";

export async function listInspectionTeams(): Promise<InspectionTeam[]> {
  return selectAll<InspectionTeam>("inspection_teams", { orderBy: "sort_order asc" });
}

export async function listStyleCategories(): Promise<StyleCategory[]> {
  return selectAll<StyleCategory>("style_categories", { orderBy: "name asc" });
}

export async function listProductionCalendar(fromDate: string, toDate: string): Promise<ProductionCalendarEntry[]> {
  return selectAll<ProductionCalendarEntry>("production_calendar", {
    conditions: ["date >= $1", "date <= $2"],
    values: [fromDate, toDate],
    orderBy: "date asc"
  });
}

export async function listTeamWorkExceptions(fromDate: string, toDate: string): Promise<TeamWorkException[]> {
  return selectAll<TeamWorkException>("team_work_exceptions", {
    conditions: ["date >= $1", "date <= $2"],
    values: [fromDate, toDate],
    orderBy: "date asc"
  });
}

export async function listScheduleTasks(
  filters: { orderId?: string | null; excludeCancelled?: boolean } = {}
): Promise<InspectionScheduleTask[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }
  if (filters.excludeCancelled) {
    conditions.push("status not in ('已取消', '已调整')");
  }

  return selectAll<InspectionScheduleTask>("inspection_schedule", {
    conditions,
    values,
    orderBy: "scheduled_date asc, created_at asc"
  });
}

export async function listScheduleProgress(taskId: string): Promise<ScheduleProgressRecord[]> {
  return selectAll<ScheduleProgressRecord>("schedule_progress_records", {
    conditions: ["task_id = $1"],
    values: [taskId],
    orderBy: "created_at asc"
  });
}

export async function listScheduleChangeLogs(orderId?: string | null): Promise<ScheduleChangeLog[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (orderId) {
    values.push(orderId);
    conditions.push(`order_id = $${values.length}`);
  }

  return selectAll<ScheduleChangeLog>("schedule_change_logs", {
    conditions,
    values,
    orderBy: "created_at desc"
  });
}
