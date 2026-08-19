import type { SupabaseClient } from "@supabase/supabase-js";

import { addDays, runSchedule, toDateKey, type CalendarDay, type ExistingAssignment, type InspectionType, type ScheduleUnit, type Team } from "@/src/services/scheduling";
import type {
  Database,
  InspectionPlan,
  InspectionRecord,
  InspectionStage,
  InspectionTeam,
  Order,
  OrderItem,
  ReinspectionRecord,
  TeamWorkException
} from "@/src/types";

export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export type ScheduleLoadResult = {
  today: string;
  teams: Team[];
  calendar: Record<string, CalendarDay>;
  units: ScheduleUnit[];
  existingAssignments: ExistingAssignment[];
  orders: Order[];
  items: OrderItem[];
  teamRows: InspectionTeam[];
  exceptions: TeamWorkException[];
  cancelableTaskIds: string[];
};

export async function loadScheduleInputs(
  supabase: SupabaseClient<Database>,
  options?: { date?: string; replaceAuto?: boolean }
): Promise<ScheduleLoadResult> {
  const today = options?.date ?? todayKey();
  const replaceAuto = options?.replaceAuto ?? false;
  const horizonEnd = addDays(today, 180);

  const [teamResult, calendarResult, exceptionResult, orderResult, itemResult, recordResult, reinspectionResult, taskResult] = await Promise.all([
    supabase.from("inspection_teams").select("*").order("sort_order", { ascending: true }),
    supabase.from("production_calendar").select("*").gte("date", today).lte("date", horizonEnd),
    supabase.from("team_work_exceptions").select("*").gte("date", today).lte("date", horizonEnd),
    supabase.from("orders").select("*").is("deleted_at", null).neq("status", "已完成"),
    supabase.from("order_items").select("*"),
    supabase.from("inspection_records").select("*"),
    supabase.from("reinspection_records").select("*"),
    supabase.from("inspection_schedule").select("*").not("status", "in", "(\"已取消\",\"已调整\")")
  ]);

  if (teamResult.error) throw teamResult.error;
  if (calendarResult.error) throw calendarResult.error;
  if (exceptionResult.error) throw exceptionResult.error;
  if (orderResult.error) throw orderResult.error;
  if (itemResult.error) throw itemResult.error;
  if (recordResult.error) throw recordResult.error;
  if (reinspectionResult.error) throw reinspectionResult.error;
  if (taskResult.error) throw taskResult.error;

  const teamRows = (teamResult.data ?? []) as InspectionTeam[];
  const orders = (orderResult.data ?? []) as Order[];
  const items = (itemResult.data ?? []) as OrderItem[];
  const records = (recordResult.data ?? []) as InspectionRecord[];
  const reinspections = (reinspectionResult.data ?? []) as ReinspectionRecord[];
  const tasks = taskResult.data ?? [];
  const exceptions = (exceptionResult.data ?? []) as TeamWorkException[];

  const teams: Team[] = teamRows.map((team) => ({
    id: team.id,
    name: team.name,
    enabled: team.enabled,
    standardDailyCapacity: Number(team.standard_daily_capacity),
    baselineMembers: Number(team.baseline_members),
    currentMembers: Number(team.current_members),
    maxDailyCapacity: Number(team.max_daily_capacity),
    dailyHours: Number(team.daily_hours),
    inspectionTypes: (team.inspection_types ?? ["normal"]) as InspectionType[],
    capacityFactors: team.capacity_factors ?? {},
    sortOrder: team.sort_order
  }));

  const calendar: Record<string, CalendarDay> = {};
  for (const entry of calendarResult.data ?? []) {
    calendar[entry.date] = {
      isWorkDay: entry.is_work_day,
      workHours: entry.work_hours != null ? Number(entry.work_hours) : null,
      teamExceptions: {}
    };
  }
  for (const exception of exceptions) {
    const day = calendar[exception.date] ?? { isWorkDay: true, workHours: null, teamExceptions: {} };
    day.teamExceptions[exception.team_id] = {
      isWorking: exception.is_working,
      workHours: exception.work_hours != null ? Number(exception.work_hours) : null,
      factor: exception.capacity_factor != null ? Number(exception.capacity_factor) : null
    };
    calendar[exception.date] = day;
  }

  // 直接出货订单不参与检品排程
  const schedulableOrders = orders.filter((order) => !order.direct_ship);
  const orderById = new Map(schedulableOrders.map((order) => [order.id, order]));
  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderIds = schedulableOrders.map((order) => order.id);

  const recordDerivedPassed = buildRecordDerivedPassed(orders, items, records, reinspections);

  // 未完成任务：已排程量 / 已完成量（进度缓存由事务函数维护）
  // replaceAuto=true 时，auto 任务将被本次重排替换，其剩余量重新进入排程池，
  // 因此已排程量只统计 锁定/手动 任务
  const openTasks = tasks.filter((task) => task.status !== "已完成");
  const scheduledByUnit = new Map<string, number>();
  const progressByUnit = new Map<string, number>();
  for (const task of openTasks) {
    const key = taskKey(task.order_item_id, task.inspection_type);
    const remaining = Math.max(0, task.planned_quantity - task.completed_quantity);
    if (!replaceAuto || task.locked || task.source === "manual") {
      scheduledByUnit.set(key, (scheduledByUnit.get(key) ?? 0) + remaining);
    }
    progressByUnit.set(key, (progressByUnit.get(key) ?? 0) + task.completed_quantity);
  }

  const units: ScheduleUnit[] = [];
  for (const order of schedulableOrders) {
    for (const item of items.filter((row) => row.order_id === order.id)) {
      const types = typesForPlan(order.inspection_plan);
      for (const type of types) {
        const key = taskKey(item.id, type);
        const taskProgress = progressByUnit.get(key) ?? 0;
        const derived = recordDerivedPassed.get(key) ?? 0;
        const inspectedCompleted = Math.max(taskProgress, derived);
        const alreadyScheduled = scheduledByUnit.get(key) ?? 0;
        const submitted = Math.min(Number(item.submitted_quantity ?? 0), Number(order.inbound_quantity ?? 0), Number(item.quantity ?? 0));

        units.push({
          id: item.id,
          orderId: order.id,
          poNumber: item.po_number || order.po_number,
          sku: item.sku || order.sku,
          color: item.color,
          size: item.size,
          quantity: Number(item.quantity ?? 0),
          submittedQuantity: Math.max(0, submitted),
          inspectedCompleted,
          alreadyScheduled,
          earliestDate: item.estimated_inspection_date ?? order.estimated_inspection_date,
          preferredDeadline: order.delivery_date,
          hardDeadline: order.shipping_date,
          inspectionType: type,
          priority: order.priority ?? "普通",
          assignedTeamId: order.assigned_team_id,
          styleFactor: Number(item.style_factor ?? 1),
          submitStatus: item.submit_status
        });
      }
    }
  }

  const capacityTasks = replaceAuto ? openTasks.filter((task) => task.locked || task.source === "manual") : openTasks;
  const existingAssignments: ExistingAssignment[] = capacityTasks
    .filter((task) => task.scheduled_date >= today)
    .map((task) => ({
      unitId: task.order_item_id,
      teamId: task.team_id,
      date: task.scheduled_date,
      type: task.inspection_type,
      plannedQuantity: task.planned_quantity,
      completedQuantity: task.completed_quantity,
      locked: task.locked,
      styleFactor: task.order_item_id ? (itemById.get(task.order_item_id)?.style_factor ?? 1) : 1
    }));

  const cancelableTaskIds = replaceAuto ? openTasks.filter((task) => !task.locked && task.source === "auto").map((task) => task.id) : [];

  return { today, teams, calendar, units, existingAssignments, orders: schedulableOrders, items, teamRows, exceptions, cancelableTaskIds };
}

