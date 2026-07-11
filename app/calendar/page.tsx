"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { getActiveOrders } from "@/src/api/ordersApi";
import { buildCalendarDays, buildOrderDaySummaries, getOrdersByInboundDate, getOrdersByShippingDate, monthLabel, toDateKey } from "@/src/services/orderService";
import type { Order } from "@/lib/types";
import { ArrowLeft, ArrowRight, CalendarDays, PackageCheck, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function CalendarPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  useEffect(() => {
    async function load() {
      const { data } = await getActiveOrders();
      setOrders((data ?? []) as Order[]);
      setLoading(false);
    }

    load();
  }, []);

  const summaries = useMemo(() => buildOrderDaySummaries(orders), [orders]);
  const calendarDays = useMemo(() => buildCalendarDays(currentMonth), [currentMonth]);
  const selectedInbound = useMemo(() => getOrdersByInboundDate(orders, selectedDate), [orders, selectedDate]);
  const selectedShipping = useMemo(() => getOrdersByShippingDate(orders, selectedDate), [orders, selectedDate]);

  function shiftMonth(offset: number) {
    setCurrentMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-slate-800 bg-slate-950 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded bg-safety text-slate-950">
            <CalendarDays size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-normal">订单日历</h1>
            <p className="mt-1 text-sm text-slate-300">查看每天入库了多少订单，以及哪些订单要出货。</p>
          </div>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-3">
          <button type="button" onClick={() => shiftMonth(-1)} className="secondary-btn min-h-10 px-3 py-2" aria-label="上个月">
            <ArrowLeft size={16} />
          </button>
          <div className="text-center">
            <p className="text-lg font-black">{monthLabel(currentMonth)}</p>
            <button type="button" onClick={() => {
              const today = new Date();
              setCurrentMonth(today);
              setSelectedDate(toDateKey(today));
            }} className="mt-1 text-xs font-bold text-machine">
              回到今天
            </button>
          </div>
          <button type="button" onClick={() => shiftMonth(1)} className="secondary-btn min-h-10 px-3 py-2" aria-label="下个月">
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-7 border-b border-line bg-slate-50 text-center text-xs font-black text-slate-500">
          {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
            <div key={day} className="py-2">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {calendarDays.map((date) => {
            const key = toDateKey(date);
            const summary = summaries.get(key);
            const inMonth = date.getMonth() === currentMonth.getMonth();
            const selected = key === selectedDate;

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={`min-h-24 border-b border-r border-line p-1 text-left ${selected ? "bg-amber-50" : "bg-white"} ${inMonth ? "" : "text-slate-300"}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`grid h-7 w-7 place-items-center rounded text-sm font-black ${selected ? "bg-safety text-slate-950" : ""}`}>{date.getDate()}</span>
                </div>
                {summary && (
                  <div className="mt-1 space-y-1 text-[11px] font-bold">
                    {summary.inboundCount > 0 && (
                      <div className="rounded bg-teal-50 px-1.5 py-1 text-teal-800">入 {summary.inboundCount}单 / {summary.inboundQty}件</div>
                    )}
                    {summary.shippingCount > 0 && (
                      <div className="rounded bg-amber-50 px-1.5 py-1 text-amber-800">出 {summary.shippingCount}单 / {summary.shippingQty}件</div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <PackageCheck size={18} className="text-machine" />
            <h2 className="font-black">{selectedDate} 入库订单</h2>
          </div>
          {loading && <p className="text-sm text-slate-500">正在加载...</p>}
          {!loading && selectedInbound.length === 0 && <p className="text-sm text-slate-500">当天没有入库订单。</p>}
          <div className="space-y-2">
            {selectedInbound.map((order) => <OrderRow key={order.id} order={order} />)}
          </div>
        </div>

        <div className="panel p-4">
          <div className="mb-3 flex items-center gap-2">
            <Truck size={18} className="text-amber-700" />
            <h2 className="font-black">{selectedDate} 出货订单</h2>
          </div>
          {loading && <p className="text-sm text-slate-500">正在加载...</p>}
          {!loading && selectedShipping.length === 0 && <p className="text-sm text-slate-500">当天没有出货订单。</p>}
          <div className="space-y-2">
            {selectedShipping.map((order) => <OrderRow key={order.id} order={order} />)}
          </div>
        </div>
      </section>
    </div>
  );
}

function OrderRow({ order }: { order: Order }) {
  return (
    <Link href={`/inspect/${order.id}`} className="block rounded border border-line bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-black">{order.po_number}</p>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 truncate text-sm text-slate-500">
            {order.customer_name} · 番号 {order.sku}
          </p>
        </div>
        <p className="shrink-0 text-lg font-black">{order.quantity}</p>
      </div>
    </Link>
  );
}
