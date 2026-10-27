import { apiRequest } from "@/src/api/httpClient";
import { getOrderById, getOrderItems } from "@/src/api/ordersApi";
import { getShipmentCartons, getShipmentItems } from "@/src/api/shipmentApi";
import type { DispatchRecord } from "@/lib/types";
import type { Database } from "@/src/types";

type DispatchRecordInsert = Database["public"]["Tables"]["dispatch_records"]["Insert"];

export async function getDispatchRecords(orderId?: string) {
  const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  return apiRequest<DispatchRecord[]>(`/api/dispatch-records${query}`);
}

export async function getAllDispatchRecords() {
  return apiRequest<DispatchRecord[]>("/api/dispatch-records");
}

export async function getDispatchOrderData(orderId: string) {
  const [orderResult, itemsResult, cartonsResult, shipmentItemsResult, recordsResult] = await Promise.all([
    getOrderById(orderId),
    getOrderItems(orderId),
    getShipmentCartons(orderId),
    getShipmentItems(orderId),
    getDispatchRecords(orderId)
  ]);

  return {
    data: {
      order: orderResult.data,
      items: itemsResult.data ?? [],
      cartons: cartonsResult.data ?? [],
      shipmentItems: shipmentItemsResult.data ?? [],
      records: recordsResult.data ?? []
    },
    error: orderResult.error ?? itemsResult.error ?? cartonsResult.error ?? shipmentItemsResult.error ?? recordsResult.error
  };
}

export async function insertDispatchRecord(record: DispatchRecordInsert) {
  return apiRequest<DispatchRecord>("/api/dispatch-records", {
    method: "POST",
    body: JSON.stringify({ record })
  });
}
