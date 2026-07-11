"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { getActiveOrders } from "@/src/api/ordersApi";
import { getAllShipmentItems } from "@/src/api/shipmentApi";
import { buildPackingOrders, getAvailableQuantity, getRemainingPackingQuantity, groupPackingOrdersByCustomer, type OrderWithPacking } from "@/src/services/shipmentService";
import type { Order, ShipmentItem } from "@/lib/types";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function PackingHomePage() {
  const [orders, setOrders] = useState<OrderWithPacking[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      setMessage("");

      const [{ data: orderRows, error: orderError }, { data: shipmentRows, error: shipmentError }] = await Promise.all([getActiveOrders(), getAllShipmentItems()]);

      if (orderError || shipmentError) {
        setMessage(`${orderError?.message ?? shipmentError?.message}。请确认 Supabase 已执行装箱表 SQL。`);
        setLoading(false);
        return;
      }

      setOrders(buildPackingOrders((orderRows ?? []) as Order[], (shipmentRows ?? []) as ShipmentItem[]));
      setLoading(false);
    }

    load();
  }, []);

  const groups = useMemo(() => groupPackingOrdersByCustomer(orders), [orders]);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <PackageCheck size={14} />
          装箱
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">装箱订单</h1>
        <p className="mt-1 text-sm text-blue-700">按客户分类，进入订单后按箱号录入颜色、尺码和数量。</p>
      </div>

      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</p>}
      {loading && <div className="panel p-5 text-sm text-slate-500">正在加载装箱订单...</div>}
      {!loading && orders.length === 0 && <div className="panel p-5 text-sm text-slate-500">还没有订单可以装箱。</div>}

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
                  <p className="text-xs font-bold text-blue-700">可装 / 已装</p>
                  <p className="text-xl font-black text-blue-950">
                    {group.totalInbound} / {group.totalPacked}
                  </p>
                </div>
              </div>
            </div>

            {group.orders.map((order) => {
              const available = getAvailableQuantity(order);
              const remaining = getRemainingPackingQuantity(order);

              return (
                <article key={order.id} className="panel p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-lg font-black">{order.po_number}</h3>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        出货 {order.shipping_date ?? "-"} / 创建 {shortDate(order.created_at)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-bold text-blue-700">未装</p>
                      <p className="text-xl font-black text-blue-950">{remaining}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border border-line bg-blue-50 p-2">
                      <p className="text-xs font-bold text-slate-500">预约</p>
                      <p className="font-black text-blue-950">{order.quantity}</p>
                    </div>
                    <div className="rounded border border-line bg-blue-50 p-2">
                      <p className="text-xs font-bold text-slate-500">已入</p>
                      <p className="font-black text-blue-950">{available}</p>
                    </div>
                    <div className="rounded border border-line bg-blue-50 p-2">
                      <p className="text-xs font-bold text-slate-500">已装</p>
                      <p className="font-black text-blue-950">{order.packed_quantity}</p>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="font-bold text-slate-500">番号</dt>
                      <dd className="mt-1 truncate">{order.sku}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-slate-500">工厂</dt>
                      <dd className="mt-1 truncate">{order.factory_name}</dd>
                    </div>
                  </dl>

                  <Link href={`/ship/${order.id}`} className="primary-btn mt-4 w-full">
                    <PackageCheck size={18} />
                    箱号装箱
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
