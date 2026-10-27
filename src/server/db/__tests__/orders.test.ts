import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { closePool } from "../pool.ts";
import { getOrderById, listOrderItems, listOrders, mapOrderItemRow, mapOrderRow } from "../orders.ts";

const baseOrderRow = {
  id: "11111111-1111-4111-8111-111111111111",
  created_at: new Date("2026-10-27T01:53:12.509Z"),
  deleted_at: null,
  user_id: "22222222-2222-4222-8222-222222222222",
  order_type: "reservation" as const,
  customer_name: "测试客户",
  factory_name: "测试工厂",
  po_number: "PO-001",
  sku: "SKU-001",
  inbound_date: "2026-10-20",
  shipping_date: null,
  shipping_date_tbd: true,
  inspection_plan: "both" as const,
  reservation_remark: null,
  color: "黑",
  size: "42",
  quantity: 100,
  inbound_quantity: 80,
  delivery_date: null,
  estimated_inspection_date: "2026-10-21",
  inspection_standard: null,
  priority: "普通" as const,
  assigned_team_id: null,
  direct_ship: false,
  status: "未开始" as const,
  updated_at: new Date("2026-10-27T01:53:12.509Z")
};

describe("orders 行映射", () => {
  test("时间戳转 ISO 字符串，日期保持 YYYY-MM-DD", () => {
    const order = mapOrderRow(baseOrderRow);
    assert.equal(order.created_at, "2026-10-27T01:53:12.509Z");
    assert.equal(order.inbound_date, "2026-10-20");
    assert.equal(order.shipping_date, null);
    assert.equal(order.shipping_date_tbd, true);
    assert.equal(order.deleted_at, null);
  });

  test("数量与枚举字段原样保留", () => {
    const order = mapOrderRow(baseOrderRow);
    assert.equal(order.quantity, 100);
    assert.equal(order.inbound_quantity, 80);
    assert.equal(order.inspection_plan, "both");
    assert.equal(order.status, "未开始");
    assert.equal(order.priority, "普通");
  });

  test("明细行映射：数值与可空日期", () => {
    const item = mapOrderItemRow({
      id: "33333333-3333-4333-8333-333333333333",
      created_at: new Date("2026-10-27T02:00:00.000Z"),
      order_id: baseOrderRow.id,
      user_id: baseOrderRow.user_id,
      po_number: "PO-001",
      sku: "SKU-001",
      color: "黑",
      size: "42",
      carton_count: 2,
      quantity_per_carton: 50,
      quantity: 100,
      inbound_quantity: 80,
      estimated_inspection_date: null,
      submitted_quantity: 60,
      submit_status: "ready" as const,
      style_factor: 1.3
    });
    assert.equal(item.created_at, "2026-10-27T02:00:00.000Z");
    assert.equal(item.quantity, 100);
    assert.equal(item.style_factor, 1.3);
    assert.equal(item.submit_status, "ready");
    assert.equal(item.estimated_inspection_date, null);
  });
});

// 没有 DATABASE_URL 时跳过集成测试；设置后会对真实库执行只读查询
const hasDatabase = Boolean(process.env.DATABASE_URL);

describe("orders 仓储（集成，需 DATABASE_URL）", () => {
  after(async () => {
    if (hasDatabase) await closePool();
  });

  test("listOrders 返回数组", { skip: !hasDatabase }, async () => {
    const orders = await listOrders();
    assert.ok(Array.isArray(orders));
  });

  test("不存在的订单返回 null", { skip: !hasDatabase }, async () => {
    const order = await getOrderById("00000000-0000-4000-8000-000000000000");
    assert.equal(order, null);
  });

  test("不存在的订单明细返回空数组", { skip: !hasDatabase }, async () => {
    const items = await listOrderItems({ orderId: "00000000-0000-4000-8000-000000000000" });
    assert.deepEqual(items, []);
  });
});
