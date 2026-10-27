import type { DispatchRecord, ShipmentBatch, ShipmentCarton, ShipmentItem, UnboxingRecord } from "@/lib/types";

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
