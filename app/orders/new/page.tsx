"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import type { Order, OrderItem } from "@/lib/types";
import { getInboundCandidateOrders, getOrderItems, updateOrder, updateOrderItem } from "@/src/api/ordersApi";
import { CheckSquare, PackagePlus, Save } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type InboundInput = Record<string, string>;

function remainingQty(item: OrderItem) {
  return Math.max(0, Number(item.quantity || 0) - Number(item.inbound_quantity || 0));
}

export default function NewInboundPage() {
  const user = useCurrentUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [inboundDate, setInboundDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inputs, setInputs] = useState<InboundInput>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user) return;

    async function load() {
      const { data } = await getInboundCandidateOrders();
      const rows = (data ?? []) as Order[];
      setOrders(rows);
      setSelectedOrderId((current) => current || rows[0]?.id || "");
    }

    load();
  }, [user]);

  useEffect(() => {
    async function loadItems() {
      if (!selectedOrderId) {
        setItems([]);
        return;
      }

      const { data } = await getOrderItems(selectedOrderId);
      setItems(((data ?? []) as OrderItem[]).filter((item) => remainingQty(item) > 0));
      setInputs({});
    }

    loadItems();
  }, [selectedOrderId]);

  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const inboundTotal = useMemo(() => Object.values(inputs).reduce((sum, value) => sum + Number(value || 0), 0), [inputs]);
  const groupedItems = useMemo(() => {
    const groups = new Map<string, OrderItem[]>();
    for (const item of items) {
      const key = `${item.po_number || selectedOrder?.po_number || ""}__${item.sku || selectedOrder?.sku || ""}__${item.color}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }

    return Array.from(groups.entries()).map(([key, groupItems]) => {
      const [poNumber, sku, color] = key.split("__");
      return {
        key,
        poNumber,
        sku,
        color,
        planned: groupItems.reduce((sum, item) => sum + item.quantity, 0),
        inbound: groupItems.reduce((sum, item) => sum + Number(item.inbound_quantity || 0), 0),
        remaining: groupItems.reduce((sum, item) => sum + remainingQty(item), 0),
        items: groupItems
      };
    });
  }, [items, selectedOrder]);

  function updateInput(item: OrderItem, value: string) {
    const max = remainingQty(item);
    const next = Math.max(0, Math.min(max, Number(value || 0)));
    setInputs((current) => ({ ...current, [item.id]: value === "" ? "" : String(next) }));
  }

  function fillItem(item: OrderItem) {
    setInputs((current) => ({ ...current, [item.id]: String(remainingQty(item)) }));
  }

  function fillGroup(groupItems: OrderItem[]) {
    setInputs((current) => ({
      ...current,
      ...Object.fromEntries(groupItems.map((item) => [item.id, String(remainingQty(item))]))
    }));
  }

  function fillAll() {
    setInputs(Object.fromEntries(items.map((item) => [item.id, String(remainingQty(item))])));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !selectedOrder || inboundTotal <= 0) return;

    const inboundRows = items
      .map((item) => ({ item, quantity: Number(inputs[item.id] || 0) }))
      .filter((row) => row.quantity > 0);

    setSaving(true);
    setMessage("");

    for (const row of inboundRows) {
      const { error } = await updateOrderItem(row.item.id, { inbound_quantity: Number(row.item.inbound_quantity || 0) + row.quantity });

      if (error) {
        setSaving(false);
        setMessage(`${error.message}。请确认 Supabase 已执行最新 schema.sql。`);
        return;
      }
    }

    const nextInbound = Number(selectedOrder.inbound_quantity || 0) + inboundTotal;
    const { error: orderError } = await updateOrder(selectedOrder.id, {
        inbound_quantity: nextInbound,
        inbound_date: inboundDate || selectedOrder.inbound_date,
        order_type: "reservation"
      });

    if (orderError) {
      setSaving(false);
      setMessage(`${orderError.message}。请确认 Supabase 已执行最新 schema.sql。`);
      return;
    }

    setSaving(false);
    setMessage(`本次入库已保存：${inboundTotal} 双`);
    setOrders((current) =>
      current
        .map((order) => (order.id === selectedOrder.id ? { ...order, inbound_quantity: nextInbound, inbound_date: inboundDate || order.inbound_date } : order))
        .filter((order) => Number(order.inbound_quantity || 0) < Number(order.quantity || 0))
    );
    setItems((current) =>
      current
        .map((item) => ({ ...item, inbound_quantity: Number(item.inbound_quantity || 0) + Number(inputs[item.id] || 0) }))
        .filter((item) => remainingQty(item) > 0)
    );
    setInputs({});
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <PackagePlus size={14} />
          分批入库
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">按预约订单入库</h1>
        <p className="mt-1 text-sm text-blue-700">货到多少就录多少，系统自动累计已入库和未入库数量。</p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <section className="panel grid gap-4 p-4 md:grid-cols-[1fr_180px]">
          <div>
            <label className="label" htmlFor="order">
              预约订单
            </label>
            <select id="order" className="field mt-2" value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)} required>
              {orders.length === 0 && <option value="">暂无未入完的预约订单</option>}
              {orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.customer_name} / {order.po_number} / 出货 {order.shipping_date ?? "-"} / 未入 {order.quantity - Number(order.inbound_quantity || 0)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="inbound_date">
              本次来货日期
            </label>
            <input id="inbound_date" className="field mt-2" type="date" value={inboundDate} onChange={(event) => setInboundDate(event.target.value)} />
          </div>
        </section>

        {selectedOrder && (
          <section className="grid grid-cols-3 gap-3">
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">预约总数</p>
              <p className="mt-1 text-2xl font-black text-blue-950">{selectedOrder.quantity}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">已入库</p>
              <p className="mt-1 text-2xl font-black text-blue-950">{selectedOrder.inbound_quantity || 0}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">未入库</p>
              <p className="mt-1 text-2xl font-black text-blue-950">{selectedOrder.quantity - Number(selectedOrder.inbound_quantity || 0)}</p>
            </div>
          </section>
        )}

        {selectedOrder && (
          <button type="button" onClick={fillAll} className="secondary-btn w-full">
            <CheckSquare size={18} />
            全部一键入满
          </button>
        )}

        <section className="space-y-3">
          {groupedItems.map((group) => (
            <article key={group.key} className="panel p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-black">{group.color}</h2>
                  <p className="mt-1 text-xs font-bold text-blue-700">
                    订单号 {group.poNumber} / 番号 {group.sku}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs font-bold text-slate-500">
                  <p>总 {group.planned}</p>
                  <p>已入 {group.inbound}</p>
                  <p className="text-blue-800">未入 {group.remaining}</p>
                </div>
              </div>

              <button type="button" onClick={() => fillGroup(group.items)} className="secondary-btn mb-3 w-full">
                <CheckSquare size={18} />
                本组一键入满
              </button>

              <div className="space-y-2">
                {group.items.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_90px_110px] items-center gap-2 rounded border border-line bg-blue-50 p-2">
                    <div>
                      <p className="font-black">尺码 {item.size}</p>
                      <p className="text-xs text-slate-500">
                        预约 {item.quantity} / 已入 {item.inbound_quantity || 0} / 未入 {remainingQty(item)}
                      </p>
                    </div>
                    <button type="button" onClick={() => fillItem(item)} className="h-11 rounded border border-blue-200 bg-white px-2 text-xs font-black text-blue-700">
                      入满
                    </button>
                    <input
                      className="field text-center text-lg font-black"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={remainingQty(item)}
                      value={inputs[item.id] ?? ""}
                      onChange={(event) => updateInput(item, event.target.value)}
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </article>
          ))}

          {selectedOrder && groupedItems.length === 0 && <div className="panel p-5 text-sm text-slate-500">这个预约订单已经全部入库。</div>}
        </section>

        {message && <p className="rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}

        <button type="submit" className="primary-btn w-full" disabled={saving || inboundTotal <= 0 || !selectedOrder}>
          <Save size={18} />
          保存本次入库：{inboundTotal} 双
        </button>
      </form>
    </div>
  );
}
