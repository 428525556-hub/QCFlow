import { supabase } from "@/src/api/client";
import { getOrderById, getOrderItems } from "@/src/api/ordersApi";
import { getShipmentCartons, getShipmentItems } from "@/src/api/shipmentApi";
import type { Database } from "@/src/types";

type DispatchRecordInsert = Database["public"]["Tables"]["dispatch_records"]["Insert"];

export async function getDispatchRecords(orderId?: string) {
  let query = supabase.from("dispatch_records").select("*").order("created_at", { ascending: false });
  if (orderId) query = query.eq("order_id", orderId);
  return query;
}

export async function getAllDispatchRecords() {
  return supabase.from("dispatch_records").select("*");
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
  return supabase.from("dispatch_records").insert(record).select("*").single();
}
