"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { useCurrentProfile, useCurrentUser } from "@/components/AuthGuard";
import { Modal } from "@/components/ui";
import { ADMIN_EMAIL } from "@/lib/security";
import { ORDER_STATUSES } from "@/src/constants";
import type { InspectionPlan, Order, OrderItem, OrderStatus, SubmitStatus } from "@/lib/types";
import { bulkDeleteOrders, deleteOrder as deleteOrderById, deleteOrderItems, getOrdersWithItems, insertOrderItems, restoreOrder as restoreOrderById, softDeleteOrder, syncOrderItemIdentity, updateOrder, updateOrderItem } from "@/src/api/ordersApi";
import { getShipmentBatches, upsertShipmentBatch } from "@/src/api/shipmentBatchesApi";
import { buildBatchMap, buildShipmentBatchGroups, groupOrdersByCustomer } from "@/src/services/orderService";
import type { ShipmentBatch } from "@/lib/types";
import { Archive, CalendarDays, ChevronDown, ChevronRight, Plus, RotateCcw, Save, ShieldAlert, Trash2, Truck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type OrderWithItems = Order & {
  items: OrderItem[];
};

type EditableItem = {
  id: string;
  isNew?: boolean;
  po_number: string;
  sku: string;
  color: string;
  size: string;
  quantity: string;
  inbound_quantity: string;
  submitted_quantity: string;
  submit_status: SubmitStatus;
  style_factor: string;
};

type EditableOrder = {
  id: string;
  user_id: string;
  customer_name: string;
  factory_name: string;
  inbound_date: string;
  shipping_date: string;
  inspection_plan: InspectionPlan;
  reservation_remark: string;
  status: OrderStatus;
  direct_ship: boolean;
  items: EditableItem[];
  deletedItemIds: string[];
};

const PLAN_OPTIONS: { value: InspectionPlan; label: string }[] = [
  { value: "both", label: "检品 + X线" },
  { value: "normal", label: "只做检品" },
  { value: "xray", label: "只做X线" },
  { value: "field", label: "出差检品" }
];

function toNumber(value: string | number | null | undefined) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? Math.max(0, Math.floor(numberValue)) : 0;
}

function newDraftItem(order: OrderWithItems): EditableItem {
  return {
    id: `new-${crypto.randomUUID()}`,
    isNew: true,
    po_number: order.po_number || "",
    sku: order.sku || "",
    color: order.color || "",
    size: order.size || "",
    quantity: "0",
    inbound_quantity: "0",
    submitted_quantity: "0",
    submit_status: "pending",
    style_factor: "1"
  };
}

function buildDraft(order: OrderWithItems): EditableOrder {
  const items = order.items.length
    ? order.items.map((item) => ({
        id: item.id,
        po_number: item.po_number || "",
        sku: item.sku || "",
        color: item.color || "",
        size: item.size || "",
        quantity: String(item.quantity || 0),
        inbound_quantity: String(item.inbound_quantity || 0),
        submitted_quantity: String(item.submitted_quantity ?? 0),
        submit_status: item.submit_status ?? "pending",
        style_factor: String(item.style_factor ?? 1)
      }))
    : [newDraftItem(order)];

  return {
    id: order.id,
    user_id: order.user_id,
    customer_name: order.customer_name || "",
    factory_name: order.factory_name || "",
    inbound_date: order.inbound_date || "",
    shipping_date: order.shipping_date || "",
    inspection_plan: order.inspection_plan || "both",
    reservation_remark: order.reservation_remark || "",
    status: order.status,
    direct_ship: order.direct_ship ?? false,
    items,
    deletedItemIds: []
  };
}

function uniqueSummary(values: string[], fallback: string) {
  const clean = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (clean.length === 0) return fallback;
  if (clean.length === 1) return clean[0];
  return `澶?{fallback}`;
}

function itemTotal(items: EditableItem[], key: "quantity" | "inbound_quantity") {
  return items.reduce((sum, item) => sum + toNumber(item[key]), 0);
}

function groupItemsByColor(items: EditableItem[]) {
  const groups = new Map<string, EditableItem[]>();

  for (const item of items) {
    const color = item.color.trim() || "鏈畾";
    groups.set(color, [...(groups.get(color) ?? []), item]);
  }

  return Array.from(groups.entries())
    .map(([color, colorItems]) => ({
      color,
      planned: itemTotal(colorItems, "quantity"),
      inbound: itemTotal(colorItems, "inbound_quantity"),
      items: colorItems.sort((a, b) => a.size.localeCompare(b.size, "zh-Hans-CN", { numeric: true }))
    }))
    .sort((a, b) => a.color.localeCompare(b.color, "zh-Hans-CN"));
}

