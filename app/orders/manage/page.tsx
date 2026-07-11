"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { useCurrentProfile, useCurrentUser } from "@/components/AuthGuard";
import type { InspectionPlan, Order, OrderItem, OrderStatus } from "@/lib/types";
import { deleteOrder as deleteOrderById, deleteOrderItems, getOrdersWithItems, insertOrderItems, restoreOrder as restoreOrderById, softDeleteOrder, updateOrder, updateOrderItem } from "@/src/api/ordersApi";
import { Archive, ChevronDown, ChevronRight, Plus, RotateCcw, Save, ShieldAlert, Trash2, Truck, Undo2 } from "lucide-react";
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
  items: EditableItem[];
  deletedItemIds: string[];
};

const ADMIN_EMAIL = "shuoyuqc@163.com";
const STATUS_OPTIONS = ["未开始", "检品中", "已完成"] as OrderStatus[];
const PLAN_OPTIONS: { value: InspectionPlan; label: string }[] = [
  { value: "both", label: "检品 + X线" },
  { value: "normal", label: "只做检品" },
  { value: "xray", label: "只做X线" }
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
    inbound_quantity: "0"
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
        inbound_quantity: String(item.inbound_quantity || 0)
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
  const [drafts, setDrafts] = useState<Record<string, EditableOrder>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [expandedOrders, setExpandedOrders] = useState<Record<string, boolean>>({});

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await getOrdersWithItems(true);

    if (error || !data) {
      setMessage(`${error?.message}。请确认数据表和管理员权限 SQL 已执行。`);
      setLoading(false);
      return;
    }

    const nextOrders = data as OrderWithItems[];

    setOrders(nextOrders);
    setDrafts(Object.fromEntries(nextOrders.map((order) => [order.id, buildDraft(order)])));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const normalOrders = useMemo(() => orders.filter((order) => !order.deleted_at), [orders]);
  const activeOrders = useMemo(() => normalOrders.filter((order) => !isCompleted(order)), [normalOrders]);
  const shippedOrders = useMemo(() => normalOrders.filter((order) => isCompleted(order)), [normalOrders]);
  const trashedOrders = useMemo(() => orders.filter((order) => Boolean(order.deleted_at)), [orders]);

  function patchDraft(orderId: string, patch: Partial<EditableOrder>) {
    setDrafts((current) => ({
      ...current,
      [orderId]: {
        ...current[orderId],
        ...patch
      }
    }));
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
      return {
        ...item,
        po_number: item.po_number.trim(),
        sku: item.sku.trim(),
        color: item.color.trim(),
        size: item.size.trim(),
        quantity,
        inbound_quantity: inboundQuantity
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
        inbound_quantity: item.inbound_quantity
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
        const { error } = await updateOrderItem(item.id, payload);
        if (error) {
          setMessage(`${error.message}。保存明细失败，请确认管理员权限 SQL 已执行。`);
          setSavingId(null);
          return;
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
                    {STATUS_OPTIONS.map((status) => (
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
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <Archive size={14} />
          管理员
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">总单管理</h1>
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
              <h2 className="text-lg font-black text-blue-950">现有订单</h2>
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-black text-blue-800">{activeOrders.length} 个</span>
            </div>
            {activeOrders.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无现有订单。</div>}
            {activeOrders.map(renderOrder)}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-blue-950">已出货订单</h2>
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-black text-blue-800">{shippedOrders.length} 个</span>
            </div>
            {shippedOrders.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无已出货订单。</div>}
            {shippedOrders.map(renderOrder)}
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
    </div>
  );
}