export function typesForPlan(plan: InspectionPlan): InspectionType[] {
  if (plan === "normal") return ["normal"];
  if (plan === "xray") return ["xray"];
  if (plan === "field") return ["field"];
  return ["normal", "xray"];
}

function taskKey(itemId: string | null, type: string) {
  return `${itemId ?? "order"}::${type}`;
}

function buildRecordDerivedPassed(
  orders: Order[],
  items: OrderItem[],
  records: InspectionRecord[],
  reinspections: ReinspectionRecord[]
): Map<string, number> {
  const map = new Map<string, number>();

  for (const order of orders) {
    const orderInbound = Number(order.inbound_quantity ?? 0);
    if (orderInbound <= 0) continue;
    const orderItems = items.filter((item) => item.order_id === order.id);
    const itemShares = orderItems.map((item) => ({
      item,
      share: Math.min(1, (Number(item.inbound_quantity ?? 0) || 0) / orderInbound)
    }));

    for (const type of typesForPlan(order.inspection_plan)) {
      const failed = records
        .filter((record) => record.order_id === order.id && record.inspection_stage === type)
        .reduce((sum, record) => sum + Number(record.quantity ?? 0), 0);
      const recovered = reinspections
        .filter((record) => record.order_id === order.id && record.inspection_stage === type)
        .reduce((sum, record) => sum + Number(record.passed_quantity ?? 0), 0);
      const finalFailed = Math.max(0, failed - recovered);
      const passed = Math.max(0, orderInbound - finalFailed);

      for (const { item, share } of itemShares) {
        map.set(taskKey(item.id, type), Math.round(passed * share));
      }
    }
  }

  return map;
}

export function toInspectionStage(value: string): InspectionStage {
  return value === "xray" ? "xray" : value === "field" ? "field" : "normal";
}

