import assert from "node:assert/strict";
import { after, describe, test } from "node:test";

import { TABLE_COLUMNS } from "../columns.ts";
import { insertOrderWithItems } from "../orders.ts";
import { closePool, getPool } from "../pool.ts";
import { withTransaction } from "../query.ts";
import { deleteRowsByIds, insertRows } from "../write.ts";

describe("write.insertRows", () => {
  test("拒绝白名单外的字段（不访问数据库）", async () => {
    await assert.rejects(() => insertRows("order_items", [{ evil_column: 1 }]), /不允许的字段/);
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
});
