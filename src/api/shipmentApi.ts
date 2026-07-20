import { supabase } from "@/src/api/client";
import { apiRequest } from "@/src/api/httpClient";
import { STORAGE_BUCKETS } from "@/src/constants";
import { getOrderById, getOrderItems } from "@/src/api/ordersApi";
import type { Database, ReservationCarton, ReservationCartonItem } from "@/src/types";

type ShipmentCartonInsert = Database["public"]["Tables"]["shipment_cartons"]["Insert"];
type ShipmentItemInsert = Database["public"]["Tables"]["shipment_items"]["Insert"];
type UnboxingRecordInsert = Database["public"]["Tables"]["unboxing_records"]["Insert"];
type ReservationCartonInsert = Database["public"]["Tables"]["reservation_cartons"]["Insert"];
type ReservationCartonItemInsert = Database["public"]["Tables"]["reservation_carton_items"]["Insert"];

export async function getShipmentCartons(orderId: string) {
  return supabase.from("shipment_cartons").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
}

export async function getShipmentItems(orderId: string) {
  return supabase.from("shipment_items").select("*").eq("order_id", orderId);
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
  return supabase.from("shipment_cartons").select("*");
}

export async function getAllShipmentItems() {
  return supabase.from("shipment_items").select("*");
}

export async function insertShipmentCarton(carton: ShipmentCartonInsert) {
  return supabase.from("shipment_cartons").insert(carton).select("*").single();
}

export async function deleteShipmentCarton(cartonId: string) {
  return supabase.from("shipment_cartons").delete().eq("id", cartonId);
}

export async function insertShipmentItems(items: ShipmentItemInsert[]) {
  return supabase.from("shipment_items").insert(items);
}

export async function getUnboxingRecords(orderId?: string) {
  let query = supabase.from("unboxing_records").select("*").order("created_at", { ascending: false });
  if (orderId) query = query.eq("order_id", orderId);
  return query;
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
  return supabase.from("unboxing_records").select("*").order("created_at", { ascending: false }).limit(limit);
}

export async function insertUnboxingRecord(record: UnboxingRecordInsert) {
  return supabase.from("unboxing_records").insert(record).select("*").single();
}

export async function insertUnboxingRecords(records: UnboxingRecordInsert[]) {
  return supabase.from("unboxing_records").insert(records).select("*");
}

export async function uploadUnboxingPhoto(path: string, file: File) {
  return supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).upload(path, file, {
    cacheControl: "3600",
    upsert: false
  });
}

export function getUnboxingPhotoPublicUrl(path: string) {
  return supabase.storage.from(STORAGE_BUCKETS.inspectionPhotos).getPublicUrl(path).data.publicUrl;
}
