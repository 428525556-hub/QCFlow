import { businessDaysBetween, diffCalendarDays } from "./calendar.ts";
import type { CalendarDay, RiskLevel, ScheduleUnit, TaskExplanation, Team } from "./types.ts";

export function buildTaskExplanation(input: {
  unit: ScheduleUnit;
  team: Team;
  reasonCodes: string[];
  projectedDate: string | null;
  riskLevel: RiskLevel;
  today: string;
  calendar: Record<string, CalendarDay>;
  capacityUnits: number;
}): TaskExplanation {
  const { unit, team, reasonCodes, projectedDate, riskLevel, today, calendar, capacityUnits } = input;
  const hard = unit.hardDeadline ?? unit.preferredDeadline;

  return {
    deadlineChain: {
      earliest: unit.earliestDate,
      preferred: unit.preferredDeadline,
      hard
    },
    remainingQty: Math.max(0, unit.quantity - unit.inspectedCompleted),
    workdaysRemaining: projectedDate ? businessDaysBetween(today, projectedDate, calendar) : null,
    teamDailyCapacity: Math.round(capacityUnits * 100) / 100,
    priority: unit.priority,
    submittedQuantity: unit.submittedQuantity,
    reasonCodes: Array.from(new Set(reasonCodes)),
    bufferDays: projectedDate && hard ? diffCalendarDays(projectedDate, hard) : null,
    projectedDate,
    riskLevel
  };
}
