import assert from "node:assert/strict";
import { test } from "node:test";

import type { Order, ShipmentBatch } from "@/lib/types";
import { buildBatchMap, buildShipmentBatchGroups } from "../orderService.ts";

function makeOrder(id: string, customerName: string, shippingDate: string | null, quantity: number): Order {
  return {
    id,
    created_at: "2026-08-01T00:00:00Z",
    deleted_at: null,
    user_id: "u1",
    order_type: "reservation",
    customer_name: customerName,
    factory_name: "顺欣",
    po_number: `PO-${id}`,
    sku: `SKU-${id}`,
    inbound_date: null,
    shipping_date: shippingDate,
    shipping_date_tbd: false,
    inspection_plan: "both",
    reservation_remark: null,
    color: "白",
    size: "36",
    quantity,
    inbound_quantity: 0,
    delivery_date: null,
    estimated_inspection_date: null,
    inspection_standard: null,
    priority: "普通",
    assigned_team_id: null,
    direct_ship: false,
    status: "未开始"
  };
}

test("按客户+出货日期分组：同批订单合并，编号/备注正确挂载", () => {
  const orders = [
    makeOrder("a", "迪海", "2026-09-15", 5000),
    makeOrder("b", "迪海", "2026-09-15", 3000),
    makeOrder("c", "迪海", "2026-09-20", 2000),
    makeOrder("d", "文君", "2026-09-15", 410),
    makeOrder("e", "迪海", null, 100)
  ];
  const batches: ShipmentBatch[] = [
    {
      id: "b1",
      created_at: "",
      updated_at: "",
      customer_name: "迪海",
      shipping_date: "2026-09-15",
      batch_no: "CVT260925",
      remark: "迪海9月15号出货"
    }
  ];

  const groups = buildShipmentBatchGroups(orders, buildBatchMap(batches));

  const dihai915 = groups.find((group) => group.customerName === "迪海" && group.shippingDate === "2026-09-15");
  assert.equal(dihai915?.orders.length, 2);
  assert.equal(dihai915?.totalQuantity, 8000);
  assert.equal(dihai915?.batchNo, "CVT260925");
  assert.equal(dihai915?.batchRemark, "迪海9月15号出货");

  const wenjun915 = groups.find((group) => group.customerName === "文君" && group.shippingDate === "2026-09-15");
  assert.equal(wenjun915?.batchNo, null);
  assert.equal(wenjun915?.totalQuantity, 410);

  const noDate = groups.find((group) => group.customerName === "迪海" && group.shippingDate === null);
  assert.equal(noDate?.orders.length, 1);
  assert.equal(noDate?.batchNo, null);
});

test("出货日期待定订单单独归为「待定」，不与未设置混在一起", () => {
  const tbdOrder = { ...makeOrder("t1", "迪海", null, 100), shipping_date_tbd: true };
  const noDateOrder = makeOrder("n1", "迪海", null, 50);
  const groups = buildShipmentBatchGroups([tbdOrder, noDateOrder], buildBatchMap([]));

  const tbd = groups.find((group) => group.shippingDate === null && group.shippingDateTbd);
  const none = groups.find((group) => group.shippingDate === null && !group.shippingDateTbd);
  assert.equal(tbd?.orders.length, 1);
  assert.equal(tbd?.orders[0].id, "t1");
  assert.equal(none?.orders.length, 1);
  assert.equal(none?.orders[0].id, "n1");
});
