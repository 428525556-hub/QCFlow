"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import { percent, todayRange } from "@/lib/format";
import { getDashboardData } from "@/src/api/ordersApi";
import { buildDashboardMetrics, findActiveOrder, type DashboardMetrics } from "@/src/services/orderService";
import type { InspectionRecord, Order } from "@/lib/types";
import { Activity, ArrowRight, CalendarDays, CheckCircle2, ClipboardList, PackageCheck, PackageOpen, PackagePlus, PackageSearch, PlayCircle, ScanLine, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function DashboardPage() {
  const user = useCurrentUser();
  const [orders, setOrders] = useState<Order[]>([]);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    async function load() {
      setLoading(true);
      const { data } = await getDashboardData();
      setOrders((data.orders ?? []) as Order[]);
      setRecords((data.records ?? []) as InspectionRecord[]);
      setLoading(false);
    }

    load();
  }, [user]);

  const metrics: DashboardMetrics = useMemo(() => {
    return buildDashboardMetrics(orders, records, todayRange());
  }, [orders, records]);

  const activeOrder = findActiveOrder(orders);
  const cards = [
    { label: "今日入库订单", value: metrics.todayOrders, icon: ClipboardList },
    { label: "今日完成检品", value: metrics.todayDone, icon: CheckCircle2 },
    { label: "总入库件数", value: metrics.totalInbound, icon: PackageSearch },
    { label: "不良率", value: percent(metrics.defectQty, metrics.totalInbound), icon: Activity }
  ];

  return (
    <div className="space-y-5">
      <section className="rounded border border-blue-900 bg-blue-950 p-5 text-white">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-sky-300">QCFlow Dashboard</p>
            <h1 className="mt-2 text-3xl font-black tracking-normal">现场工作台</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">订单入库、普通检品、X线检品和出货日程分开处理。</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-[760px] md:grid-cols-8">
            <Link href="/reservations/new" className="primary-btn bg-sky-400 text-blue-950">
              <PackageSearch size={18} />
              预约
            </Link>
            <Link href="/orders/new" className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <PackagePlus size={18} />
              入库
            </Link>
            <Link href="/unbox" className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <PackageOpen size={18} />
              开箱
            </Link>
            <Link href={activeOrder ? `/inspect/${activeOrder.id}` : "/orders"} className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <PlayCircle size={18} />
              检品
            </Link>
            <Link href={activeOrder ? `/xray/${activeOrder.id}` : "/orders"} className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <ScanLine size={18} />
              X线
            </Link>
            <Link href="/ship" className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <PackageCheck size={18} />
              装箱
            </Link>
            <Link href="/dispatch" className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <Truck size={18} />
              出货
            </Link>
            <Link href="/calendar" className="secondary-btn border-slate-700 bg-slate-900 text-white">
              <CalendarDays size={18} />
              日历
            </Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="panel p-4">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded bg-slate-100 text-steel">
                <Icon size={20} />
              </div>
              <p className="text-xs font-bold text-slate-500">{card.label}</p>
              <p className="mt-1 text-2xl font-black tracking-normal">{card.value}</p>
            </div>
          );
        })}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-black">最近入库订单</h2>
          <Link href="/orders" className="text-sm font-bold text-machine">
            去检品
          </Link>
        </div>
        <div className="space-y-3">
          {loading && <div className="panel p-5 text-sm text-slate-500">正在加载订单...</div>}
          {!loading && orders.length === 0 && <div className="panel p-5 text-sm text-slate-500">暂无入库订单，请先点击“入库”。</div>}
          {orders.slice(0, 8).map((order) => (
            <Link key={order.id} href={`/inspect/${order.id}`} className="panel flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-black">{order.po_number}</p>
                  <StatusBadge status={order.status} />
                </div>
                <p className="mt-1 truncate text-sm text-slate-500">
                  {order.customer_name} · 番号 {order.sku} · 入库 {order.quantity} 件
                </p>
              </div>
              <ArrowRight size={18} className="shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
