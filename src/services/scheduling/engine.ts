import { addDays, diffCalendarDays, isWorkDay } from "./calendar.ts";
import { pairsFromUnits, taskConsumptionUnits, teamCapacityUnits, typeFactor } from "./capacity.ts";
import { buildTaskExplanation } from "./explain.ts";
import type {
  Assignment,
  CalendarDay,
  DailyLoad,
  InspectionType,
  Priority,
  ProjectedCompletion,
  RiskLevel,
  ScheduleRunInput,
  ScheduleRunResult,
  ScheduleUnit,
  Team,
  UnassignedUnit,
  Warning
} from "./types.ts";

const DEFAULT_HORIZON_DAYS = 120;
const EPSILON = 0.000001;

interface RawAssignment {
  unit: ScheduleUnit;
  scheduledDate: string;
  teamId: string;
  plannedQuantity: number;
  reasonCodes: string[];
}

interface UnitResult {
  unitId: string;
  raw: RawAssignment[];
  unassigned: UnassignedUnit | null;
  projected: ProjectedCompletion;
}

function priorityRank(priority: Priority): number {
  return priority === "特急" ? 0 : priority === "加急" ? 1 : 2;
}

function compareUnits(today: string) {
  return (a: ScheduleUnit, b: ScheduleUnit): number => {
    const aHardLate = a.hardDeadline && a.hardDeadline < today ? 1 : 0;
    const bHardLate = b.hardDeadline && b.hardDeadline < today ? 1 : 0;
    if (aHardLate !== bHardLate) return bHardLate - aHardLate;

    const aPrefLate = a.preferredDeadline && a.preferredDeadline < today ? 1 : 0;
    const bPrefLate = b.preferredDeadline && b.preferredDeadline < today ? 1 : 0;
    if (aPrefLate !== bPrefLate) return bPrefLate - aPrefLate;

    const aPreferred = a.preferredDeadline ?? "9999-12-31";
    const bPreferred = b.preferredDeadline ?? "9999-12-31";
    if (aPreferred !== bPreferred) return aPreferred < bPreferred ? -1 : 1;

    const aRank = priorityRank(a.priority);
    const bRank = priorityRank(b.priority);
    if (aRank !== bRank) return aRank - bRank;

    const aEarliest = a.earliestDate ?? "0000-01-01";
    const bEarliest = b.earliestDate ?? "0000-01-01";
    if (aEarliest !== bEarliest) return aEarliest < bEarliest ? -1 : 1;

    return b.quantity - a.quantity;
  };
}

function eligibleTeams(unit: ScheduleUnit, teamsById: Map<string, Team>): Team[] {
  const supports = (team: Team) => team.enabled && team.inspectionTypes.includes(unit.inspectionType);
  const byPreference = (a: Team, b: Team) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.standardDailyCapacity - a.standardDailyCapacity;

  const all = Array.from(teamsById.values()).filter(supports).sort(byPreference);
  if (!unit.assignedTeamId) return all;

  const assigned = all.find((team) => team.id === unit.assignedTeamId);
  const rest = all.filter((team) => team.id !== unit.assignedTeamId);
  return assigned ? [assigned, ...rest] : rest;
}

