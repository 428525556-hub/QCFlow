import { apiRequest } from "@/src/api/httpClient";
import type { ShipmentBatch } from "@/lib/types";

export type ShipmentBatchInput = {
  customer_name: string;
  shipping_date: string;
  batch_no?: string | null;
  remark?: string | null;
};

export function getShipmentBatches() {
  return apiRequest<ShipmentBatch[]>("/api/shipment-batches");
}

export function upsertShipmentBatch(payload: ShipmentBatchInput) {
  return apiRequest<ShipmentBatch>("/api/shipment-batches", { method: "POST", body: JSON.stringify(payload) });
}
