import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { TABLE_COLUMNS } from "../columns.ts";
import { insertOrderWithItems } from "../orders.ts";
import { closePool, getPool } from "../pool.ts";
import { withTransaction } from "../query.ts";
import { upsertShipmentBatch } from "../shipments.ts";
import { deleteRowsByIds, insertRows, updateRowById, updateRowsWhere } from "../write.ts";

describe("write.insertRows", () => {
  test("拒绝白名单外的字段（不访问数据库）", async () => {
    await assert.rejects(() => insertRows("order_items", [{ evil_column: 1 }]), /不允许的字段/);
  });
});

describe("write.updateRowById", () => {
  test("拒绝更新 id / created_at（不访问数据库）", async () => {
    await assert.rejects(
      () => updateRowById("orders", "00000000-0000-4000-8000-000000000000", { id: "x" }),
      /不可更新/
    );
    await assert.rejects(
      () => updateRowById("orders", "00000000-0000-4000-8000-000000000000", { created_at: new Date() }),
      /不可更新/
    );
  });
});

const hasDatabase = Boolean(process.env.DATABASE_URL);
const userId = "aaaaaaaa-0000-4000-8000-000000000001";

class RollbackSignal extends Error {}

describe("订单事务（集成，需 DATABASE_URL）", () => {
  after(async () => {
    if (hasDatabase) await closePool();
  });

  test("create_order_with_items 原子写入订单与明细，回滚后不残留", { skip: !hasDatabase }, async () => {
    let createdId = "";

    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        createdId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "事务测试客户",
            factory_name: "事务测试工厂",
            po_number: "PO-TX-0001",
            sku: "SKU-TX-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-10-30",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 100,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-TX-0001",
              sku: "SKU-TX-0001",
              color: "黑",
              size: "42",
              carton_count: 2,
              quantity_per_carton: 50,
              quantity: 100,
              inbound_quantity: 0
            }
          ]
        });

        const orderCount = await client.query("select count(*)::int as count from public.orders where id = $1", [
          createdId
        ]);
        const itemCount = await client.query(
          "select count(*)::int as count from public.order_items where order_id = $1",
          [createdId]
        );
        assert.equal(orderCount.rows[0].count, 1);
        assert.equal(itemCount.rows[0].count, 1);

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    const remaining = await getPool().query("select count(*)::int as count from public.orders where id = $1", [
      createdId
    ]);
    assert.equal(remaining.rows[0].count, 0);
  });

  test("检品/复检写入与删除（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "检品测试客户",
            factory_name: "检品测试工厂",
            po_number: "PO-INSP-0001",
            sku: "SKU-INSP-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-10-30",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 100,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-INSP-0001",
              sku: "SKU-INSP-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 100,
              quantity: 100,
              inbound_quantity: 0
            }
          ]
        });

        const [inspection] = await insertRows<{ id: string }>(
          "inspection_records",
          [{ order_id: orderId, user_id: userId, defect_type: "测试缺陷", quantity: 3, inspection_stage: "normal" }],
          TABLE_COLUMNS.inspection_records,
          client
        );
        assert.ok(inspection.id);

        const [reinspection] = await insertRows<{ id: string }>(
          "reinspection_records",
          [
            {
              order_id: orderId,
              source_record_id: inspection.id,
              user_id: userId,
              inspection_stage: "normal",
              defect_type: "测试缺陷",
              passed_quantity: 1,
              failed_quantity: 2
            }
          ],
          TABLE_COLUMNS.reinspection_records,
          client
        );
        assert.ok(reinspection.id);

        await deleteRowsByIds("reinspection_records", [reinspection.id], client);
        const deleted = await deleteRowsByIds("inspection_records", [inspection.id], client);
        assert.deepEqual(deleted, [inspection.id]);

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("订单更新与删除（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "更新测试客户",
            factory_name: "更新测试工厂",
            po_number: "PO-UPD-0001",
            sku: "SKU-UPD-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-10-30",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 10,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-UPD-0001",
              sku: "SKU-UPD-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 10,
              quantity: 10,
              inbound_quantity: 0
            }
          ]
        });

        const updated = await updateRowById<{ status: string }>(
          "orders",
          orderId,
          { status: "检品中" },
          TABLE_COLUMNS.orders,
          client
        );
        assert.equal(updated?.status, "检品中");

        const deleted = await deleteRowsByIds("orders", [orderId], client);
        assert.deepEqual(deleted, [orderId]);

        const remaining = await client.query("select count(*)::int as count from public.orders where id = $1", [orderId]);
        assert.equal(remaining.rows[0].count, 0);

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("预约箱号 + 明细写入（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "预约箱测试客户",
            factory_name: "预约箱测试工厂",
            po_number: "PO-RES-0001",
            sku: "SKU-RES-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-11-01",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 10,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-RES-0001",
              sku: "SKU-RES-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 10,
              quantity: 10,
              inbound_quantity: 0
            }
          ]
        });

        const [carton] = await insertRows<{ id: string }>(
          "reservation_cartons",
          [{ order_id: orderId, user_id: userId, carton_no: "NO.001" }],
          TABLE_COLUMNS.reservation_cartons,
          client
        );
        assert.ok(carton.id);

        const [item] = await insertRows<{ id: string }>(
          "reservation_carton_items",
          [
            {
              reservation_carton_id: carton.id,
              order_id: orderId,
              user_id: userId,
              po_number: "PO-RES-0001",
              sku: "SKU-RES-0001",
              color: "黑",
              size: "42",
              quantity: 10
            }
          ],
          TABLE_COLUMNS.reservation_carton_items,
          client
        );
        assert.ok(item.id);

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("出货批次 upsert（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        const first = await upsertShipmentBatch(
          { customerName: "批次测试客户", shippingDate: "2026-11-01", batchNo: "B1", remark: "第一次" },
          client
        );
        const second = await upsertShipmentBatch(
          { customerName: "批次测试客户", shippingDate: "2026-11-01", batchNo: "B2", remark: "第二次" },
          client
        );

        assert.equal(second.id, first.id);
        assert.equal(second.batch_no, "B2");
        assert.equal(second.remark, "第二次");

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("开箱记录写入（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "开箱测试客户",
            factory_name: "开箱测试工厂",
            po_number: "PO-UNBOX-0001",
            sku: "SKU-UNBOX-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-11-01",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 10,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-UNBOX-0001",
              sku: "SKU-UNBOX-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 10,
              quantity: 10,
              inbound_quantity: 0
            }
          ]
        });

        const [record] = await insertRows<{ id: string }>(
          "unboxing_records",
          [
            {
              order_id: orderId,
              user_id: userId,
              carton_no: "NO.001",
              po_number: "PO-UNBOX-0001",
              sku: "SKU-UNBOX-0001",
              color: "黑",
              size: "42",
              quantity: 10,
              shortage_quantity: 0
            }
          ],
          TABLE_COLUMNS.unboxing_records,
          client
        );
        assert.ok(record.id);

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("装箱箱号 + 明细写入（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "装箱测试客户",
            factory_name: "装箱测试工厂",
            po_number: "PO-PACK-0001",
            sku: "SKU-PACK-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-11-01",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 10,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-PACK-0001",
              sku: "SKU-PACK-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 10,
              quantity: 10,
              inbound_quantity: 0
            }
          ]
        });

        const [carton] = await insertRows<{ id: string }>(
          "shipment_cartons",
          [{ order_id: orderId, user_id: userId, carton_no: "BOX-001" }],
          TABLE_COLUMNS.shipment_cartons,
          client
        );
        assert.ok(carton.id);

        const [item] = await insertRows<{ id: string }>(
          "shipment_items",
          [
            {
              carton_id: carton.id,
              order_id: orderId,
              user_id: userId,
              po_number: "PO-PACK-0001",
              sku: "SKU-PACK-0001",
              color: "黑",
              size: "42",
              quantity: 10
            }
          ],
          TABLE_COLUMNS.shipment_items,
          client
        );
        assert.ok(item.id);

        // 同一订单重复箱号应被唯一约束拒绝（23505）
        await assert.rejects(
          () =>
            insertRows(
              "shipment_cartons",
              [{ order_id: orderId, user_id: userId, carton_no: "BOX-001" }],
              TABLE_COLUMNS.shipment_cartons,
              client
            ),
          (error: unknown) => (error as { code?: string }).code === "23505"
        );

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("出货记录写入（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "出货测试客户",
            factory_name: "出货测试工厂",
            po_number: "PO-DISP-0001",
            sku: "SKU-DISP-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-11-01",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 10,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-DISP-0001",
              sku: "SKU-DISP-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 10,
              quantity: 10,
              inbound_quantity: 0
            }
          ]
        });

        const [record] = await insertRows<{ id: string }>(
          "dispatch_records",
          [
            {
              order_id: orderId,
              user_id: userId,
              total_cartons: 1,
              total_quantity: 10,
              expected_quantity: 10,
              is_full_dispatch: true
            }
          ],
          TABLE_COLUMNS.dispatch_records,
          client
        );
        assert.ok(record.id);

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });

  test("明细身份同步更新（事务内，回滚）", { skip: !hasDatabase }, async () => {
    try {
      await withTransaction(async (client) => {
        await client.query(
          "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
          [userId, "parity-test@example.com"]
        );
        await client.query(
          "insert into public.users (id, email) values ($1, $2) on conflict (id) do nothing",
          [userId, "parity-test@example.com"]
        );

        const orderId = await insertOrderWithItems(client, {
          order: {
            order_type: "reservation",
            customer_name: "身份同步测试客户",
            factory_name: "身份同步测试工厂",
            po_number: "PO-SYNC-0001",
            sku: "SKU-SYNC-0001",
            inbound_date: "2026-10-20",
            shipping_date: "2026-11-01",
            inspection_plan: "both",
            reservation_remark: null,
            color: "黑",
            size: "42",
            quantity: 10,
            inbound_quantity: 0,
            status: "未开始"
          },
          items: [
            {
              po_number: "PO-SYNC-0001",
              sku: "SKU-SYNC-0001",
              color: "黑",
              size: "42",
              carton_count: 1,
              quantity_per_carton: 10,
              quantity: 10,
              inbound_quantity: 0
            }
          ]
        });

        await insertRows(
          "unboxing_records",
          [
            {
              order_id: orderId,
              user_id: userId,
              carton_no: "NO.001",
              po_number: "PO-SYNC-0001",
              sku: "SKU-SYNC-0001",
              color: "黑",
              size: "42",
              quantity: 10,
              shortage_quantity: 0
            }
          ],
          TABLE_COLUMNS.unboxing_records,
          client
        );

        const updated = await updateRowsWhere(
          "unboxing_records",
          { color: "白", size: "43" },
          {
            order_id: orderId,
            po_number: "PO-SYNC-0001",
            sku: "SKU-SYNC-0001",
            color: "黑",
            size: "42"
          },
          client
        );
        assert.equal(updated, 1);

        const check = await client.query(
          "select color, size from public.unboxing_records where order_id = $1",
          [orderId]
        );
        assert.equal(check.rows[0].color, "白");
        assert.equal(check.rows[0].size, "43");

        throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
  });
});
