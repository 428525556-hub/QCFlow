import type { CalendarDay, Team } from "./types.ts";

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function diffCalendarDays(from: string, to: string): number {
  const start = parseDateKey(from).getTime();
  const end = parseDateKey(to).getTime();
  return Math.round((end - start) / 86400000);
}

function defaultWorkDay(dateKey: string): boolean {
  const day = parseDateKey(dateKey).getDay();
  return day !== 0 && day !== 6;
}

export function isWorkDay(dateKey: string, calendar: Record<string, CalendarDay>): boolean {
  const entry = calendar[dateKey];
  if (entry) return entry.isWorkDay;
  return defaultWorkDay(dateKey);
}

export function workHoursForTeam(dateKey: string, team: Team, calendar: Record<string, CalendarDay>): number {
  const entry = calendar[dateKey];
  if (entry) {
    if (!entry.isWorkDay) return 0;
    const teamException = entry.teamExceptions?.[team.id];
    if (teamException && !teamException.isWorking) return 0;
    if (teamException?.workHours != null) return teamException.workHours;
    return entry.workHours ?? team.dailyHours;
  }
  if (!defaultWorkDay(dateKey)) return 0;
  return team.dailyHours;
}

export function exceptionFactorForTeam(dateKey: string, teamId: string, calendar: Record<string, CalendarDay>): number {
  return calendar[dateKey]?.teamExceptions?.[teamId]?.factor ?? 1;
}

export function businessDaysBetween(fromKey: string, toKey: string, calendar: Record<string, CalendarDay>): number {
  if (fromKey > toKey) return 0;
  let count = 0;
  let current = fromKey;
  while (current <= toKey) {
    if (isWorkDay(current, calendar)) count += 1;
    current = addDays(current, 1);
  }
  return count;
}
