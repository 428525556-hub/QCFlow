import { addDays, businessDaysBetween, diffCalendarDays, isWorkDay, workdaysBefore } from "./calendar.ts";
import { pairsFromUnits, taskConsumptionUnits, teamCapacityUnits } from "./capacity.ts";
import { buildTaskExplanation } from "./explain.ts";
import type {
  Assignment,
  CalendarDay,
  DailyLoad,
  InspectionType,
  ProjectedCompletion,
  RiskLevel,
  ScheduleRunInput,
  ScheduleRunResult,
  ScheduleUnit,
  Team,
  UnassignedUnit,
  UrgencyLevel,
  Warning
} from "./types.ts";

const DEFAULT_HORIZON_DAYS = 120;
const DEFAULT_LEAD_WORKDAYS = 7;
const DEFAULT_BUFFER_WORKDAYS = 1;
const EPSILON = 0.000001;

interface RawAssignment {
  unit: ScheduleUnit;
  scheduledDate: string;
  teamId: string;
  plannedQuantity: number;
  reasonCodes: string[];
}

interface UnitMeta {
  unit: ScheduleUnit;
  toSchedule: number;
  primary: string | null;
  targetDate: string | null;
  latestAcceptable: string | null;
  tier: number;
  riskScore: number;
  targetReachable: boolean;
}

interface UnitResult {
  unitId: string;
  raw: RawAssignment[];
  unassigned: UnassignedUnit | null;
  projected: ProjectedCompletion;
}

function priorityTier(unit: ScheduleUnit, meta: Omit<UnitMeta, "tier" | "riskScore">, today: string, tomorrow: string): number {
  const primary = meta.primary;
  if (!primary) return 5;
  if (primary < today) return 0; // 已过送货日，最优先
  if (primary === today) return 1; // P0 当天送货
  if (primary === tomorrow) return 2; // P1 明天送货
  if (!meta.targetReachable) return 3; // P2 无法提前 7 个工作日完成
  return 4; // P3 正常
}

function riskScoreOf(
  unit: ScheduleUnit,
  meta: Omit<UnitMeta, "tier" | "riskScore">,
  teamsById: Map<string, Team>,
  today: string,
  calendar: Record<string, CalendarDay>
): number {
  if (!meta.primary) return 0;
  const totalDailyPairs = Array.from(teamsById.values())
    .filter((team) => team.enabled && team.inspectionTypes.includes(unit.inspectionType))
    .reduce((sum, team) => sum + team.standardDailyCapacity, 0);
  if (totalDailyPairs <= 0) return 99;
  const workdaysNeeded = Math.ceil(meta.toSchedule / totalDailyPairs);
  const workdaysAvailable = Math.max(1, businessDaysBetween(today, meta.primary, calendar));
  return workdaysNeeded / workdaysAvailable;
}

function buildMeta(unit: ScheduleUnit, ctx: { teamsById: Map<string, Team>; calendar: Record<string, CalendarDay>; today: string; leadWorkdays: number; bufferWorkdays: number }): UnitMeta | null {
  const { teamsById, calendar, today, leadWorkdays, bufferWorkdays } = ctx;

  const remainingToInspect = unit.quantity - unit.inspectedCompleted;
  const cap = Math.max(0, unit.submittedQuantity - unit.inspectedCompleted - unit.alreadyScheduled);
  const toSchedule = Math.min(remainingToInspect, cap);
  if (toSchedule <= 0) return null;

  const preferred = unit.preferredDeadline && unit.hardDeadline && unit.preferredDeadline > unit.hardDeadline ? unit.hardDeadline : unit.preferredDeadline;
  const hard = unit.hardDeadline ?? preferred;
  const primary = preferred ?? hard;
  const earliest = unit.earliestDate ?? today;
  const targetDate = primary ? workdaysBefore(primary, leadWorkdays, calendar) : null;
  const latestAcceptable = primary ? workdaysBefore(primary, bufferWorkdays, calendar) : null;
  const targetReachable = primary ? targetDate! >= earliest : false;
  const tomorrow = addDays(today, 1);

  const base = { unit, toSchedule, primary, targetDate, latestAcceptable, targetReachable };
  const tier = !primary || earliest > primary ? 5 : priorityTier(unit, base, today, tomorrow);
  const riskScore = riskScoreOf(unit, base, teamsById, today, calendar);
  return { ...base, tier, riskScore };
}

