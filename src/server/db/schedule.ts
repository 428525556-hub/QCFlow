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
  return selectAll<InspectionTeam>("inspection_teams", { orderBy: "sort_order asc, created_at asc" });
}

export async function listStyleCategories(): Promise<StyleCategory[]> {
  return selectAll<StyleCategory>("style_categories", { orderBy: "factor asc" });
}

export async function listProductionCalendar(
  filters: { from?: string | null; to?: string | null } = {}
): Promise<ProductionCalendarEntry[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.from) {
    values.push(filters.from);
    conditions.push(`date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`date <= $${values.length}`);
  }

  return selectAll<ProductionCalendarEntry>("production_calendar", {
    conditions,
    values,
    orderBy: "date asc"
  });
}

export async function listTeamWorkExceptions(
  filters: { teamId?: string | null; from?: string | null; to?: string | null } = {}
): Promise<TeamWorkException[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.teamId) {
    values.push(filters.teamId);
    conditions.push(`team_id = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`date <= $${values.length}`);
  }

  return selectAll<TeamWorkException>("team_work_exceptions", {
    conditions,
    values,
    orderBy: "date asc"
  });
}

export async function listScheduleTasks(
  filters: {
    orderId?: string | null;
    orderItemIds?: string[] | null;
    scheduledDate?: string | null;
    from?: string | null;
    to?: string | null;
    excludeCancelled?: boolean;
  } = {}
): Promise<InspectionScheduleTask[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderItemIds && filters.orderItemIds.length === 0) return [];
  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }
  if (filters.orderItemIds && filters.orderItemIds.length > 0) {
    values.push(filters.orderItemIds);
    conditions.push(`order_item_id = any($${values.length}::uuid[])`);
  }
  if (filters.scheduledDate) {
    values.push(filters.scheduledDate);
    conditions.push(`scheduled_date = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`scheduled_date >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`scheduled_date <= $${values.length}`);
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

export async function listScheduleProgressByTaskIds(taskIds: string[]): Promise<ScheduleProgressRecord[]> {
  if (taskIds.length === 0) return [];
  return selectAll<ScheduleProgressRecord>("schedule_progress_records", {
    conditions: ["task_id = any($1::uuid[])"],
    values: [taskIds],
    orderBy: "created_at asc"
  });
}

export async function getScheduleTaskById(id: string): Promise<InspectionScheduleTask | null> {
  const rows = await selectAll<InspectionScheduleTask>("inspection_schedule", {
    conditions: ["id = $1"],
    values: [id],
    limit: 1
  });
  return rows[0] ?? null;
}

export async function listScheduleChangeLogs(
  filters: { orderId?: string | null; runId?: string | null; limit?: number } = {}
): Promise<ScheduleChangeLog[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }
  if (filters.runId) {
    values.push(filters.runId);
    conditions.push(`run_id = $${values.length}`);
  }

  return selectAll<ScheduleChangeLog>("schedule_change_logs", {
    conditions,
    values,
    orderBy: "created_at desc",
    limit: filters.limit
  });
}
