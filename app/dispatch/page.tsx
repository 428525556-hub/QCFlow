"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { getAllDispatchRecords } from "@/src/api/dispatchApi";
import { getActiveOrders } from "@/src/api/ordersApi";
import { getAllShipmentCartons, getAllShipmentItems } from "@/src/api/shipmentApi";
import { buildDispatchOrders, getAvailableQuantity, groupDispatchOrdersByCustomer, isDispatchQuantityMatched, type DispatchOrder } from "@/src/services/shipmentService";
import type { DispatchRecord, Order, ShipmentCarton, ShipmentItem } from "@/lib/types";
import { CheckCircle2, PackageCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function DispatchPage() {
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      const [{ data: orderRows, error: orderError }, { data: cartonRows, error: cartonError }, { data: itemRows, error: itemError }, { data: dispatchRows, error: dispatchError }] = await Promise.all([
        getActiveOrders(),
        getAllShipmentCartons(),
        getAllShipmentItems(),
        getAllDispatchRecords()
      ]);

      if (orderError || cartonError || itemError || dispatchError) {
        setMessage(`${orderError?.message || cartonError?.message || itemError?.message || dispatchError?.message}。请确认已执行出货 SQL。`);
        setLoading(false);
        return;
      }

      setOrders(buildDispatchOrders((orderRows ?? []) as Order[], (cartonRows ?? []) as ShipmentCarton[], (itemRows ?? []) as ShipmentItem[], (dispatchRows ?? []) as DispatchRecord[]));
      setLoading(false);
    }

    load();
  }, []);

  const groups = useMemo(() => groupDispatchOrdersByCustomer(orders), [orders]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <Truck size={14} />
          出货
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">出货运输</h1>
        <p className="mt-1 text-sm text-blue-700">货物搬上车辆或集装箱时，确认总箱数、总数量、差异和现场照片。</p>
      </div>

      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</p>}
      {loading && <div className="panel p-5 text-sm text-slate-500">正在加载出货订单...</div>}
      {!loading && orders.length === 0 && <div className="panel p-5 text-sm text-slate-500">还没有订单可以出货。</div>}

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.customerName} className="space-y-3">
            <div className="sticky top-0 z-10 rounded border border-blue-200 bg-blue-100/95 px-3 py-2 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-blue-950">{group.customerName}</h2>
                  <p className="text-xs font-bold text-blue-700">{group.orders.length} 个订单</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-blue-700">箱数 / 装箱数量</p>
                  <p className="text-xl font-black text-blue-950">
                    {group.totalCartons} / {group.totalPacked}
                  </p>
                </div>
              </div>
            </div>

            {group.orders.map((order) => {
              const expected = getAvailableQuantity(order);
              const matched = isDispatchQuantityMatched(order);

              return (
                <article key={order.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-black">{order.po_number}</h3>
                        <StatusBadge status={order.status} />
                        {order.dispatched && <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">已出货</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        出货 {order.shipping_date ?? "-"} / 创建 {shortDate(order.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-blue-700">是否一致</p>
                      <p className={`text-xl font-black ${matched ? "text-emerald-700" : "text-red-600"}`}>{matched ? "一致" : "不一致"}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border border-line bg-blue-50 p-2">
                      <p className="text-xs font-bold text-slate-500">应出</p>
                      <p className="font-black text-blue-950">{expected}</p>
                    </div>
                    <div className="rounded border border-line bg-blue-50 p-2">
                      <p className="text-xs font-bold text-slate-500">装箱</p>
                      <p className="font-black text-blue-950">{order.packed_quantity}</p>
                    </div>
                    <div className="rounded border border-line bg-blue-50 p-2">
                      <p className="text-xs font-bold text-slate-500">箱数</p>
                      <p className="font-black text-blue-950">{order.carton_count}</p>
                    </div>
                  </div>

                  <Link href={`/dispatch/${order.id}`} className="primary-btn mt-4 w-full">
                    {order.dispatched ? <CheckCircle2 size={18} /> : <PackageCheck size={18} />}
                    {order.dispatched ? "查看/再次提交出货" : "确认出货"}
                  </Link>
                </article>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