function compareMeta(a: UnitMeta, b: UnitMeta): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const aDate = a.tier === 4 ? a.targetDate ?? "9999-12-31" : a.primary ?? "9999-12-31";
  const bDate = b.tier === 4 ? b.targetDate ?? "9999-12-31" : b.primary ?? "9999-12-31";
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  const aRank = priorityRank(a.unit.priority);
  const bRank = priorityRank(b.unit.priority);
  if (aRank !== bRank) return aRank - bRank;
  return b.riskScore - a.riskScore;
}

function priorityRank(priority: string): number {
  return priority === "特急" ? 0 : priority === "加急" ? 1 : 2;
}

function urgencyOf(tier: number): UrgencyLevel {
  if (tier <= 1) return "P0";
  if (tier === 2) return "P1";
  if (tier === 3) return "P2";
  return "P3";
}

export function runSchedule(input: ScheduleRunInput): ScheduleRunResult {
  const { units, teams, calendar, existingAssignments, today } = input;
  const horizonDays = Math.max(7, input.horizonDays ?? DEFAULT_HORIZON_DAYS);
  const leadWorkdays = input.leadWorkdays ?? DEFAULT_LEAD_WORKDAYS;
  const bufferWorkdays = input.bufferWorkdays ?? DEFAULT_BUFFER_WORKDAYS;
  const teamsById = new Map(teams.filter((team) => team.enabled).map((team) => [team.id, team]));

  const used = new Map<string, Map<string, number>>();

  function getUsed(date: string, teamId: string): Map<string, number> {
    let teamUsed = used.get(date);
    if (!teamUsed) {
      teamUsed = new Map();
      used.set(date, teamUsed);
    }
    if (!teamUsed.has(teamId)) teamUsed.set(teamId, 0);
    return teamUsed;
  }

  function consume(date: string, teamId: string | null, units: number) {
    if (!teamId) return;
    const teamUsed = getUsed(date, teamId);
    teamUsed.set(teamId, (teamUsed.get(teamId) ?? 0) + units);
  }

  function freeUnits(date: string, team: Team, type: InspectionType): number {
    const capacity = teamCapacityUnits(team, date, calendar);
    if (capacity <= 0) return 0;
    const consumed = used.get(date)?.get(team.id) ?? 0;
    return Math.max(0, capacity - consumed);
  }

  for (const assignment of existingAssignments) {
    if (!assignment.teamId) continue;
    const team = teamsById.get(assignment.teamId);
    if (!team) continue;
    const units = taskConsumptionUnits(assignment.plannedQuantity, assignment.styleFactor ?? 1, team, assignment.type);
    consume(assignment.date, assignment.teamId, units);
  }

  const ctx = { teamsById, freeUnits, consume, calendar, today, leadWorkdays, bufferWorkdays };
  const metas: UnitMeta[] = [];
  for (const unit of units) {
    const meta = buildMeta(unit, ctx);
    if (meta) metas.push(meta);
  }
  metas.sort(compareMeta);
  const metaByUnit = new Map(metas.map((meta) => [meta.unit.id, meta]));

  const unitResults: UnitResult[] = [];
  for (const meta of metas) {
    unitResults.push(scheduleUnit(meta, ctx));
  }

  const assignments: Assignment[] = [];
  const unassigned: UnassignedUnit[] = [];
  const warnings: Warning[] = [];
  const projectedCompletions: Record<string, ProjectedCompletion> = {};

  for (const result of unitResults) {
    for (const raw of result.raw) {
      const team = teamsById.get(raw.teamId);
      if (!team) continue;
      const capacityUnits = teamCapacityUnits(team, raw.scheduledDate, calendar);
      const meta = metaByUnit.get(raw.unit.id);
      const explanation = buildTaskExplanation({
        unit: raw.unit,
        team,
        reasonCodes: raw.reasonCodes,
        projectedDate: result.projected.projectedDate,
        riskLevel: result.projected.riskLevel,
        today,
        calendar,
        capacityUnits,
        targetDate: meta?.targetDate ?? null,
        latestAcceptable: meta?.latestAcceptable ?? null,
        urgency: urgencyOf(meta?.tier ?? 4),
        overload: result.projected.riskLevel === "overload"
      });
      assignments.push({
        unitId: raw.unit.id,
        orderId: raw.unit.orderId,
        poNumber: raw.unit.poNumber,
        sku: raw.unit.sku,
        color: raw.unit.color,
        size: raw.unit.size,
        inspectionType: raw.unit.inspectionType,
        scheduledDate: raw.scheduledDate,
        teamId: raw.teamId,
        plannedQuantity: raw.plannedQuantity,
        priority: raw.unit.priority,
        explanation,
        source: "auto"
      });
    }

    if (result.unassigned) {
      unassigned.push(result.unassigned);
      warnings.push({
        level: result.unassigned.reason === "overload" ? "overload" : "red",
        unitId: result.unassigned.unitId,
        message:
          result.unassigned.reason === "config_conflict"
            ? "配置冲突：预计可检日期晚于送货/出货日期，需人工处理。"
            : result.unassigned.reason === "missing_deadline"
              ? "缺少 Deadline（送货/出货日期均未设置），无法排程。"
              : result.unassigned.reason === "paused"
                ? "该明细已暂停送检，未排程。"
                : `当前产能不足，按照现有排班无法在要求时间内完成该订单（超负荷），剩余 ${result.unassigned.remaining} 双，预计延期 ${result.unassigned.projectedDelayDays} 个工作日。`
      });
    } else if (result.projected.riskLevel === "red" && result.projected.projectedDate) {
      warnings.push({
        level: "red",
        unitId: result.raw[0]?.unit.id,
        message: `需要非常集中排班才能按时完成（红色预警），预计完成 ${result.projected.projectedDate}。`
      });
    } else if (result.projected.riskLevel === "yellow" && result.projected.projectedDate) {
      warnings.push({
        level: "yellow",
        unitId: result.raw[0]?.unit.id,
        message: "无法提前 7 个工作日完成，但可在送货前 1 个工作日完成（黄色预警）。"
      });
    }

    projectedCompletions[result.unitId] = result.projected;
  }

  const dailyLoads: DailyLoad[] = [];
  const horizonEnd = addDays(today, horizonDays);
  for (const [date, teamUsed] of used.entries()) {
    if (date < today || date > horizonEnd) continue;
    for (const [teamId, plannedUnits] of teamUsed.entries()) {
      const team = teamsById.get(teamId);
      if (!team) continue;
      const capacityUnits = teamCapacityUnits(team, date, calendar);
      const utilization = capacityUnits > 0 ? Math.round((plannedUnits / capacityUnits) * 10000) / 10000 : plannedUnits > 0 ? Infinity : 0;
      dailyLoads.push({ date, teamId, plannedUnits: Math.round(plannedUnits * 100) / 100, capacityUnits: Math.round(capacityUnits * 100) / 100, utilization });
      if (utilization > 1) {
        warnings.push({ level: "red", date, teamId, message: `当日产能超载（利用率 ${Math.round(utilization * 100)}%）。` });
      } else if (utilization > 0.9) {
        warnings.push({ level: "yellow", date, teamId, message: `当日产能利用率 ${Math.round(utilization * 100)}%，产能紧张。` });
      }
    }
  }

  dailyLoads.sort((a, b) => a.date.localeCompare(b.date) || a.teamId.localeCompare(b.teamId));

  return { assignments, unassigned, warnings, dailyLoads, projectedCompletions };
}

