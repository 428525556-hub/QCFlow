import type { InspectionPlan, Order, OrderItem, OrderStatus, SchedulePriority, SubmitStatus } from "@/lib/types";
import type { PoolClient, QueryResultRow } from "pg";

import { TABLE_COLUMNS } from "./columns.ts";
import { queryRows } from "./query.ts";
import { withUserContext } from "./userContext.ts";

type OrderRow = QueryResultRow & {
  id: string;
  created_at: Date;
  deleted_at: Date | null;
  user_id: string;
  order_type: "reservation" | "inbound";
  customer_name: string;
  factory_name: string;
  po_number: string;
  sku: string;
  inbound_date: string | null;
  shipping_date: string | null;
  shipping_date_tbd: boolean;
  inspection_plan: InspectionPlan;
  reservation_remark: string | null;
  color: string;
  size: string;
  quantity: number;
  inbound_quantity: number;
  delivery_date: string | null;
  estimated_inspection_date: string | null;
  inspection_standard: string | null;
  priority: SchedulePriority;
  assigned_team_id: string | null;
  direct_ship: boolean;
  status: OrderStatus;
};

type OrderItemRow = QueryResultRow & {
  id: string;
  created_at: Date;
  order_id: string;
  user_id: string;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  carton_count: number;
  quantity_per_carton: number;
  quantity: number;
  inbound_quantity: number;
  estimated_inspection_date: string | null;
  submitted_quantity: number;
  submit_status: SubmitStatus;
  style_factor: number;
};

export type OrderFilters = {
  customerName?: string | null;
  inspectionPlan?: InspectionPlan | null;
  includeDeleted?: boolean;
  orderIds?: string[] | null;
};

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    created_at: toIso(row.created_at) ?? "",
    deleted_at: toIso(row.deleted_at),
    user_id: row.user_id,
    order_type: row.order_type,
    customer_name: row.customer_name,
    factory_name: row.factory_name,
    po_number: row.po_number,
    sku: row.sku,
    inbound_date: row.inbound_date,
    shipping_date: row.shipping_date,
    shipping_date_tbd: row.shipping_date_tbd,
    inspection_plan: row.inspection_plan,
    reservation_remark: row.reservation_remark,
    color: row.color,
    size: row.size,
    quantity: row.quantity,
    inbound_quantity: row.inbound_quantity,
    delivery_date: row.delivery_date,
    estimated_inspection_date: row.estimated_inspection_date,
    inspection_standard: row.inspection_standard,
    priority: row.priority,
    assigned_team_id: row.assigned_team_id,
    direct_ship: row.direct_ship,
    status: row.status
  };
}

export function mapOrderItemRow(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    created_at: toIso(row.created_at) ?? "",
    order_id: row.order_id,
    user_id: row.user_id,
    po_number: row.po_number,
    sku: row.sku,
    color: row.color,
    size: row.size,
    carton_count: row.carton_count,
    quantity_per_carton: row.quantity_per_carton,
    quantity: row.quantity,
    inbound_quantity: row.inbound_quantity,
    estimated_inspection_date: row.estimated_inspection_date,
    submitted_quantity: row.submitted_quantity,
    submit_status: row.submit_status,
    style_factor: row.style_factor
  };
}

/** 订单列表：排序与 Supabase 版本保持一致（出货日期升序、空值最后） */
export async function listOrders(filters: OrderFilters = {}): Promise<Order[]> {
  const values: unknown[] = [];
  const where: string[] = [];

  if (filters.orderIds && filters.orderIds.length === 0) return [];
  if (!filters.includeDeleted) where.push("deleted_at is null");
  if (filters.orderIds && filters.orderIds.length > 0) {
    values.push(filters.orderIds);
    where.push(`id = any($${values.length}::uuid[])`);
  }
  if (filters.customerName) {
    values.push(filters.customerName);
    where.push(`customer_name = $${values.length}`);
  }
  if (filters.inspectionPlan) {
    values.push(filters.inspectionPlan);
    where.push(`inspection_plan = $${values.length}`);
  }

  const sql = `select ${TABLE_COLUMNS.orders} from public.orders${
    where.length ? ` where ${where.join(" and ")}` : ""
  } order by shipping_date asc nulls last, created_at desc`;
  const rows = await queryRows<OrderRow>(sql, values);
  return rows.map(mapOrderRow);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const rows = await queryRows<OrderRow>(
    `select ${TABLE_COLUMNS.orders} from public.orders where id = $1 limit 1`,
    [id]
  );
  return rows.length > 0 ? mapOrderRow(rows[0]) : null;
}

export async function listOrderItems(
  filters: { orderId?: string | null; orderIds?: string[] | null; itemIds?: string[] | null } = {}
): Promise<OrderItem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.orderIds && filters.orderIds.length === 0) return [];
  if (filters.itemIds && filters.itemIds.length === 0) return [];
  if (filters.orderId) {
    values.push(filters.orderId);
    conditions.push(`order_id = $${values.length}`);
  }
  if (filters.itemIds && filters.itemIds.length > 0) {
    values.push(filters.itemIds);
    conditions.push(`id = any($${values.length}::uuid[])`);
  }
  if (filters.orderIds && filters.orderIds.length > 0) {
    values.push(filters.orderIds);
    conditions.push(`order_id = any($${values.length}::uuid[])`);
  }

  const where = conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "";
  const rows = await queryRows<OrderItemRow>(
    `select ${TABLE_COLUMNS.order_items} from public.order_items${where} order by color asc, size asc`,
    values
  );
  return rows.map(mapOrderItemRow);
}

export type CreateOrderInput = {
  userId: string;
  email: string;
  order: Record<string, unknown>;
  items: Record<string, unknown>[];
};

/** 在已注入用户上下文的事务连接上调用数据库函数（测试可复用并回滚） */
export async function insertOrderWithItems(
  client: PoolClient,
  input: { order: Record<string, unknown>; items: Record<string, unknown>[] }
): Promise<string> {
  const result = await client.query<QueryResultRow>(
    "select public.create_order_with_items($1::jsonb, $2::jsonb) as id",
    [JSON.stringify(input.order), JSON.stringify(input.items)]
  );
  const id = result.rows[0]?.id;
  if (!id) throw new Error("create_order_with_items 未返回 id");
  return String(id);
}

export async function createOrderWithItems(input: CreateOrderInput): Promise<string> {
  return withUserContext(input.userId, input.email, (client) =>
    insertOrderWithItems(client, { order: input.order, items: input.items })
  );
}