export type UrgentInsertInput = {
  order_item_id: string;
  quantity: number;
  inspection_type: InspectionType;
  earliest_date?: string | null;
  preferred_deadline?: string | null;
  hard_deadline?: string | null;
  style_factor?: number;
};

export type UrgentInsertPreview = {
  canFit: boolean;
  capacityGap: number;
  suggestedDates: string[];
  urgentAssignments: Awaited<ReturnType<typeof runSchedule>>["assignments"];
  impactedUnits: Array<{
    unitId: string;
    beforeProjected: string | null;
    afterProjected: string | null;
    beforeRisk: string;
    newRisk: string;
  }>;
  shiftedTasks: Array<{ task_id: string; fromDate: string; toDate: string }>;
  summary: { delayedOrders: number; newRedRisks: number; newOrangeRisks: number };
};

export async function previewUrgentInsert(supabase: SupabaseClient<Database>, body: UrgentInsertInput): Promise<UrgentInsertPreview | null> {
  const inputs = await loadScheduleInputs(supabase);
  const item = inputs.items.find((row) => row.id === body.order_item_id);
  const order = item ? inputs.orders.find((row) => row.id === item.order_id) : undefined;
  if (!item || !order) return null;

  const type: InspectionType = body.inspection_type === "xray" ? "xray" : body.inspection_type === "field" ? "field" : "normal";
  const readyUnits = inputs.units.filter((unit) => unit.submitStatus === "ready" && unit.quantity > 0);
  const virtual: ScheduleUnit = {
    id: item.id,
    orderId: order.id,
    poNumber: item.po_number || order.po_number,
    sku: item.sku || order.sku,
    color: item.color,
    size: item.size,
    quantity: body.quantity,
    submittedQuantity: body.quantity,
    inspectedCompleted: 0,
    alreadyScheduled: 0,
    earliestDate: body.earliest_date ?? item.estimated_inspection_date ?? order.estimated_inspection_date,
    preferredDeadline: body.preferred_deadline ?? order.delivery_date,
    hardDeadline: body.hard_deadline ?? order.shipping_date,
    inspectionType: type,
    priority: "特急",
    assignedTeamId: order.assigned_team_id,
    styleFactor: body.style_factor ?? Number(item.style_factor ?? 1),
    submitStatus: "ready"
  };

  const common = { teams: inputs.teams, calendar: inputs.calendar, existingAssignments: inputs.existingAssignments, today: inputs.today };
  const before = runSchedule({ units: readyUnits, ...common });
  const after = runSchedule({ units: [...readyUnits, virtual], ...common });

  const urgentAssignments = after.assignments.filter((assignment) => assignment.unitId === item.id);
  const urgentUnassigned = after.unassigned.find((row) => row.unitId === item.id);
  const canFit = !urgentUnassigned;
  const capacityGap = urgentUnassigned?.remaining ?? 0;

  const impactedUnits: UrgentInsertPreview["impactedUnits"] = [];
  for (const [unitId, beforeProj] of Object.entries(before.projectedCompletions)) {
    const afterProj = after.projectedCompletions[unitId];
    if (!afterProj) continue;
    if (beforeProj.projectedDate !== afterProj.projectedDate || beforeProj.riskLevel !== afterProj.riskLevel) {
      impactedUnits.push({
        unitId,
        beforeProjected: beforeProj.projectedDate,
        afterProjected: afterProj.projectedDate,
        beforeRisk: beforeProj.riskLevel,
        newRisk: afterProj.riskLevel
      });
    }
  }

  const shiftedTasks: UrgentInsertPreview["shiftedTasks"] = [];
  if (impactedUnits.length > 0) {
    const { data: dbTasks } = await supabase
      .from("inspection_schedule")
      .select("id, scheduled_date, order_item_id")
      .in("order_item_id", impactedUnits.map((row) => row.unitId))
      .not("status", "in", "(\"已取消\",\"已调整\")");
    for (const task of dbTasks ?? []) {
      const impact = impactedUnits.find((row) => row.unitId === task.order_item_id);
      if (impact && impact.afterProjected) {
        shiftedTasks.push({ task_id: task.id, fromDate: task.scheduled_date, toDate: impact.afterProjected });
      }
    }
  }

  return {
    canFit,
    capacityGap,
    suggestedDates: urgentAssignments.map((assignment) => assignment.scheduledDate),
    urgentAssignments,
    impactedUnits,
    shiftedTasks,
    summary: {
      delayedOrders: impactedUnits.filter((row) => !row.beforeProjected || (row.afterProjected != null && row.afterProjected > (row.beforeProjected ?? ""))).length,
      newRedRisks: impactedUnits.filter((row) => row.beforeRisk !== "red" && row.newRisk === "red").length,
      newOrangeRisks: impactedUnits.filter((row) => row.beforeRisk !== "orange" && row.newRisk === "orange").length
    }
  };
}