function scheduleUnit(
  meta: UnitMeta,
  ctx: {
    teamsById: Map<string, Team>;
    freeUnits: (date: string, team: Team, type: InspectionType) => number;
    consume: (date: string, teamId: string | null, units: number) => void;
    calendar: Record<string, CalendarDay>;
    today: string;
  }
): UnitResult {
  const unit = meta.unit;
  const { teamsById, freeUnits, consume, calendar, today } = ctx;
  const raw: RawAssignment[] = [];
  const toSchedule = meta.toSchedule;
  // 不允许排到过去：最早可排日期取 max(预计可检日期, 今天)
  const earliest = unit.earliestDate && unit.earliestDate > today ? unit.earliestDate : today;

  if (unit.submitStatus === "paused") {
    return {
      unitId: unit.id,
      raw,
      unassigned: { unitId: unit.id, orderId: unit.orderId, remaining: toSchedule, reason: "paused", projectedDelayDays: 0 },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "overload" }
    };
  }
  if (!meta.primary) {
    return {
      unitId: unit.id,
      raw,
      unassigned: { unitId: unit.id, orderId: unit.orderId, remaining: toSchedule, reason: "missing_deadline", projectedDelayDays: 0 },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "overload" }
    };
  }
  if (earliest > meta.primary && meta.primary >= today) {
    return {
      unitId: unit.id,
      raw,
      unassigned: { unitId: unit.id, orderId: unit.orderId, remaining: toSchedule, reason: "config_conflict", projectedDelayDays: 0 },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "overload" }
    };
  }

  const primary = meta.primary;

  const candidates = eligibleTeams(unit, teamsById);
  const arrivalLimited = unit.submittedQuantity - unit.inspectedCompleted - unit.alreadyScheduled < unit.quantity - unit.inspectedCompleted;
  const reasonCodes: string[] = arrivalLimited ? ["arrival_limited"] : [];
  let remaining = toSchedule;
  let lastDate: string | null = null;
  let projectedDate: string | null = null;

  // 已过送货/出货日：从今天开始正排追赶，尽快完成
  if (primary < today) {
    let date = today;
    while (remaining > 0 && date <= addDays(today, 60)) {
      remaining = allocateDay(unit, date, candidates, remaining, raw, reasonCodes, freeUnits, consume, calendar, today);
      date = addDays(date, 1);
    }
    lastDate = raw.length > 0 ? raw[raw.length - 1].scheduledDate : null;
    if (remaining > 0) {
      return {
        unitId: unit.id,
        raw,
        unassigned: {
          unitId: unit.id,
          orderId: unit.orderId,
          remaining,
          reason: "overload",
          note: arrivalLimited ? "部分受实际可检数量限制" : undefined,
          projectedDelayDays: 0
        },
        projected: { projectedDate: null, bufferDays: null, riskLevel: "overload" }
      };
    }
    return {
      unitId: unit.id,
      raw,
      unassigned: null,
      projected: { projectedDate: lastDate, bufferDays: null, riskLevel: "red" }
    };
  }

  // 第一阶段：从目标完成日期（或最晚可接受日期）向前倒排
  const startBackward = meta.targetReachable ? meta.targetDate! : meta.latestAcceptable!;
  if (startBackward >= earliest) {
    let date = startBackward;
    while (date >= earliest && remaining > 0) {
      remaining = allocateDay(unit, date, candidates, remaining, raw, reasonCodes, freeUnits, consume, calendar, today);
      date = addDays(date, -1);
    }
    lastDate = raw.length > 0 ? raw[0].scheduledDate : null;
  }

  // 第二阶段：目标前排不完，向送货/出货日方向压缩
  if (remaining > 0 && primary > startBackward) {
    reasonCodes.push("compressed");
    let date = addDays(startBackward, 1);
    while (date <= primary && remaining > 0) {
      remaining = allocateDay(unit, date, candidates, remaining, raw, reasonCodes, freeUnits, consume, calendar, today);
      date = addDays(date, 1);
    }
    lastDate = raw.length > 0 ? raw[raw.length - 1].scheduledDate : lastDate;
  }

  projectedDate = lastDate;
  let delayDays = 0;

  if (remaining > 0) {
    projectedDate = null;
    delayDays = estimateDelayDays(unit, candidates, remaining, primary, calendar, today, freeUnits, consume, teamsById);
    return {
      unitId: unit.id,
      raw,
      unassigned: {
        unitId: unit.id,
        orderId: unit.orderId,
        remaining,
        reason: "overload",
        note: arrivalLimited ? "部分受实际可检数量限制" : undefined,
        projectedDelayDays: delayDays
      },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "overload" }
    };
  }

  const riskLevel = evaluateRisk(projectedDate, meta);
  const bufferDays = projectedDate && primary ? diffCalendarDays(projectedDate, primary) : null;
  return {
    unitId: unit.id,
    raw,
    unassigned: null,
    projected: { projectedDate, bufferDays, riskLevel }
  };
}

