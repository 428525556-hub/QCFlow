import { exceptionFactorForTeam, workHoursForTeam } from "./calendar.ts";
import type { CalendarDay, InspectionType, Team } from "./types.ts";

export function typeFactor(team: Team, type: InspectionType): number {
  const factor = team.capacityFactors?.[type];
  return factor && factor > 0 ? factor : 1;
}

export function teamCapacityUnits(team: Team, dateKey: string, calendar: Record<string, CalendarDay>): number {
  const hours = workHoursForTeam(dateKey, team, calendar);
  if (hours <= 0) return 0;

  const membersFactor = team.baselineMembers > 0 ? team.currentMembers / team.baselineMembers : 0;
  const exceptionFactor = exceptionFactorForTeam(dateKey, team.id, calendar);
  const computed = team.standardDailyCapacity * membersFactor * (hours / 8) * exceptionFactor;
  const cap = team.maxDailyCapacity * (hours / 8);
  return Math.max(0, Math.min(computed, cap));
}

export function taskConsumptionUnits(quantity: number, styleFactor: number, team: Team, type: InspectionType): number {
  return (quantity * styleFactor) / typeFactor(team, type);
}

export function pairsFromUnits(units: number, styleFactor: number, team: Team, type: InspectionType): number {
  return (units * typeFactor(team, type)) / styleFactor;
}
