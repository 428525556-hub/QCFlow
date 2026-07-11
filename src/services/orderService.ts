import { percent } from "@/lib/format";
import { getActiveOrders, getOrderById, getOrderItems } from "@/src/api/ordersApi";
import type { InspectionRecord, InspectionStage, Order, OrderItem, ReinspectionRecord } from "@/src/types";

export type OrderProgress = {
  baseQuantity: number;
  normalPassed: number;
  normalFailed: number;
  normalRecovered: number;
  xrayPassed: number;
  xrayFailed: number;
  xrayRecovered: number;
};

export type OrderCustomerGroup = {
  customerName: string;
  totalQuantity: number;
  inboundQuantity: number;
  normalFailed: number;
  xrayFailed: number;
  orders: Order[];
};

export type ClientOrderWithDefects = Order & {
  defect_quantity: number;
  record_count: number;
};

export type ClientOrderTotals = {
  quantity: number;
  inbound: number;
  defects: number;
  rate: string;
};

export type ClientOrderDetailReport = {
  total: number;
  defectQty: number;
  rate: string;
  byType: [string, number][];
  byColorSize: Array<{ color: string; size: string; defectType: string; quantity: number }>;
};

export type OrderItemColorGroup = {
  color: string;
  total: number;
  inbound: number;
  items: OrderItem[];
};

export type OrderDaySummary = {
  inboundCount: number;
  inboundQty: number;
  shippingCount: number;
  shippingQty: number;
};

export type DashboardMetrics = {
  todayOrders: number;
  todayDone: number;
  totalInbound: number;
  defectQty: number;
};

export function buildDashboardMetrics(orders: Order[], records: InspectionRecord[], today: { start: string; end: string }): DashboardMetrics {
  const todayOrders = orders.filter((order) => order.created_at >= today.start && order.created_at < today.end);
  const todayDone = todayOrders.filter((order) => order.status === "已完成").length;
  const totalInbound = orders.reduce((sum, order) => sum + Number(order.inbound_quantity || 0), 0);
  const defectQty = records.reduce((sum, record) => sum + Number(record.quantity || 0), 0);

  return {
    todayOrders: todayOrders.length,
    todayDone,
    totalInbound,
    defectQty
  };
}

export function findActiveOrder(orders: Order[]) {
  return orders.find((order) => order.status !== "已完成") ?? null;
}

export function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function monthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function buildCalendarDays(monthDate: Date) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

export function buildOrderDaySummaries(orders: Order[]) {
  const map = new Map<string, OrderDaySummary>();

  function ensure(dateKey: string) {
    if (!map.has(dateKey)) {
      map.set(dateKey, { inboundCount: 0, inboundQty: 0, shippingCount: 0, shippingQty: 0 });
    }
    return map.get(dateKey)!;
  }

  orders.forEach((order) => {
    if (order.inbound_date) {
      const item = ensure(order.inbound_date);
      item.inboundCount += 1;
      item.inboundQty += order.quantity;
    }

    if (order.shipping_date) {
      const item = ensure(order.shipping_date);
      item.shippingCount += 1;
      item.shippingQty += order.quantity;
    }
  });

  return map;
}

export function getOrdersByInboundDate(orders: Order[], dateKey: string) {
  return orders.filter((order) => order.inbound_date === dateKey);
}

export function getOrdersByShippingDate(orders: Order[], dateKey: string) {
  return orders.filter((order) => order.shipping_date === dateKey);
}

export function sortOrdersByShippingDate<T extends Pick<Order, "shipping_date" | "created_at">>(a: T, b: T) {
  const aDate = a.shipping_date ?? "9999-12-31";
  const bDate = b.shipping_date ?? "9999-12-31";
  if (aDate !== bDate) return aDate.localeCompare(bDate);
  return b.created_at.localeCompare(a.created_at);
}

export function sumDefectQuantity(records: InspectionRecord[], orderId: string, stage: InspectionStage) {
  return records
    .filter((record) => record.order_id === orderId && record.inspection_stage === stage)
    .reduce((sum, record) => sum + Number(record.quantity || 0), 0);
}

export function sumRecoveredQuantity(records: ReinspectionRecord[], orderId: string, stage: InspectionStage) {
  return records
    .filter((record) => record.order_id === orderId && record.inspection_stage === stage)
    .reduce((sum, record) => sum + Number(record.passed_quantity || 0), 0);
}

export function buildOrderProgressMap(orders: Order[], records: InspectionRecord[], reinspections: ReinspectionRecord[]) {
  const map = new Map<string, OrderProgress>();

  for (const order of orders) {
    const baseQuantity = Number(order.inbound_quantity || order.quantity || 0);
    const normalOriginalFailed = sumDefectQuantity(records, order.id, "normal");
    const xrayOriginalFailed = sumDefectQuantity(records, order.id, "xray");
    const normalRecovered = sumRecoveredQuantity(reinspections, order.id, "normal");
    const xrayRecovered = sumRecoveredQuantity(reinspections, order.id, "xray");
    const normalFailed = Math.max(0, normalOriginalFailed - normalRecovered);
    const xrayFailed = Math.max(0, xrayOriginalFailed - xrayRecovered);

    map.set(order.id, {
      baseQuantity,
      normalRecovered,
      normalFailed,
      normalPassed: Math.max(0, baseQuantity - normalFailed),
      xrayRecovered,
      xrayFailed,
      xrayPassed: Math.max(0, baseQuantity - xrayFailed)
    });
  }

  return map;
}

