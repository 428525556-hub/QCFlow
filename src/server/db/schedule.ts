import type {
  InspectionScheduleTask,
  InspectionTeam,
  ProductionCalendarEntry,
  ScheduleChangeLog,
  ScheduleProgressRecord,
  StyleCategory,
  TeamWorkException
} from "@/lib/types";
import type { QueryResultRow } from "pg";

import { TABLE_COLUMNS } from "./columns.ts";
import { queryRows } from "./query.ts";
import { normalizeRow, selectAll } from "./read.ts";

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

export async function upsertProductionCalendar(input: {
  date: string;
  is_work_day: boolean;
  work_hours: number | null;
  remark: string | null;
}): Promise<ProductionCalendarEntry> {
  const rows = await queryRows<QueryResultRow>(
    `insert into public.production_calendar (date, is_work_day, work_hours, remark)
     values ($1, $2, $3, $4)
     on conflict (date) do update set
       is_work_day = excluded.is_work_day,
       work_hours = excluded.work_hours,
       remark = excluded.remark
     returning ${TABLE_COLUMNS.production_calendar}`,
    [input.date, input.is_work_day, input.work_hours, input.remark]
  );
  if (rows.length === 0) throw new Error("production_calendar upsert 未返回数据");
  return normalizeRow<ProductionCalendarEntry>(rows[0]);
}

export async function upsertTeamWorkException(input: {
  team_id: string;
  date: string;
  is_working: boolean;
  work_hours: number | null;
  capacity_factor: number | null;
  remark: string | null;
}): Promise<TeamWorkException> {
  const rows = await queryRows<QueryResultRow>(
    `insert into public.team_work_exceptions (team_id, date, is_working, work_hours, capacity_factor, remark)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (team_id, date) do update set
       is_working = excluded.is_working,
       work_hours = excluded.work_hours,
       capacity_factor = excluded.capacity_factor,
       remark = excluded.remark
     returning ${TABLE_COLUMNS.team_work_exceptions}`,
    [input.team_id, input.date, input.is_working, input.work_hours, input.capacity_factor, input.remark]
  );
  if (rows.length === 0) throw new Error("team_work_exceptions upsert 未返回数据");
  return normalizeRow<TeamWorkException>(rows[0]);
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
