import { supabase } from "@/src/api/client";
import type { Database, InspectionRecord, Order, OrderItem, ReinspectionRecord } from "@/src/types";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];
type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];
type OrderItemUpdate = Database["public"]["Tables"]["order_items"]["Update"];

export async function getActiveOrders() {
  return supabase.from("orders").select("*").is("deleted_at", null).order("shipping_date", { ascending: true, nullsFirst: false });
}

export async function getAllOrders() {
  return supabase.from("orders").select("*").order("shipping_date", { ascending: true, nullsFirst: false });
}

export async function getOrderById(orderId: string) {
  return supabase.from("orders").select("*").eq("id", orderId).is("deleted_at", null).single();
}

export async function getOrderItems(orderId: string) {
  return supabase.from("order_items").select("*").eq("order_id", orderId).order("color").order("size");
}

export async function getAllOrderItems() {
  return supabase.from("order_items").select("*");
}

export async function getInboundCandidateOrders() {
  const { data, error } = await getActiveOrders();
  if (error) return { data: null, error };

  return {
    data: ((data ?? []) as Order[]).filter((order) => order.order_type !== "inbound" && Number(order.inbound_quantity || 0) < Number(order.quantity || 0)),
    error: null
  };
}

export async function getOrdersProgressData() {
  const [{ data: orders, error: ordersError }, { data: records, error: recordsError }, { data: reinspections, error: reinspectionsError }] = await Promise.all([
    getActiveOrders(),
    supabase.from("inspection_records").select("*"),
    supabase.from("reinspection_records").select("*")
  ]);

  return {
    data: {
      orders: (orders ?? []) as Order[],
      records: (records ?? []) as InspectionRecord[],
      reinspections: (reinspections ?? []) as ReinspectionRecord[]
    },
    error: ordersError ?? recordsError ?? reinspectionsError
  };
}

export async function getDashboardData() {
  const [{ data: orders, error: ordersError }, { data: records, error: recordsError }] = await Promise.all([
    supabase.from("orders").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("inspection_records").select("*")
  ]);

  return {
    data: {
      orders: (orders ?? []) as Order[],
      records: (records ?? []) as InspectionRecord[]
    },
    error: ordersError ?? recordsError
  };
}

export async function getClientOrdersProgress(customerName: string) {
  const [{ data: orders, error: ordersError }, { data: records, error: recordsError }] = await Promise.all([
    supabase.from("orders").select("*").eq("customer_name", customerName).is("deleted_at", null).order("shipping_date", { ascending: true, nullsFirst: false }),
    supabase.from("inspection_records").select("*")
  ]);

  return {
    data: {
      orders: (orders ?? []) as Order[],
      records: (records ?? []) as InspectionRecord[]
    },
    error: ordersError ?? recordsError
  };
}

export async function getClientOrderDetailData(orderId: string, customerName: string) {
  const [orderResult, itemsResult, recordsResult] = await Promise.all([
    supabase.from("orders").select("*").eq("id", orderId).eq("customer_name", customerName).is("deleted_at", null).maybeSingle(),
    getOrderItems(orderId),
    supabase.from("inspection_records").select("*").eq("order_id", orderId).order("created_at", { ascending: false })
  ]);

  return {
    data: {
      order: orderResult.data,
      items: itemsResult.data ?? [],
      records: recordsResult.data ?? []
    },
    error: orderResult.error ?? itemsResult.error ?? recordsResult.error
  };
}

export async function getOrdersWithItems(includeDeleted = false) {
  const [{ data: orders, error: ordersError }, { data: items, error: itemsError }] = await Promise.all([includeDeleted ? getAllOrders() : getActiveOrders(), getAllOrderItems()]);

  if (ordersError || itemsError) {
    return { data: null, error: ordersError ?? itemsError };
  }

  const orderItems = (items ?? []) as OrderItem[];
  return {
    data: ((orders ?? []) as Order[]).map((order) => ({
      ...order,
      deleted_at: order.deleted_at ?? null,
      items: orderItems.filter((item) => item.order_id === order.id)
    })),
    error: null
  };
}

export function subscribeOrdersProgress(onChange: () => void) {
  const channel = supabase
    .channel("orders-progress-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "inspection_records" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "reinspection_records" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function createOrder(order: OrderInsert) {
  return supabase.from("orders").insert(order).select("id").single();
}

export async function updateOrder(orderId: string, payload: OrderUpdate) {
  return supabase.from("orders").update(payload).eq("id", orderId);
}

export async function softDeleteOrder(orderId: string) {
  return updateOrder(orderId, { deleted_at: new Date().toISOString() });
}

export async function restoreOrder(orderId: string) {
  return updateOrder(orderId, { deleted_at: null });
}

export async function deleteOrder(orderId: string) {
  return supabase.from("orders").delete().eq("id", orderId);
}

export async function insertOrderItems(items: OrderItemInsert[]) {
  return supabase.from("order_items").insert(items);
}

export async function updateOrderItem(itemId: string, payload: OrderItemUpdate) {
  return supabase.from("order_items").update(payload).eq("id", itemId);
}

export async function deleteOrderItems(itemIds: string[]) {
  return supabase.from("order_items").delete().in("id", itemIds);
}