export function getDefaultOrderProgress(order: Order): OrderProgress {
  return {
    baseQuantity: Number(order.inbound_quantity || order.quantity || 0),
    normalPassed: 0,
    normalFailed: 0,
    normalRecovered: 0,
    xrayPassed: 0,
    xrayFailed: 0,
    xrayRecovered: 0
  };
}

export function groupOrdersByCustomer(orders: Order[], progressByOrder: Map<string, OrderProgress>): OrderCustomerGroup[] {
  const groups = new Map<string, Order[]>();

  for (const order of orders) {
    const customerName = order.customer_name || "未分类客户";
    groups.set(customerName, [...(groups.get(customerName) ?? []), order]);
  }

  return Array.from(groups.entries())
    .map(([customerName, customerOrders]) => ({
      customerName,
      totalQuantity: customerOrders.reduce((sum, order) => sum + order.quantity, 0),
      inboundQuantity: customerOrders.reduce((sum, order) => sum + Number(order.inbound_quantity || 0), 0),
      normalFailed: customerOrders.reduce((sum, order) => sum + (progressByOrder.get(order.id)?.normalFailed ?? 0), 0),
      xrayFailed: customerOrders.reduce((sum, order) => sum + (progressByOrder.get(order.id)?.xrayFailed ?? 0), 0),
      orders: [...customerOrders].sort(sortOrdersByShippingDate)
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "zh-Hans-CN"));
}

export function attachClientOrderDefects(orders: Order[], records: InspectionRecord[]): ClientOrderWithDefects[] {
  return orders.map((order) => {
    const orderRecords = records.filter((record) => record.order_id === order.id);
    return {
      ...order,
      defect_quantity: orderRecords.reduce((sum, record) => sum + Number(record.quantity || 0), 0),
      record_count: orderRecords.length
    };
  });
}

export function getClientOrderTotals(orders: ClientOrderWithDefects[]): ClientOrderTotals {
  const quantity = orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0);
  const inbound = orders.reduce((sum, order) => sum + Number(order.inbound_quantity || 0), 0);
  const defects = orders.reduce((sum, order) => sum + Number(order.defect_quantity || 0), 0);
  return { quantity, inbound, defects, rate: percent(defects, inbound || quantity) };
}

export function buildClientOrderDetailReport(order: Order | null, records: InspectionRecord[]): ClientOrderDetailReport {
  const total = Number(order?.inbound_quantity || order?.quantity || 0);
  const defectQty = records.reduce((sum, record) => sum + Number(record.quantity || 0), 0);
  const byType = new Map<string, number>();
  const byColorSize = new Map<string, { color: string; size: string; defectType: string; quantity: number }>();

  for (const record of records) {
    byType.set(record.defect_type, (byType.get(record.defect_type) ?? 0) + Number(record.quantity || 0));
    const color = record.color || "-";
    const size = record.size || "-";
    const key = `${color}__${size}__${record.defect_type}`;
    const row = byColorSize.get(key) ?? { color, size, defectType: record.defect_type, quantity: 0 };
    row.quantity += Number(record.quantity || 0);
    byColorSize.set(key, row);
  }

  return {
    total,
    defectQty,
    rate: percent(defectQty, total),
    byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
    byColorSize: Array.from(byColorSize.values()).sort((a, b) => a.color.localeCompare(b.color, "zh-Hans-CN") || a.size.localeCompare(b.size, "zh-Hans-CN", { numeric: true }))
  };
}

export function groupOrderItemsByColor(items: OrderItem[]): OrderItemColorGroup[] {
  const groups = new Map<string, OrderItem[]>();
  for (const item of items) groups.set(item.color, [...(groups.get(item.color) ?? []), item]);

  return Array.from(groups.entries()).map(([color, groupItems]) => ({
    color,
    total: groupItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    inbound: groupItems.reduce((sum, item) => sum + Number(item.inbound_quantity || 0), 0),
    items: groupItems
  }));
}

export const orderService = {
  getActiveOrders,
  getOrderById,
  getOrderItems,
  buildDashboardMetrics,
  findActiveOrder,
  toDateKey,
  monthLabel,
  buildCalendarDays,
  buildOrderDaySummaries,
  getOrdersByInboundDate,
  getOrdersByShippingDate,
  sortOrdersByShippingDate,
  sumDefectQuantity,
  sumRecoveredQuantity,
  buildOrderProgressMap,
  getDefaultOrderProgress,
  groupOrdersByCustomer,
  attachClientOrderDefects,
  getClientOrderTotals,
  buildClientOrderDetailReport,
  groupOrderItemsByColor
};
