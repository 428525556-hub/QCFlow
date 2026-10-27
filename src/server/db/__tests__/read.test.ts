import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { listOrderAttachments } from "../attachments.ts";
import { listInspectionRecords, listReinspections } from "../inspections.ts";
import { findActiveInvite, getUserProfileById, listRegistrationInvites, listUserProfiles } from "../profiles.ts";
import { closePool } from "../pool.ts";
import { normalizeRow } from "../read.ts";
import { listReservationCartonItems, listReservationCartons } from "../reservations.ts";
import {
  listDispatchRecords,
  listShipmentBatches,
  listShipmentCartons,
  listShipmentItems,
  listUnboxingRecords
} from "../shipments.ts";
import {
  listInspectionTeams,
  listProductionCalendar,
  listScheduleChangeLogs,
  listScheduleProgress,
  listScheduleTasks,
  listStyleCategories,
  listTeamWorkExceptions
} from "../schedule.ts";

describe("read.normalizeRow", () => {
  test("Date 转 ISO 字符串，其余类型原样保留", () => {
    const row = {
      at: new Date("2026-10-27T01:02:03.004Z"),
      nil: null,
      count: 3,
      day: "2026-10-27",
      nested: { enabled: true }
    };
    assert.deepEqual(normalizeRow<typeof row>(row), {
      at: "2026-10-27T01:02:03.004Z",
      nil: null,
      count: 3,
      day: "2026-10-27",
      nested: { enabled: true }
    });
  });

  test("orderIds 为空数组时直接返回空，不访问数据库", async () => {
    assert.deepEqual(await listInspectionRecords({ orderIds: [] }), []);
    assert.deepEqual(await listReinspections({ orderIds: [] }), []);
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL);
const unknownId = "00000000-0000-4000-8000-000000000000";

describe("只读仓储（集成，需 DATABASE_URL）", () => {
  after(async () => {
    if (hasDatabase) await closePool();
  });

  test("全部只读查询都能在当前库上执行", { skip: !hasDatabase }, async () => {
    const lists = {
      inspections: await listInspectionRecords({ orderId: unknownId }),
      inspectionsByOrderIds: await listInspectionRecords({ orderIds: [unknownId] }),
      reinspections: await listReinspections({ orderId: unknownId }),
      reinspectionsByOrderIds: await listReinspections({ orderIds: [unknownId] }),
      unboxing: await listUnboxingRecords({ orderId: unknownId }),
      shipmentCartons: await listShipmentCartons(unknownId),
      shipmentItems: await listShipmentItems(unknownId),
      dispatch: await listDispatchRecords(unknownId),
      shipmentBatches: await listShipmentBatches(),
      reservationCartons: await listReservationCartons(unknownId),
      reservationItems: await listReservationCartonItems(unknownId),
      attachments: await listOrderAttachments(unknownId),
      profiles: await listUserProfiles(),
      invites: await listRegistrationInvites(),
      teams: await listInspectionTeams(),
      styles: await listStyleCategories(),
      calendar: await listProductionCalendar("2026-01-01", "2026-12-31"),
      exceptions: await listTeamWorkExceptions("2026-01-01", "2026-12-31"),
      tasks: await listScheduleTasks({ excludeCancelled: true }),
      progress: await listScheduleProgress(unknownId),
      changeLogs: await listScheduleChangeLogs(unknownId)
    };

    for (const [name, rows] of Object.entries(lists)) {
      assert.ok(Array.isArray(rows), `${name} 应返回数组`);
    }

    assert.equal(await getUserProfileById(unknownId), null);
    assert.equal(await findActiveInvite("not-a-real-code-hash", new Date().toISOString()), null);
  });
});
