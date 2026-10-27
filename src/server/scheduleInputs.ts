import { listInspectionRecords, listReinspections } from "@/src/server/db/inspections";
import { listOrderItems, listOrders } from "@/src/server/db/orders";
import {
  listInspectionTeams,
  listProductionCalendar,
  listScheduleTasks,
  listTeamWorkExceptions
} from "@/src/server/db/schedule";
import { addDays } from "@/src/services/scheduling";
import {
  buildScheduleInputs,
  previewUrgentInsertFromInputs,
  todayKey,
  type ScheduleLoadResult,
  type UrgentInsertInput,
  type UrgentInsertPreview
} from "@/src/services/scheduleService";

export async function loadScheduleInputsPg(
  options?: { date?: string; replaceAuto?: boolean }
): Promise<ScheduleLoadResult> {
  const today = options?.date ?? todayKey();
  const horizonEnd = addDays(today, 180);

  const [teams, calendar, exceptions, orders, items, records, reinspections, tasks] = await Promise.all([
    listInspectionTeams(),
    listProductionCalendar({ from: today, to: horizonEnd }),
    listTeamWorkExceptions({ from: today, to: horizonEnd }),
    listOrders(),
    listOrderItems(),
    listInspectionRecords(),
    listReinspections(),
    listScheduleTasks({ excludeCancelled: true })
  ]);

  return buildScheduleInputs({ teams, calendar, exceptions, orders, items, records, reinspections, tasks }, options);
}

export async function previewUrgentInsertPg(body: UrgentInsertInput): Promise<UrgentInsertPreview | null> {
  const inputs = await loadScheduleInputsPg();
  return previewUrgentInsertFromInputs(inputs, body, (orderItemIds) =>
    listScheduleTasks({ orderItemIds, excludeCancelled: true })
  );
}
