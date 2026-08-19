import { apiRequest } from "@/src/api/httpClient";
import type { InspectionScheduleTask, InspectionTeam, ProductionCalendarEntry, ScheduleChangeLog, ScheduleProgressRecord, StyleCategory, TeamWorkException } from "@/src/types";

export function getTodayPlan(date?: string) {
  return apiRequest<{
    date: string;
    metrics: { planned: number; completed: number; difference: number; capacityUnits: number; utilization: number; urgentCount: number; riskCount: number };
    teams: Array<{ teamId: string; teamName: string; capacityUnits: number; plannedUnits: number; completed: number; tasks: unknown[] }>;
    warnings: string[];
  }>(`/api/schedule/today${date ? `?date=${date}` : ""}`);
}

export function getSchedulePlan(params: { from?: string; days?: number; teamId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.days) query.set("days", String(params.days));
  if (params.teamId) query.set("teamId", params.teamId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<{
    from: string;
    to: string;
    days: number;
    teams: InspectionTeam[];
    dailyLoads: Array<{ date: string; teamId: string; plannedUnits: number; capacityUnits: number; utilization: number }>;
    warnings: string[];
    tasks: Array<InspectionScheduleTask & { order: unknown | null; item: unknown | null; teamName: string | null; progressCount: number; riskLevel: string }>;
  }>(`/api/schedule/plan${suffix}`);
}

export function getScheduleTask(taskId: string) {
  return apiRequest<{ task: InspectionScheduleTask; progress: ScheduleProgressRecord[] }>(`/api/schedule/tasks/${taskId}`);
}

export function adjustScheduleTask(
  taskId: string,
  payload: {
    scheduled_date?: string | null;
    team_id?: string | null;
    planned_quantity?: number;
    priority?: "普通" | "加急" | "特急";
    locked?: boolean;
    remark?: string;
    reason: string;
  }
) {
  return apiRequest(`/api/schedule/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function recordScheduleProgress(taskId: string, payload: { quantity: number; record_date?: string; remark?: string }) {
  return apiRequest(`/api/schedule/tasks/${taskId}/progress`, { method: "POST", body: JSON.stringify(payload) });
}

export function runAutoSchedule(reason?: string) {
  return apiRequest<{
    run_id: string | null;
    inserted: number;
    cancelled: number;
    unassigned: unknown[];
    warnings: unknown[];
    taskCount: number;
  }>("/api/schedule/plan/run", { method: "POST", body: JSON.stringify({ reason }) });
}

export function previewUrgentInsert(payload: {
  order_item_id: string;
  quantity: number;
  inspection_type: "normal" | "xray" | "field";
  earliest_date?: string | null;
  preferred_deadline?: string | null;
  hard_deadline?: string | null;
}) {
  return apiRequest<{
    canFit: boolean;
    capacityGap: number;
    suggestedDates: string[];
    urgentAssignments: unknown[];
    impactedUnits: Array<{ unitId: string; beforeProjected: string | null; afterProjected: string | null; beforeRisk: string; newRisk: string }>;
    shiftedTasks: Array<{ task_id: string; fromDate: string; toDate: string }>;
    summary: { delayedOrders: number; newRedRisks: number; newOrangeRisks: number };
  }>("/api/schedule/insert/preview", { method: "POST", body: JSON.stringify(payload) });
}

export function applyUrgentInsert(payload: {
  order_item_id: string;
  quantity: number;
  inspection_type: "normal" | "xray" | "field";
  earliest_date?: string | null;
  preferred_deadline?: string | null;
  hard_deadline?: string | null;
  reason: string;
  shifted_tasks?: Array<{ task_id: string; to_date: string }>;
}) {
  return apiRequest<{ run_id: string; inserted: number; shifted: number; impactedUnits: unknown[]; summary: unknown }>("/api/schedule/insert", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function rolloverSchedule(date?: string) {
  return apiRequest<{ rolled_tasks: number }>("/api/schedule/rollover", { method: "POST", body: JSON.stringify(date ? { date } : {}) });
}

export function getScheduleLogs(params: { orderId?: string; runId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.orderId) query.set("orderId", params.orderId);
  if (params.runId) query.set("runId", params.runId);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<ScheduleChangeLog[]>(`/api/schedule/logs${suffix}`);
}

export function getInspectionTeams() {
  return apiRequest<InspectionTeam[]>("/api/schedule/teams");
}

export function createInspectionTeam(payload: Partial<InspectionTeam>) {
  return apiRequest<InspectionTeam>("/api/schedule/teams", { method: "POST", body: JSON.stringify(payload) });
}

export function updateInspectionTeam(teamId: string, payload: Partial<InspectionTeam>) {
  return apiRequest<InspectionTeam>(`/api/schedule/teams/${teamId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteInspectionTeam(teamId: string) {
  return apiRequest<{ id: string }>(`/api/schedule/teams/${teamId}`, { method: "DELETE" });
}

export function getStyleFactors() {
  return apiRequest<StyleCategory[]>("/api/schedule/style-factors");
}

export function createStyleFactor(payload: Partial<StyleCategory>) {
  return apiRequest<StyleCategory>("/api/schedule/style-factors", { method: "POST", body: JSON.stringify(payload) });
}

export function updateStyleFactor(id: string, payload: Partial<StyleCategory>) {
  return apiRequest<StyleCategory>(`/api/schedule/style-factors/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function deleteStyleFactor(id: string) {
  return apiRequest<{ id: string }>(`/api/schedule/style-factors/${id}`, { method: "DELETE" });
}

export function getProductionCalendar(params: { from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<ProductionCalendarEntry[]>(`/api/schedule/calendar${suffix}`);
}

export function saveCalendarEntry(payload: Partial<ProductionCalendarEntry>) {
  return apiRequest<ProductionCalendarEntry>("/api/schedule/calendar", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteCalendarEntry(id: string) {
  return apiRequest<{ id: string }>(`/api/schedule/calendar?id=${id}`, { method: "DELETE" });
}

export function getTeamExceptions(params: { teamId?: string; from?: string; to?: string } = {}) {
  const query = new URLSearchParams();
  if (params.teamId) query.set("teamId", params.teamId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest<TeamWorkException[]>(`/api/schedule/calendar/exceptions${suffix}`);
}

export function saveTeamException(payload: Partial<TeamWorkException>) {
  return apiRequest<TeamWorkException>("/api/schedule/calendar/exceptions", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteTeamException(id: string) {
  return apiRequest<{ id: string }>(`/api/schedule/calendar/exceptions?id=${id}`, { method: "DELETE" });
}
