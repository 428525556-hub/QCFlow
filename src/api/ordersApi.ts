import { supabase } from "@/src/api/client";
import { apiRequest } from "@/src/api/httpClient";
import type { Database, InspectionRecord, Order, OrderItem, ReinspectionRecord } from "@/src/types";

type OrderInsert = Database["public"]["Tables"]["orders"]["Insert"];
type OrderUpdate = Database["public"]["Tables"]["orders"]["Update"];
type OrderItemInsert = Database["public"]["Tables"]["order_items"]["Insert"];
type OrderItemUpdate = Database["public"]["Tables"]["order_items"]["Update"];
type OrderItemIdentity = Pick<OrderItem, "po_number" | "sku" | "color" | "size">;

export async function getActiveOrders() {
  return apiRequest<Order[]>("/api/orders");
}

export async function getAllOrders() {
  return apiRequest<Order[]>("/api/orders?includeDeleted=true");
}

export async function getOrderById(orderId: string) {
  return apiRequest<Order>(`/api/orders/${orderId}`);
}

export async function getOrderItems(orderId: string) {
  return apiRequest<OrderItem[]>(`/api/order-items?orderId=${encodeURIComponent(orderId)}`);
}

export async function getAllOrderItems() {
  return apiRequest<OrderItem[]>("/api/order-items");
}

export async function getInboundCandidateOrders() {
  const { data, error } = await getActiveOrders();
  if (error) return { data: null, error };

  return {
    data: (data ?? []).filter((order) => order.order_type !== "inbound" && Number(order.inbound_quantity || 0) < Number(order.quantity || 0)),
    error: null
  };
}

export async function getOrdersProgressData() {
  const [{ data: orders, error: ordersError }, { data: records, error: recordsError }, { data: reinspections, error: reinspectionsError }] = await Promise.all([
    getActiveOrders(),
    apiRequest<InspectionRecord[]>("/api/inspections"),
    apiRequest<ReinspectionRecord[]>("/api/reinspections")
  ]);

  return {
    data: {
      orders: orders ?? [],
      records: records ?? [],
      reinspections: reinspections ?? []
    },
    error: ordersError ?? recordsError ?? reinspectionsError
  };
}

export async function getDashboardData() {
  const [{ data: orders, error: ordersError }, { data: records, error: recordsError }] = await Promise.all([
    getActiveOrders(),
    apiRequest<InspectionRecord[]>("/api/inspections")
  ]);

  return {
    data: { orders: orders ?? [], records: records ?? [] },
    error: ordersError ?? recordsError
  };
}

export async function getClientOrdersProgress(customerName: string) {
  const [{ data: orders, error: ordersError }, { data: records, error: recordsError }] = await Promise.all([
    apiRequest<Order[]>(`/api/orders?customerName=${encodeURIComponent(customerName)}`),
    apiRequest<InspectionRecord[]>("/api/inspections")
  ]);

  return {
    data: { orders: orders ?? [], records: records ?? [] },
    error: ordersError ?? recordsError
  };
}

export async function getClientOrderDetailData(orderId: string, customerName: string) {
  const [orderResult, itemsResult, recordsResult] = await Promise.all([
    apiRequest<Order>(`/api/orders/${orderId}?customerName=${encodeURIComponent(customerName)}`),
    getOrderItems(orderId),
    apiRequest<InspectionRecord[]>(`/api/inspections?orderId=${encodeURIComponent(orderId)}`)
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
  if (ordersError || itemsError) return { data: null, error: ordersError ?? itemsError };

  const orderItems = items ?? [];
  return {
    data: (orders ?? []).map((order) => ({
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
  return apiRequest<{ id: string }>("/api/orders", { method: "POST", body: JSON.stringify(order) });
}

export async function createOrderWithItems(order: OrderInsert, items: Omit<OrderItemInsert, "order_id">[]) {
  return apiRequest<{ id: string }>("/api/orders/transaction", {
    method: "POST",
    body: JSON.stringify({ order, items })
  });
}

export async function updateOrder(orderId: string, payload: OrderUpdate) {
  return apiRequest<Order>(`/api/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function softDeleteOrder(orderId: string) {
  return updateOrder(orderId, { deleted_at: new Date().toISOString() });
}

export async function restoreOrder(orderId: string) {
  return updateOrder(orderId, { deleted_at: null });
}

export async function deleteOrder(orderId: string) {
  return apiRequest<{ id: string }>(`/api/orders/${orderId}`, { method: "DELETE" });
}

export async function insertOrderItems(items: OrderItemInsert[]) {
  return apiRequest<OrderItem[]>("/api/order-items", { method: "POST", body: JSON.stringify(items) });
}

export async function updateOrderItem(itemId: string, payload: OrderItemUpdate) {
  return apiRequest<OrderItem>(`/api/order-items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteOrderItems(itemIds: string[]) {
  return apiRequest<{ ids: string[] }>("/api/order-items", { method: "DELETE", body: JSON.stringify({ ids: itemIds }) });
}

export async function syncOrderItemIdentity(orderId: string, from: OrderItemIdentity, to: OrderItemIdentity) {
  const identityChanged = from.po_number !== to.po_number || from.sku !== to.sku || from.color !== to.color || from.size !== to.size;
  if (!identityChanged) return { error: null };

  const fullMatchUpdates = [
    supabase
      .from("reservation_carton_items")
      .update(to)
      .eq("order_id", orderId)
      .eq("po_number", from.po_number)
      .eq("sku", from.sku)
      .eq("color", from.color)
      .eq("size", from.size),
    supabase
      .from("unboxing_records")
      .update(to)
      .eq("order_id", orderId)
      .eq("po_number", from.po_number)
      .eq("sku", from.sku)
      .eq("color", from.color)
      .eq("size", from.size),
    supabase
      .from("shipment_items")
      .update(to)
      .eq("order_id", orderId)
      .eq("po_number", from.po_number)
      .eq("sku", from.sku)
      .eq("color", from.color)
      .eq("size", from.size)
  ];

  const colorSizeUpdates = [
    supabase.from("inspection_records").update({ color: to.color, size: to.size }).eq("order_id", orderId).eq("color", from.color).eq("size", from.size),
    supabase.from("reinspection_records").update({ color: to.color, size: to.size }).eq("order_id", orderId).eq("color", from.color).eq("size", from.size)
  ];

  const results = await Promise.all([...fullMatchUpdates, ...colorSizeUpdates]);
  return { error: results.find((result) => result.error)?.error ?? null };
}