function allocateDay(
  unit: ScheduleUnit,
  date: string,
  candidates: Team[],
  remaining: number,
  raw: RawAssignment[],
  reasonCodes: string[],
  freeUnits: (date: string, team: Team, type: InspectionType) => number,
  consume: (date: string, teamId: string | null, units: number) => void,
  calendar: Record<string, CalendarDay>,
  today: string
): number {
  if (!isWorkDay(date, calendar)) return remaining;

  for (const team of candidates) {
    if (remaining <= 0) break;
    const free = freeUnits(date, team, unit.inspectionType);
    if (free <= EPSILON) continue;
    const freePairs = Math.floor(pairsFromUnits(free, unit.styleFactor, team, unit.inspectionType));
    if (freePairs <= 0) continue;

    const quantity = Math.min(remaining, freePairs);
    const consumed = taskConsumptionUnits(quantity, unit.styleFactor, team, unit.inspectionType);
    consume(date, team.id, consumed);

    const codes = [...reasonCodes];
    if (date === (unit.preferredDeadline ?? unit.hardDeadline)) {
      codes.push("deadline_driven");
    } else if (date === (unit.earliestDate ?? today)) {
      codes.push("earliest_start");
    } else {
      codes.push("capacity_split");
    }
    if (unit.assignedTeamId && team.id !== unit.assignedTeamId) codes.push("overflow_team");

    raw.push({ unit, scheduledDate: date, teamId: team.id, plannedQuantity: quantity, reasonCodes: codes });
    remaining -= quantity;
  }

  return remaining;
}