export function runSchedule(input: ScheduleRunInput): ScheduleRunResult {
  const { units, teams, calendar, existingAssignments, today } = input;
  const horizonDays = Math.max(7, input.horizonDays ?? DEFAULT_HORIZON_DAYS);
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

  // 已有任务（含锁定任务）占用产能
  for (const assignment of existingAssignments) {
    if (!assignment.teamId) continue;
    const team = teamsById.get(assignment.teamId);
    if (!team) continue;
    const units = taskConsumptionUnits(assignment.plannedQuantity, assignment.styleFactor ?? 1, team, assignment.type);
    consume(assignment.date, assignment.teamId, units);
  }

  const sortedUnits = [...units].sort(compareUnits(today));
  const unitResults: UnitResult[] = [];

  for (const unit of sortedUnits) {
    unitResults.push(scheduleUnit(unit, { teamsById, freeUnits, consume, calendar, today }));
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
      const explanation = buildTaskExplanation({
        unit: raw.unit,
        team,
        reasonCodes: raw.reasonCodes,
        projectedDate: result.projected.projectedDate,
        riskLevel: result.projected.riskLevel,
        today,
        calendar,
        capacityUnits
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
        level: "red",
        unitId: result.unassigned.unitId,
        message: result.unassigned.reason === "config_conflict"
          ? "配置冲突：预计可检日期晚于最终出货日期，需人工处理。"
          : result.unassigned.reason === "missing_deadline"
            ? "缺少 Deadline（送货/出货日期均未设置），无法排程。"
            : result.unassigned.reason === "paused"
              ? "该明细已暂停送检，未排程。"
              : `当前产能不足，剩余 ${result.unassigned.remaining} 双无法在最终出货日期前完成，预计延期 ${result.unassigned.projectedDelayDays} 个工作日。`
      });
    } else if (result.projected.riskLevel === "orange" && result.projected.projectedDate) {
      warnings.push({
        level: "orange",
        unitId: result.raw[0]?.unit.id,
        message: `无法满足预约送货日期，距离最终出货还有 ${result.projected.bufferDays ?? 0} 天缓冲。`
      });
    } else if (result.projected.riskLevel === "red" && result.projected.projectedDate) {
      warnings.push({
        level: "red",
        unitId: result.raw[0]?.unit.id,
        message: `预计完成日期超过最终出货日期 ${Math.abs(result.projected.bufferDays ?? 0)} 天。`
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
  unit: ScheduleUnit,
  ctx: {
    teamsById: Map<string, Team>;
    freeUnits: (date: string, team: Team, type: InspectionType) => number;
    consume: (date: string, teamId: string | null, units: number) => void;
    calendar: Record<string, CalendarDay>;
    today: string;
  }
): UnitResult {
  const { teamsById, freeUnits, consume, calendar, today } = ctx;
  const raw: RawAssignment[] = [];

  const remainingToInspect = unit.quantity - unit.inspectedCompleted;
  const cap = Math.max(0, unit.submittedQuantity - unit.inspectedCompleted - unit.alreadyScheduled);
  let toSchedule = Math.min(remainingToInspect, cap);
  if (toSchedule <= 0) {
    return { unitId: unit.id, raw, unassigned: null, projected: { projectedDate: null, bufferDays: null, riskLevel: "green" } };
  }

  if (unit.submitStatus === "paused") {
    return {
      unitId: unit.id,
      raw,
      unassigned: { unitId: unit.id, orderId: unit.orderId, remaining: toSchedule, reason: "paused", projectedDelayDays: 0 },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "red" }
    };
  }

  // 配置防护：预约送货日期晚于最终出货日期时，以最终出货日期为准
  const preferred = unit.preferredDeadline && unit.hardDeadline && unit.preferredDeadline > unit.hardDeadline ? unit.hardDeadline : unit.preferredDeadline;
  const hard = unit.hardDeadline ?? preferred;
  if (!preferred && !hard) {
    return {
      unitId: unit.id,
      raw,
      unassigned: { unitId: unit.id, orderId: unit.orderId, remaining: toSchedule, reason: "missing_deadline", projectedDelayDays: 0 },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "red" }
    };
  }
  const deadline = (hard ?? preferred)!;

  const earliest = unit.earliestDate ?? today;
  if (earliest > deadline) {
    return {
      unitId: unit.id,
      raw,
      unassigned: { unitId: unit.id, orderId: unit.orderId, remaining: toSchedule, reason: "config_conflict", projectedDelayDays: 0 },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "red" }
    };
  }

  const candidates = eligibleTeams(unit, teamsById);
  const arrivalLimited = cap < remainingToInspect;
  const reasonCodes: string[] = arrivalLimited ? ["arrival_limited"] : [];
  let remaining = toSchedule;
  let lastDate: string | null = null;

  // Phase A：从预约送货日期向前倒排
  const startBackward = preferred ?? deadline;
  if (startBackward >= earliest) {
    let date = startBackward;
    while (date >= earliest && remaining > 0) {
      remaining = allocateDay(unit, date, candidates, remaining, raw, reasonCodes, freeUnits, consume, ctx.calendar, today);
      date = addDays(date, -1);
    }
    // 倒排是"越往前越晚入队"，首个元素即最晚（最接近 Deadline）的日期
    lastDate = raw.length > 0 ? raw[0].scheduledDate : null;
  }

  // Phase B：送货日期前排不完，向最终出货日期方向延伸
  if (remaining > 0 && preferred && deadline > preferred) {
    reasonCodes.push("preferred_missed");
    let date = addDays(preferred, 1);
    while (date <= deadline && remaining > 0) {
      remaining = allocateDay(unit, date, candidates, remaining, raw, reasonCodes, freeUnits, consume, ctx.calendar, today);
      date = addDays(date, 1);
    }
    lastDate = raw.length > 0 ? raw[raw.length - 1].scheduledDate : lastDate;
  }

  let projectedDate = lastDate;
  let delayDays = 0;

  if (remaining > 0) {
    projectedDate = null;
    delayDays = estimateDelayDays(unit, candidates, remaining, deadline, calendar, today, freeUnits, consume, teamsById);
    return {
      unitId: unit.id,
      raw,
      unassigned: {
        unitId: unit.id,
        orderId: unit.orderId,
        remaining,
        reason: "capacity",
        note: arrivalLimited ? "部分受实际可检数量限制" : undefined,
        projectedDelayDays: delayDays
      },
      projected: { projectedDate: null, bufferDays: null, riskLevel: "red" }
    };
  }

  const riskLevel = evaluateRisk(projectedDate, preferred, deadline);
  const bufferDays = projectedDate ? diffCalendarDays(projectedDate, deadline) : null;
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
    if (date === unit.preferredDeadline || date === (unit.hardDeadline ?? unit.preferredDeadline)) {
      codes.push("deadline_driven");
    } else {
      codes.push("capacity_split");
    }
    if (unit.assignedTeamId && team.id !== unit.assignedTeamId) codes.push("overflow_team");
    if (date === (unit.earliestDate ?? today) && remaining - quantity > 0) codes.push("earliest_start");

    raw.push({ unit, scheduledDate: date, teamId: team.id, plannedQuantity: quantity, reasonCodes: codes });
    remaining -= quantity;
  }

  return remaining;
}

function estimateDelayDays(
  unit: ScheduleUnit,
  candidates: Team[],
  remaining: number,
  hard: string,
  calendar: Record<string, CalendarDay>,
  today: string,
  freeUnits: (date: string, team: Team, type: InspectionType) => number,
  consume: (date: string, teamId: string | null, units: number) => void,
  teamsById: Map<string, Team>
): number {
  let date = addDays(hard, 1);
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

function evaluateRisk(projectedDate: string | null, preferred: string | null, hard: string | null): RiskLevel {
  if (!projectedDate) return "red";
  if (hard && projectedDate > hard) return "red";
  if (preferred && projectedDate > preferred) return "orange";
  return "green";
}

export function calculateUtilizationPercent(utilization: number): number {
  if (!Number.isFinite(utilization)) return 100;
  return Math.round(utilization * 1000) / 10;
}

export function consumptionUnitsOf(quantity: number, styleFactor: number, team: Team, type: InspectionType): number {
  return taskConsumptionUnits(quantity, styleFactor, team, type);
}

export function capacityFactorOf(team: Team, type: InspectionType): number {
  return typeFactor(team, type);
}
