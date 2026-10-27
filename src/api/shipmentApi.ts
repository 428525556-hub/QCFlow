import { supabase } from "@/src/api/client";
import { apiRequest } from "@/src/api/httpClient";
import { storage } from "@/src/server/storage";
import { STORAGE_BUCKETS } from "@/src/constants";
import { getOrderById, getOrderItems } from "@/src/api/ordersApi";
import type { ShipmentCarton, ShipmentItem, UnboxingRecord } from "@/lib/types";
import type { Database, ReservationCarton, ReservationCartonItem } from "@/src/types";

type ShipmentCartonInsert = Database["public"]["Tables"]["shipment_cartons"]["Insert"];
type ShipmentItemInsert = Database["public"]["Tables"]["shipment_items"]["Insert"];
type UnboxingRecordInsert = Database["public"]["Tables"]["unboxing_records"]["Insert"];
type ReservationCartonInsert = Database["public"]["Tables"]["reservation_cartons"]["Insert"];
type ReservationCartonItemInsert = Database["public"]["Tables"]["reservation_carton_items"]["Insert"];

export async function getShipmentCartons(orderId: string) {
  return apiRequest<ShipmentCarton[]>(`/api/shipment-cartons?orderId=${encodeURIComponent(orderId)}`);
}

export async function getShipmentItems(orderId: string) {
  return apiRequest<ShipmentItem[]>(`/api/shipment-items?orderId=${encodeURIComponent(orderId)}`);
}

export async function getShipmentOrderData(orderId: string) {
  const [orderResult, itemsResult, cartonsResult, shipmentItemsResult, unboxingResult] = await Promise.all([
    getOrderById(orderId),
    getOrderItems(orderId),
    getShipmentCartons(orderId),
    getShipmentItems(orderId),
    getUnboxingRecords(orderId)
  ]);

  return {
    data: {
      order: orderResult.data,
      items: itemsResult.data ?? [],
      cartons: cartonsResult.data ?? [],
      shipmentItems: shipmentItemsResult.data ?? [],
      unboxingRecords: unboxingResult.data ?? []
    },
    error: orderResult.error ?? itemsResult.error ?? cartonsResult.error ?? shipmentItemsResult.error ?? unboxingResult.error
  };
}

export async function getAllShipmentCartons() {
  return apiRequest<ShipmentCarton[]>("/api/shipment-cartons");
}

export async function getAllShipmentItems() {
  return apiRequest<ShipmentItem[]>("/api/shipment-items");
}

export async function insertShipmentCarton(carton: ShipmentCartonInsert) {
  return apiRequest<ShipmentCarton>("/api/shipment-cartons", {
    method: "POST",
    body: JSON.stringify({ carton })
  });
}

export async function deleteShipmentCarton(cartonId: string) {
  return apiRequest<{ id: string }>(`/api/shipment-cartons?id=${encodeURIComponent(cartonId)}`, {
    method: "DELETE"
  });
}

export async function insertShipmentItems(items: ShipmentItemInsert[]) {
  return apiRequest<ShipmentItem[]>("/api/shipment-items", {
    method: "POST",
    body: JSON.stringify({ items })
  });
}

export async function getUnboxingRecords(orderId?: string) {
  const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  return apiRequest<UnboxingRecord[]>(`/api/unboxing${query}`);
}

export async function getReservationCartonPlan(orderId: string) {
  return apiRequest<{ cartons: ReservationCarton[]; items: ReservationCartonItem[] }>(`/api/reservation-cartons?orderId=${encodeURIComponent(orderId)}`);
}

export async function insertReservationCartonPlan(cartons: ReservationCartonInsert[], items: ReservationCartonItemInsert[]) {
  return apiRequest<{ cartons: ReservationCarton[]; items: ReservationCartonItem[] }>("/api/reservation-cartons", {
    method: "POST",
    body: JSON.stringify({ cartons, items })
  });
}

export async function getRecentUnboxingRecords(limit = 30) {
  return apiRequest<UnboxingRecord[]>(`/api/unboxing?limit=${encodeURIComponent(String(limit))}`);
}

export async function insertUnboxingRecord(record: UnboxingRecordInsert) {
  const result = await apiRequest<UnboxingRecord[]>("/api/unboxing", {
    method: "POST",
    body: JSON.stringify({ records: [record] })
  });
  if (result.error) return { ...result, data: null };
  return { ...result, data: result.data?.[0] ?? null };
}

export async function insertUnboxingRecords(records: UnboxingRecordInsert[]) {
  return apiRequest<UnboxingRecord[]>("/api/unboxing", {
    method: "POST",
    body: JSON.stringify({ records })
  });
}

export async function uploadUnboxingPhoto(path: string, file: File) {
  try {
    const result = await storage.upload({ bucket: STORAGE_BUCKETS.inspectionPhotos, path, file });
    return { error: null, data: { path: result.path } };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)), data: null };
  }
}

export function getUnboxingPhotoPublicUrl(path: string) {
  return storage.getPublicUrl(STORAGE_BUCKETS.inspectionPhotos, path);
}