function eligibleTeams(unit: ScheduleUnit, teamsById: Map<string, Team>): Team[] {
  const supports = (team: Team) => team.enabled && team.inspectionTypes.includes(unit.inspectionType);
  const byPreference = (a: Team, b: Team) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.standardDailyCapacity - a.standardDailyCapacity;

  const all = Array.from(teamsById.values()).filter(supports).sort(byPreference);
  if (!unit.assignedTeamId) return all;

  const assigned = all.find((team) => team.id === unit.assignedTeamId);
  const rest = all.filter((team) => team.id !== unit.assignedTeamId);
  return assigned ? [assigned, ...rest] : rest;
}

function estimateDelayDays(
  unit: ScheduleUnit,
  candidates: Team[],
  remaining: number,
  primary: string,
  calendar: Record<string, CalendarDay>,
  today: string,
  freeUnits: (date: string, team: Team, type: InspectionType) => number,
  consume: (date: string, teamId: string | null, units: number) => void,
  teamsById: Map<string, Team>
): number {
  let date = addDays(primary, 1);
  let workdays = 0;
  let left = remaining;
  while (left > 0 && workdays < 60) {
    if (!isWorkDay(date, calendar)) {
      date = addDays(date, 1);
      continue;
    }
    workdays += 1;
    for (const team of candidates) {
      if (left <= 0) break;
      const free = freeUnits(date, team, unit.inspectionType);
      if (free <= EPSILON) continue;
      const freePairs = Math.floor(pairsFromUnits(free, unit.styleFactor, team, unit.inspectionType));
      const quantity = Math.min(left, Math.max(0, freePairs));
      left -= quantity;
      consume(date, team.id, taskConsumptionUnits(quantity, unit.styleFactor, team, unit.inspectionType));
    }
    date = addDays(date, 1);
  }
  return workdays;
}

function evaluateRisk(projectedDate: string | null, meta: UnitMeta): RiskLevel {
  if (!projectedDate) return "overload";
  const { targetDate, latestAcceptable, primary } = meta;
  if (targetDate && projectedDate <= targetDate) return "green";
  if (latestAcceptable && projectedDate <= latestAcceptable) return "yellow";
  if (primary && projectedDate <= primary) return "red";
  return "overload";
}
