import { getShipmentCartons, getShipmentItems, getUnboxingRecords, insertShipmentCarton, insertShipmentItems, insertUnboxingRecord } from "@/src/api/shipmentApi";
import { sortOrdersByShippingDate } from "@/src/services/orderService";
import type { DispatchRecord, Order, OrderItem, ShipmentCarton, ShipmentItem } from "@/src/types";

export type OrderWithPacking = Order & {
  packed_quantity: number;
};

export type PackingCustomerGroup = {
  customerName: string;
  orders: OrderWithPacking[];
  totalInbound: number;
  totalPacked: number;
};

export type DispatchOrder = Order & {
  carton_count: number;
  packed_quantity: number;
  dispatched: boolean;
};

export type DispatchCustomerGroup = {
  customerName: string;
  orders: DispatchOrder[];
  totalPacked: number;
  totalCartons: number;
};

export type DispatchTotals = {
  expected: number;
  packed: number;
  cartons: number;
  shortage: number;
  matched: boolean;
};

export type DispatchDiffRow = {
  po_number: string;
  sku: string;
  color: string;
  size: string;
  expected: number;
  packed: number;
  shortage: number;
};

function itemKey(color: string, size: string) {
  return `${color}|||${size}`;
}

export function getAvailableQuantity(order: Order) {
  return Number(order.inbound_quantity || order.quantity || 0);
}

export function getRemainingPackingQuantity(order: OrderWithPacking) {
  return Math.max(0, getAvailableQuantity(order) - Number(order.packed_quantity || 0));
}

export function buildPackingOrders(orders: Order[], shipmentItems: ShipmentItem[]): OrderWithPacking[] {
  const packedByOrder = new Map<string, number>();
  for (const row of shipmentItems) {
    packedByOrder.set(row.order_id, (packedByOrder.get(row.order_id) ?? 0) + Number(row.quantity || 0));
  }

  return orders.map((order) => ({
    ...order,
    packed_quantity: packedByOrder.get(order.id) ?? 0
  }));
}

export function groupPackingOrdersByCustomer(orders: OrderWithPacking[]): PackingCustomerGroup[] {
  const byCustomer = new Map<string, OrderWithPacking[]>();
  for (const order of orders) {
    const customerName = order.customer_name || "未分类客户";
    byCustomer.set(customerName, [...(byCustomer.get(customerName) ?? []), order]);
  }

  return Array.from(byCustomer.entries())
    .map(([customerName, customerOrders]) => ({
      customerName,
      orders: [...customerOrders].sort(sortOrdersByShippingDate),
      totalInbound: customerOrders.reduce((sum, order) => sum + getAvailableQuantity(order), 0),
      totalPacked: customerOrders.reduce((sum, order) => sum + Number(order.packed_quantity || 0), 0)
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "zh-Hans-CN"));
}

export function buildDispatchOrders(orders: Order[], cartons: ShipmentCarton[], items: ShipmentItem[], dispatchRecords: DispatchRecord[]): DispatchOrder[] {
  const cartonCount = new Map<string, number>();
  for (const carton of cartons) {
    cartonCount.set(carton.order_id, (cartonCount.get(carton.order_id) ?? 0) + 1);
  }

  const packedQuantity = new Map<string, number>();
  for (const item of items) {
    packedQuantity.set(item.order_id, (packedQuantity.get(item.order_id) ?? 0) + Number(item.quantity || 0));
  }

  const dispatchedOrders = new Set(dispatchRecords.map((record) => record.order_id));
  return orders.map((order) => ({
    ...order,
    carton_count: cartonCount.get(order.id) ?? 0,
    packed_quantity: packedQuantity.get(order.id) ?? 0,
    dispatched: dispatchedOrders.has(order.id)
  }));
}

export function groupDispatchOrdersByCustomer(orders: DispatchOrder[]): DispatchCustomerGroup[] {
  const byCustomer = new Map<string, DispatchOrder[]>();
  for (const order of orders) {
    const customerName = order.customer_name || "未分类客户";
    byCustomer.set(customerName, [...(byCustomer.get(customerName) ?? []), order]);
  }

  return Array.from(byCustomer.entries())
    .map(([customerName, customerOrders]) => ({
      customerName,
      orders: [...customerOrders].sort(sortOrdersByShippingDate),
      totalPacked: customerOrders.reduce((sum, order) => sum + order.packed_quantity, 0),
      totalCartons: customerOrders.reduce((sum, order) => sum + order.carton_count, 0)
    }))
    .sort((a, b) => a.customerName.localeCompare(b.customerName, "zh-Hans-CN"));
}

export function isDispatchQuantityMatched(order: DispatchOrder) {
  return getAvailableQuantity(order) === order.packed_quantity;
}

export function buildDispatchTotals(items: OrderItem[], shipmentItems: ShipmentItem[], cartons: ShipmentCarton[]): DispatchTotals {
  const expected = items.reduce((sum, item) => sum + Number(item.inbound_quantity || item.quantity || 0), 0);
  const packed = shipmentItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  return {
    expected,
    packed,
    cartons: cartons.length,
    shortage: Math.max(0, expected - packed),
    matched: expected === packed
  };
}

export function buildDispatchDiffRows(items: OrderItem[], shipmentItems: ShipmentItem[]): DispatchDiffRow[] {
  const packedByItem = new Map<string, number>();
  for (const item of shipmentItems) {
    const key = itemKey(item.color, item.size);
    packedByItem.set(key, (packedByItem.get(key) ?? 0) + Number(item.quantity || 0));
  }

  return items
    .map((item) => {
      const expected = Number(item.inbound_quantity || item.quantity || 0);
      const packed = packedByItem.get(itemKey(item.color, item.size)) ?? 0;
      return {
        po_number: item.po_number,
        sku: item.sku,
        color: item.color,
        size: item.size,
        expected,
        packed,
        shortage: Math.max(0, expected - packed)
      };
    })
    .filter((row) => row.shortage > 0);
}

export const shipmentService = {
  getShipmentCartons,
  getShipmentItems,
  insertShipmentCarton,
  insertShipmentItems,
  getUnboxingRecords,
  insertUnboxingRecord,
  getAvailableQuantity,
  getRemainingPackingQuantity,
  buildPackingOrders,
  groupPackingOrdersByCustomer,
  buildDispatchOrders,
  groupDispatchOrdersByCustomer,
  isDispatchQuantityMatched,
  buildDispatchTotals,
  buildDispatchDiffRows
};
