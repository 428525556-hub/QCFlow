import type { DispatchRecord, ShipmentBatch, ShipmentCarton, ShipmentItem, UnboxingRecord } from "@/lib/types";
import type { PoolClient, QueryResultRow } from "pg";

import { TABLE_COLUMNS } from "./columns.ts";
import { queryRows } from "./query.ts";
import { normalizeRow } from "./read.ts";
import { selectAll } from "./read.ts";

export async function listUnboxingRecords(filters: { orderId?: string | null; limit?: number } = {}): Promise<
  UnboxingRecord[]
> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }

  return selectAll<UnboxingRecord>("unboxing_records", {
    conditions,
    values,
    orderBy: "created_at desc",
    limit: filters.limit
  });
}

export async function listShipmentCartons(orderId?: string | null): Promise<ShipmentCarton[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (orderId) {
    values.push(orderId);
    conditions.push(`order_id = $${values.length}`);
  }

  return selectAll<ShipmentCarton>("shipment_cartons", {
    conditions,
    values,
    orderBy: "created_at desc"
  });
}

export async function listShipmentItems(orderId?: string | null): Promise<ShipmentItem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (orderId) {
    values.push(orderId);
    conditions.push(`order_id = $${values.length}`);
  }

  return selectAll<ShipmentItem>("shipment_items", { conditions, values });
}

export async function listDispatchRecords(orderId?: string | null): Promise<DispatchRecord[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (orderId) {
    values.push(orderId);
    conditions.push(`order_id = $${values.length}`);
  }

  return selectAll<DispatchRecord>("dispatch_records", {
    conditions,
    values,
    orderBy: "created_at desc"
  });
}

export async function listShipmentBatches(): Promise<ShipmentBatch[]> {
  return selectAll<ShipmentBatch>("shipment_batches", { orderBy: "shipping_date asc" });
}

/** 按（客户 + 出货日期）插入或更新出货批次 */
export async function upsertShipmentBatch(
  input: { customerName: string; shippingDate: string; batchNo: string | null; remark: string | null },
  client?: PoolClient
): Promise<ShipmentBatch> {
  const sql = `insert into public.shipment_batches (customer_name, shipping_date, batch_no, remark)
    values ($1, $2, $3, $4)
    on conflict (customer_name, shipping_date)
    do update set batch_no = excluded.batch_no, remark = excluded.remark
    returning ${TABLE_COLUMNS.shipment_batches}`;
  const values = [input.customerName, input.shippingDate, input.batchNo, input.remark];
  const rows = client
    ? (await client.query<QueryResultRow>(sql, values)).rows
    : await queryRows<QueryResultRow>(sql, values);
  if (rows.length === 0) throw new Error("shipment_batches upsert 未返回数据");
  return normalizeRow<ShipmentBatch>(rows[0]);
}