function isCompleted(order: Order) {
  return order.status === "已完成";
}

export default function ManageOrdersPage() {
  const user = useCurrentUser();
  const profile = useCurrentProfile();
  const isAdmin = user?.email === ADMIN_EMAIL || profile?.role === "admin";
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [batches, setBatches] = useState<ShipmentBatch[]>([]);
  const [drafts, setDrafts] = useState<Record<string, EditableOrder>>({});
  const [batchDrafts, setBatchDrafts] = useState<Record<string, { batch_no: string; remark: string }>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingBatch, setSavingBatch] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);
  const [bulkConfirm, setBulkConfirm] = useState<null | {
    kind: "customer" | "date" | "orders";
    customerName: string;
    shippingDate: string | null;
    orderIds: string[];
    orderCount: number;
    totalQuantity: number;
  }>(null);

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [orderResult, batchResult] = await Promise.all([getOrdersWithItems(true), getShipmentBatches()]);
    const { data, error } = orderResult;

    if (error || !data) {
      setMessage(`${error?.message}。请确认数据表和管理员权限 SQL 已执行。`);
      setLoading(false);
      return;
    }

    const nextOrders = data as OrderWithItems[];

    setOrders(nextOrders);
    setDrafts(Object.fromEntries(nextOrders.map((order) => [order.id, buildDraft(order)])));
    setBatches(batchResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const normalOrders = useMemo(() => orders.filter((order) => !order.deleted_at), [orders]);
  const trashedOrders = useMemo(() => orders.filter((order) => Boolean(order.deleted_at)), [orders]);
  const batchMap = useMemo(() => buildBatchMap(batches), [batches]);
  const batchGroups = useMemo(() => buildShipmentBatchGroups(normalOrders, batchMap), [normalOrders, batchMap]);
  const customerGroups = useMemo(() => groupOrdersByCustomer(normalOrders, new Map()), [normalOrders]);
  const selectedOrders = useMemo(() => normalOrders.filter((order) => selectedIds.has(order.id)), [normalOrders, selectedIds]);
  const selectedQuantity = useMemo(() => selectedOrders.reduce((sum, order) => sum + Number(order.quantity || 0), 0), [selectedOrders]);

  function patchDraft(orderId: string, patch: Partial<EditableOrder>) {
    setDrafts((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        ...patch
      }
    }));
  }

  function toggleCustomer(customerName: string) {
    setExpandedCustomers((current) => ({ ...current, [customerName]: !(current[customerName] ?? true) }));
  }

  function toggleDate(dateKey: string) {
    setExpandedDates((current) => ({ ...current, [dateKey]: !(current[dateKey] ?? false) }));
  }

  function toggleSelect(orderId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  function toggleDateSelect(orderIds: string[]) {
    const allSelected = orderIds.every((id) => selectedIds.has(id));
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of orderIds) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function requestCustomerDelete(group: { customerName: string; orderCount: number; totalQuantity: number }) {
    setBulkConfirm({ kind: "customer", customerName: group.customerName, shippingDate: null, orderIds: [], orderCount: group.orderCount, totalQuantity: group.totalQuantity });
  }

  function requestDateDelete(group: { customerName: string; shippingDate: string | null; orderCount: number; totalQuantity: number }) {
    setBulkConfirm({ kind: "date", customerName: group.customerName, shippingDate: group.shippingDate, orderIds: [], orderCount: group.orderCount, totalQuantity: group.totalQuantity });
  }

  function requestSelectedDelete() {
    if (selectedOrders.length === 0) return;
    setBulkConfirm({
      kind: "orders",
      customerName: "",
      shippingDate: null,
      orderIds: selectedOrders.map((order) => order.id),
      orderCount: selectedOrders.length,
      totalQuantity: selectedQuantity
    });
  }

  async function confirmBulkDelete() {
    if (!bulkConfirm || deleting) return;
    setDeleting(true);
    setMessage("");

    const payload =
      bulkConfirm.kind === "orders"
        ? { orderIds: bulkConfirm.orderIds }
        : bulkConfirm.kind === "date"
          ? { customerName: bulkConfirm.customerName, shippingDate: bulkConfirm.shippingDate ?? undefined }
          : { customerName: bulkConfirm.customerName };

    const { data, error } = await bulkDeleteOrders(payload);
    setDeleting(false);
    setBulkConfirm(null);

    if (error) {
      setMessage(`${error.message}。批量删除失败，请重试。`);
      return;
    }
    if (!data) {
      setMessage("批量删除失败：服务端未返回结果。");
      return;
    }

    const blockedText =
      data.blocked.length > 0
        ? `；${data.blocked.length} 单因已产生业务记录被保护（${data.blocked
            .slice(0, 3)
            .map((item) => item.po_number)
            .join("、")}${data.blocked.length > 3 ? " 等" : ""}）`
        : "";
    setMessage(`已删除 ${data.deleted} 个订单，共 ${data.deletedQuantity} 双。${blockedText}`);
    setSelectedIds(new Set());
    await load();
  }

  function patchBatchDraft(key: string, patch: Partial<{ batch_no: string; remark: string }>) {
    setBatchDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { batch_no: "", remark: "" }),
        ...patch
      }
    }));
  }

  async function saveBatch(key: string, group: { customerName: string; shippingDate: string | null }) {
    if (!group.shippingDate) {
      setMessage("未设置出货日期的订单无法建立出货批次，请先给订单设置出货日期。");
      return;
    }
    const draft = batchDrafts[key] ?? { batch_no: "", remark: "" };
    setSavingBatch(key);
    setMessage("");
    const { error } = await upsertShipmentBatch({
      customer_name: group.customerName,
      shipping_date: group.shippingDate,
      batch_no: draft.batch_no.trim() || null,
      remark: draft.remark.trim() || null
    });
    setSavingBatch(null);
    if (error) {
      setMessage(`${error.message}。保存出货批次失败，请确认已执行 shipment_batches 建表 SQL。`);
      return;
    }
    setMessage("出货批次已保存。");
    await load();
  }

  function patchItem(orderId: string, itemId: string, patch: Partial<EditableItem>) {
    setDrafts((current) => {
      const draft = current[orderId];
      return {
        ...current,
        [orderId]: {
          ...draft,
          items: draft.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
        }
      };
    });
  }

  function addItem(order: OrderWithItems) {
    setDrafts((current) => {
      const draft = current[order.id];
      return {
        ...current,
        [order.id]: {
          ...draft,
          items: [...draft.items, newDraftItem(order)]
        }
      };
    });
  }

  function removeItem(orderId: string, item: EditableItem) {
    setDrafts((current) => {
      const draft = current[orderId];
      if (draft.items.length <= 1) return current;

      return {
        ...current,
        [orderId]: {
          ...draft,
          items: draft.items.filter((row) => row.id !== item.id),
          deletedItemIds: item.isNew ? draft.deletedItemIds : [...draft.deletedItemIds, item.id]
        }
      };
    });
  }

  async function updateStatus(orderId: string, status: OrderStatus) {
    const draft = drafts[orderId];
    if (draft) patchDraft(orderId, { status });

    setMessage("");
    const { error } = await updateOrder(orderId, { status });

    if (error) {
      setMessage(`${error.message}。请确认这个账号是管理员，并已执行管理员权限 SQL。`);
      return;
    }

    await load();
  }

  async function saveOrder(order: OrderWithItems) {
    const draft = drafts[order.id];
    if (!draft) return;

    const cleanItems = draft.items.map((item) => {
      const quantity = toNumber(item.quantity);
      const inboundQuantity = Math.min(toNumber(item.inbound_quantity), quantity);
      const submittedQuantity = Math.min(toNumber(item.submitted_quantity), quantity);
      return {
        ...item,
        po_number: item.po_number.trim(),
        sku: item.sku.trim(),
        color: item.color.trim(),
        size: item.size.trim(),
        quantity,
        inbound_quantity: inboundQuantity,
        submitted_quantity: submittedQuantity,
        style_factor: Number(item.style_factor) > 0 ? Number(item.style_factor) : 1
      };
    });

    if (cleanItems.length === 0) {
      setMessage("至少需要保留一条颜色尺码明细。");
      return;
    }

    setMessage("");
    setSavingId(order.id);

    if (draft.deletedItemIds.length > 0) {
      const { error } = await deleteOrderItems(draft.deletedItemIds);
      if (error) {
        setMessage(`${error.message}。删除明细失败，请确认管理员权限 SQL 已执行。`);
        setSavingId(null);
        return;
      }
    }

    for (const item of cleanItems) {
      const payload = {
        po_number: item.po_number || "-",
        sku: item.sku || "-",
        color: item.color || "鏈畾",
        size: item.size || "鏈畾",
        quantity: item.quantity,
        inbound_quantity: item.inbound_quantity,
        submitted_quantity: item.submitted_quantity,
        submit_status: item.submit_status,
        style_factor: item.style_factor
      };

      if (item.isNew) {
        const { error } = await insertOrderItems([{
          ...payload,
          order_id: order.id,
          user_id: draft.user_id
        }]);
        if (error) {
          setMessage(`${error.message}。新增明细失败，请确认管理员权限 SQL 已执行。`);
          setSavingId(null);
          return;
        }
      } else {
        const originalItem = order.items.find((orderItem) => orderItem.id === item.id);
        const { error } = await updateOrderItem(item.id, payload);
        if (error) {
          setMessage(`${error.message}。保存明细失败，请确认管理员权限 SQL 已执行。`);
          setSavingId(null);
          return;
        }
        if (originalItem) {
          const { error: syncError } = await syncOrderItemIdentity(
            order.id,
            {
              po_number: originalItem.po_number || "-",
              sku: originalItem.sku || "-",
              color: originalItem.color || "未定",
              size: originalItem.size || "未定"
            },
            {
              po_number: payload.po_number,
              sku: payload.sku,
              color: payload.color,
              size: payload.size
            }
          );
          if (syncError) {
            setMessage(`${syncError.message}。明细已保存，但同步开箱/装箱/检品记录失败，请确认管理员权限 SQL 已执行。`);
            setSavingId(null);
            return;
          }
        }
      }
    }

    const totalQuantity = cleanItems.reduce((sum, item) => sum + item.quantity, 0);
    const totalInbound = cleanItems.reduce((sum, item) => sum + item.inbound_quantity, 0);
    const orderPatch = {
      customer_name: draft.customer_name.trim() || "-",
      factory_name: draft.factory_name.trim() || "-",
      inbound_date: draft.inbound_date || null,
      shipping_date: draft.shipping_date || null,
      inspection_plan: draft.inspection_plan,
      reservation_remark: draft.reservation_remark.trim() || null,
      status: draft.status,
      direct_ship: draft.direct_ship,
      po_number: uniqueSummary(cleanItems.map((item) => item.po_number), "订单号"),
      sku: uniqueSummary(cleanItems.map((item) => item.sku), "番号"),
      color: uniqueSummary(cleanItems.map((item) => item.color), "颜色"),
      size: uniqueSummary(cleanItems.map((item) => item.size), "尺码"),
      quantity: totalQuantity,
      inbound_quantity: totalInbound
    };

    const { error } = await updateOrder(order.id, orderPatch);
    if (error) {
      setMessage(`${error.message}。保存订单失败，请确认管理员权限 SQL 已执行。`);
      setSavingId(null);
      return;
    }

    setMessage("订单已保存。");
    setSavingId(null);
    await load();
  }

  async function moveToTrash(order: OrderWithItems) {
    const ok = window.confirm(`确定把订单 ${order.po_number} 移入回收站吗？回收站里可以恢复。`);
    if (!ok) return;

    setMessage("");
    const { error } = await softDeleteOrder(order.id);

    if (error) {
      setMessage(`${error.message}。移入回收站失败，请确认已执行回收站 SQL。`);
      return;
    }

    setMessage("订单已移入回收站。");
    await load();
  }

  async function restoreOrder(order: OrderWithItems) {
    setMessage("");
    const { error } = await restoreOrderById(order.id);

    if (error) {
      setMessage(`${error.message}。恢复失败，请确认已执行回收站 SQL。`);
      return;
    }

    setMessage("订单已恢复。");
    await load();
  }

  async function permanentlyDeleteOrder(order: OrderWithItems) {
    const ok = window.confirm(`确定永久删除订单 ${order.po_number} 吗？这个操作不能恢复。`);
    if (!ok) return;

    setMessage("");
    const { error } = await deleteOrderById(order.id);

    if (error) {
      setMessage(`${error.message}。永久删除失败，请确认管理员删除权限 SQL 已执行。`);
      return;
    }

    setMessage("订单已永久删除。");
    await load();
  }

  function renderOrder(order: OrderWithItems) {
    const draft = drafts[order.id];
    if (!draft) return null;

    const colorGroups = groupItemsByColor(draft.items);
    const plannedTotal = itemTotal(draft.items, "quantity");
    const inboundTotal = itemTotal(draft.items, "inbound_quantity");
    const isExpanded = expandedOrders[order.id] ?? false;
    const firstItem = draft.items[0];
    const poSummary = order.po_number || firstItem?.po_number || "-";
    const skuSummary = order.sku || firstItem?.sku || "-";

    return (
      <article key={order.id} className="panel p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-black">{draft.customer_name || "-"}</h3>
              <StatusBadge status={draft.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              订单号 {poSummary} / 番号 {skuSummary}
            </p>
            <p className="mt-1 text-xs font-bold text-blue-700">
              工厂 {draft.factory_name || "-"} / 总数 {plannedTotal} 双 / 已入 {inboundTotal} 双
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold text-blue-700">总数</p>
            <p className="text-xl font-black text-blue-950">{plannedTotal}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setExpandedOrders((current) => ({ ...current, [order.id]: !isExpanded }))}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-black text-blue-800"
        >
          {isExpanded ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          {isExpanded ? "收起订单明细" : "展开颜色尺码和编辑"}
        </button>

        {isExpanded && (
          <>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">预约</p>
                <p className="font-black text-blue-950">{plannedTotal}</p>
              </div>
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">已入</p>
                <p className="font-black text-blue-950">{inboundTotal}</p>
              </div>
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">颜色</p>
                <p className="font-black text-blue-950">{colorGroups.length}</p>
              </div>
            </div>

            <section className="mt-4 rounded border border-line bg-blue-50 p-3">
              <h4 className="mb-3 font-black text-blue-950">订单基础信息</h4>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">
                  客户名称
                  <input className="field mt-1" value={draft.customer_name} onChange={(event) => patchDraft(order.id, { customer_name: event.target.value })} />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  工厂名称
                  <input className="field mt-1" value={draft.factory_name} onChange={(event) => patchDraft(order.id, { factory_name: event.target.value })} />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  来货日期
                  <input type="date" className="field mt-1" value={draft.inbound_date} onChange={(event) => patchDraft(order.id, { inbound_date: event.target.value })} />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  出货日期
                  <input type="date" className="field mt-1" value={draft.shipping_date} onChange={(event) => patchDraft(order.id, { shipping_date: event.target.value })} />
                </label>
                <label className="text-sm font-bold text-slate-700">
                  检品类型
                  <select className="field mt-1" value={draft.inspection_plan} onChange={(event) => patchDraft(order.id, { inspection_plan: event.target.value as InspectionPlan })}>
                    {PLAN_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700">
                  订单状态
                  <select className="field mt-1" value={draft.status} onChange={(event) => patchDraft(order.id, { status: event.target.value as OrderStatus })}>
                    {ORDER_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-bold text-slate-700 md:col-span-2">
                  备注提示
                  <textarea
                    className="field mt-1 min-h-20 resize-none"
                    value={draft.reservation_remark}
                    onChange={(event) => patchDraft(order.id, { reservation_remark: event.target.value })}
                    placeholder="会显示在检品和X线页面，提醒现场人员"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 md:col-span-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={draft.direct_ship}
                    onChange={(event) => patchDraft(order.id, { direct_ship: event.target.checked })}
                  />
                  直接出货（不参与检品排程）
                </label>
              </div>
            </section>

            <section className="mt-4 rounded border border-line bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="font-black text-blue-950">订单明细</h4>
                <button type="button" onClick={() => addItem(order)} className="secondary-btn h-10 px-3 text-sm">
                  <Plus size={16} />
                  加明细
                </button>
              </div>

              <div className="space-y-3">
                {draft.items.map((item, index) => (
                  <div key={item.id} className="rounded border border-line bg-blue-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-black text-blue-950">明细 {index + 1}</p>
                      <button type="button" onClick={() => removeItem(order.id, item)} className="icon-btn text-red-700" aria-label="删除明细">
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                      <input className="field" value={item.po_number} onChange={(event) => patchItem(order.id, item.id, { po_number: event.target.value })} placeholder="订单号" />
                      <input className="field" value={item.sku} onChange={(event) => patchItem(order.id, item.id, { sku: event.target.value })} placeholder="番号" />
                      <input className="field" value={item.color} onChange={(event) => patchItem(order.id, item.id, { color: event.target.value })} placeholder="颜色" />
                      <input className="field" value={item.size} onChange={(event) => patchItem(order.id, item.id, { size: event.target.value })} placeholder="尺码" />
                      <input type="number" min="0" className="field" value={item.quantity} onChange={(event) => patchItem(order.id, item.id, { quantity: event.target.value })} placeholder="预约双数" />
                      <input
                        type="number"
                        min="0"
                        className="field"
                        value={item.inbound_quantity}
                        onChange={(event) => patchItem(order.id, item.id, { inbound_quantity: event.target.value })}
                        placeholder="已入双数"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        min="0"
                        className="field"
                        value={item.submitted_quantity}
                        onChange={(event) => patchItem(order.id, item.id, { submitted_quantity: event.target.value })}
                        placeholder="送检双数"
                      />
                      <select
                        className="field"
                        value={item.submit_status}
                        onChange={(event) => patchItem(order.id, item.id, { submit_status: event.target.value as SubmitStatus })}
                      >
                        <option value="pending">待送检</option>
                        <option value="ready">可送检</option>
                        <option value="paused">暂停送检</option>
                      </select>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        className="field"
                        value={item.style_factor}
                        onChange={(event) => patchItem(order.id, item.id, { style_factor: event.target.value })}
                        placeholder="款式系数"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="mt-4 space-y-2">
              {colorGroups.map((group) => (
                <section key={group.color} className="rounded border border-line bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h4 className="font-black text-blue-950">{group.color}</h4>
                    <p className="text-xs font-bold text-blue-700">
                      预约 {group.planned} / 已入 {group.inbound}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {group.items.map((item) => (
                      <div key={item.id} className="rounded bg-blue-50 px-2 py-2 text-sm">
                        <p className="font-black">尺码 {item.size || "未定"}</p>
                        <p className="text-xs text-slate-500">
                          {toNumber(item.quantity)} / 已入 {toNumber(item.inbound_quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <button type="button" onClick={() => saveOrder(order)} disabled={savingId === order.id} className="primary-btn">
                <Save size={16} />
                {savingId === order.id ? "保存中" : "保存修改"}
              </button>
              {draft.status === "已完成" ? (
                <button type="button" onClick={() => updateStatus(order.id, "未开始")} className="secondary-btn">
                  <RotateCcw size={16} />
                  恢复状态
                </button>
              ) : (
                <button type="button" onClick={() => updateStatus(order.id, "已完成")} className="secondary-btn">
                  <Archive size={16} />
                  出货完成
                </button>
              )}
              <Link href={`/inspect/${order.id}`} className="secondary-btn">
                检品
              </Link>
              <Link href={`/ship/${order.id}`} className="secondary-btn">
                <Truck size={16} />
                装箱
              </Link>
              <button type="button" onClick={() => moveToTrash(order)} className="secondary-btn border-red-200 text-red-700">
                <Trash2 size={16} />
                移入回收站
              </button>
            </div>
          </>
        )}
      </article>
    );
  }

  function renderTrashOrder(order: OrderWithItems) {
    const draft = drafts[order.id] ?? buildDraft(order);
    const plannedTotal = itemTotal(draft.items, "quantity");
    const firstItem = draft.items[0];
    const poSummary = order.po_number || firstItem?.po_number || "-";
    const skuSummary = order.sku || firstItem?.sku || "-";

    return (
      <article key={order.id} className="panel border-red-100 bg-red-50/40 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-blue-950">{draft.customer_name || "-"}</h3>
            <p className="mt-1 text-sm text-slate-600">
              订单号 {poSummary} / 番号 {skuSummary}
            </p>
            <p className="mt-1 text-xs font-bold text-red-700">已进入回收站 / 总数 {plannedTotal} 双</p>
          </div>
          <div className="shrink-0 rounded bg-red-100 px-2 py-1 text-xs font-black text-red-700">回收站</div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => restoreOrder(order)} className="secondary-btn">
            <Undo2 size={16} />
            恢复订单
          </button>
          <button type="button" onClick={() => permanentlyDeleteOrder(order)} className="secondary-btn border-red-200 text-red-700">
            <Trash2 size={16} />
            永久删除
          </button>
        </div>
      </article>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <section className="panel p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded bg-blue-50 text-blue-700">
            <ShieldAlert size={26} />
          </div>
          <h1 className="text-xl font-black text-blue-950">只有管理员可以打开总单管理</h1>
          <p className="mt-2 text-sm text-slate-500">这里可以修改和删除订单，所以只开放给最高权限账号。</p>
          <Link href="/orders" className="secondary-btn mt-4">
            返回订单列表
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-machine/10 px-2.5 py-1 text-xs font-semibold text-machine">
          <Archive size={14} />
          管理员
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">总单管理</h1>
        <p className="mt-1 text-sm text-blue-700">默认只看客户、订单号、番号和总数；展开后编辑颜色、尺码和数量。删除会先进入回收站。</p>
      </div>
      {message && (
        <p className={`rounded px-3 py-2 text-sm font-bold ${message.includes("已") ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{message}</p>
      )}

      {loading && <div className="panel p-5 text-sm text-slate-500">正在加载订单...</div>}

      {!loading && (
        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-blue-950">出货批次（总单编号 / 总体备注）</h2>
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-black text-blue-800">{batchGroups.length} 批</span>
            </div>
            <p className="text-xs text-slate-500">同一客户 + 同一出货日期的所有订单算一批。在这里填写总单编号（如 CVT260925）和总体备注（如 迪海9月15号出货），保存后订单列表中会显示。</p>
            {batchGroups.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无有出货日期的订单。</div>}
            <div className="space-y-2">
              {batchGroups.map((group) => {
                const key = `${group.customerName}|${group.shippingDate ?? "none"}`;
                const draft = batchDrafts[key] ?? { batch_no: group.batchNo ?? "", remark: group.batchRemark ?? "" };
                return (
                  <div key={key} className="rounded-xl border border-line/80 bg-white p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-blue-700 px-2 py-1 text-xs font-black text-white">{group.customerName}</span>
                      <span className="inline-flex items-center gap-1 text-xs font-black text-blue-900">
                        <CalendarDays size={13} />
                        {group.shippingDate ?? (group.shippingDateTbd ? "待定" : "未设置")}
                      </span>
                      <span className="text-xs font-bold text-slate-500">{group.orders.length} 单 / 共 {group.totalQuantity} 双</span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.6fr_auto]">
                      <input
                        className="field h-9 px-2 py-1 text-xs"
                        placeholder="总单编号，如 CVT260925"
                        value={draft.batch_no}
                        onChange={(event) => patchBatchDraft(key, { batch_no: event.target.value })}
                      />
                      <input
                        className="field h-9 px-2 py-1 text-xs"
                        placeholder="总体备注，如 迪海9月15号出货"
                        value={draft.remark}
                        onChange={(event) => patchBatchDraft(key, { remark: event.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => saveBatch(key, group)}
                        disabled={savingBatch === key}
                        className="secondary-btn h-9 px-3 text-xs"
                      >
                        <Save size={14} />
                        {savingBatch === key ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-blue-950">客户订单</h2>
                <span className="rounded bg-blue-100 px-2 py-1 text-xs font-black text-blue-800">{normalOrders.length} 个</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {batchMode && <span className="text-xs font-black text-blue-800">已选择 {selectedOrders.length} 个订单 · {selectedQuantity}双</span>}
                <button
                  type="button"
                  onClick={() => {
                    setBatchMode((value) => !value);
                    setSelectedIds(new Set());
                  }}
                  className={`secondary-btn h-9 px-3 text-xs ${batchMode ? "border-machine text-machine" : ""}`}
                >
                  {batchMode ? "退出批量管理" : "批量管理"}
                </button>
                {batchMode && (
                  <button type="button" disabled={selectedOrders.length === 0 || deleting} onClick={requestSelectedDelete} className="secondary-btn h-9 border-red-200 px-3 text-xs text-red-700">
                    <Trash2 size={14} />
                    删除选中订单
                  </button>
                )}
              </div>
            </div>

            {normalOrders.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无订单。</div>}

            {customerGroups.map((group) => {
              const customerExpanded = expandedCustomers[group.customerName] ?? true;
              const dateGroups = buildShipmentBatchGroups(group.orders, batchMap);
              return (
                <section key={group.customerName} className="overflow-hidden rounded-2xl border border-blue-200 bg-blue-50/70">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleCustomer(group.customerName)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") toggleCustomer(group.customerName);
                    }}
                    className="flex cursor-pointer flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-100/80 px-3 py-2.5"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-blue-700">{customerExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                      <span className="text-base font-black text-blue-950">{group.customerName}</span>
                      <span className="text-xs font-bold text-blue-800">{group.orders.length}单 · {group.totalQuantity}双</span>
                    </span>
                    {batchMode && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          requestCustomerDelete({ customerName: group.customerName, orderCount: group.orders.length, totalQuantity: group.totalQuantity });
                        }}
                        disabled={deleting}
                        className="secondary-btn h-8 border-red-200 px-2.5 text-xs text-red-700"
                      >
                        <Trash2 size={13} />
                        删除该客户全部订单
                      </button>
                    )}
                  </div>

                  {customerExpanded && (
                    <div className="space-y-2 p-2">
                      {dateGroups.map((dateGroup) => {
                        const dateKey = `${dateGroup.customerName}|${dateGroup.shippingDate ?? "none"}`;
                        const dateExpanded = expandedDates[dateKey] ?? false;
                        const dateOrderIds = dateGroup.orders.map((order) => order.id);
                        const allSelected = dateOrderIds.length > 0 && dateOrderIds.every((id) => selectedIds.has(id));
                        return (
                          <section key={dateKey} className="overflow-hidden rounded-xl border border-blue-200 bg-white/70">
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => toggleDate(dateKey)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") toggleDate(dateKey);
                              }}
                              className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2"
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-blue-700">{dateExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                                <span className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-2 py-0.5 text-[11px] font-black text-white">
                                  <CalendarDays size={12} />
                        {dateGroup.shippingDate ? `出货 ${dateGroup.shippingDate}` : dateGroup.shippingDateTbd ? "出货日期待定" : "未设置出货日期"}
                                </span>
                                <span className="text-xs font-bold text-blue-900">{dateGroup.orders.length}单 · {dateGroup.totalQuantity}双</span>
                              </span>
                              {batchMode && (
                                <span className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
                                  <label className="flex cursor-pointer items-center gap-1 text-[11px] font-bold text-slate-600">
                                    <input type="checkbox" checked={allSelected} onChange={() => toggleDateSelect(dateOrderIds)} />
                                    全选本日期
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      requestDateDelete({
                                        customerName: dateGroup.customerName,
                                        shippingDate: dateGroup.shippingDate,
                                        orderCount: dateGroup.orders.length,
                                        totalQuantity: dateGroup.totalQuantity
                                      })
                                    }
                                    disabled={deleting}
                                    className="secondary-btn h-8 border-red-200 px-2.5 text-xs text-red-700"
                                  >
                                    <Trash2 size={13} />
                                    删除本日期全部订单
                                  </button>
                                </span>
                              )}
                            </div>
                            {dateExpanded && (
                              <div className="page-enter space-y-2 border-t border-blue-200/70 p-2">
                                {dateGroup.orders.map((order) => (
                                  <div key={order.id} className="space-y-1">
                                    {batchMode && (
                                      <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-600">
                                        <input type="checkbox" checked={selectedIds.has(order.id)} onChange={() => toggleSelect(order.id)} />
                                        {order.po_number}
                                      </label>
                                    )}
                                    {renderOrder(order as OrderWithItems)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-red-700">回收站</h2>
              <span className="rounded bg-red-100 px-2 py-1 text-xs font-black text-red-700">{trashedOrders.length} 个</span>
            </div>
            {trashedOrders.length === 0 && <div className="panel p-4 text-sm text-slate-500">回收站为空。</div>}
            {trashedOrders.map(renderTrashOrder)}
          </section>
        </div>
      )}

      <Modal open={Boolean(bulkConfirm)} onClose={() => { if (!deleting) setBulkConfirm(null); }} size="md">
        {bulkConfirm && (
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              {bulkConfirm.kind === "customer" && "即将删除该客户全部订单"}
              {bulkConfirm.kind === "date" && "即将删除该出货日期下全部订单"}
              {bulkConfirm.kind === "orders" && "即将删除选中订单"}
            </h3>
            <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              {bulkConfirm.kind === "orders" && bulkConfirm.orderIds.length > 0 && (
                <p className="max-h-28 overflow-y-auto rounded-lg bg-white p-2 text-[13px] text-slate-700">
                  {selectedOrders.slice(0, 12).map((order) => order.po_number).join("、")}
                  {selectedOrders.length > 12 ? ` 等 ${selectedOrders.length} 单` : ""}
                </p>
              )}
              {bulkConfirm.customerName && <p>客户：<span className="font-bold">{bulkConfirm.customerName}</span></p>}
              {bulkConfirm.shippingDate && <p>出货日期：<span className="font-bold">{bulkConfirm.shippingDate}</span></p>}
              <p>订单：<span className="font-bold">{bulkConfirm.orderCount} 单</span></p>
              <p>数量：<span className="font-bold">{bulkConfirm.totalQuantity} 双</span></p>
            </div>
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
              此操作将删除该客户下符合条件的订单及其相关业务数据，请确认。已产生检品/出货/装箱等业务记录的订单会被保护，不会删除。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" disabled={deleting} onClick={() => setBulkConfirm(null)} className="secondary-btn">
                取消
              </button>
              <button type="button" disabled={deleting} onClick={confirmBulkDelete} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition-colors duration-150 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                <Trash2 size={15} />
                {deleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
