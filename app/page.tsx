"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import { Badge } from "@/components/ui";
import { EmptyState } from "@/components/ui";
import { SkeletonRows } from "@/components/ui";
import { percent, todayRange } from "@/lib/format";
import type { InspectionRecord, Order } from "@/lib/types";
import { getDashboardData } from "@/src/api/ordersApi";
import { buildDashboardMetrics, type DashboardMetrics } from "@/src/services/orderService";
import { Activity, ArrowRight, BriefcaseBusiness, CalendarDays, CheckCircle2, ClipboardList, PackageCheck, PackageOpen, PackagePlus, PackageSearch, PlayCircle, ScanLine, Truck } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

function todayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

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
      const dashboardOrders = ((data.orders ?? []) as Order[]).filter((order) => order.inspection_plan !== "field");
      setOrders(dashboardOrders);
      setRecords(((data.records ?? []) as InspectionRecord[]).filter((record) => dashboardOrders.some((order) => order.id === record.order_id)));
      setLoading(false);
    }

    load();
  }, [user]);

  const metrics: DashboardMetrics = useMemo(() => buildDashboardMetrics(orders, records, todayRange()), [orders, records]);
  const today = todayKey();
  const pendingInbound = useMemo(() => orders.filter((order) => Number(order.inbound_quantity || 0) < Number(order.quantity || 0)).length, [orders]);
  const shippingToday = useMemo(() => orders.filter((order) => order.shipping_date === today).length, [orders, today]);

  const quickActions = [
    { href: "/reservations/new", label: "预约", icon: PackageSearch },
    { href: "/orders/new", label: "入库", icon: PackagePlus },
    { href: "/unbox", label: "开箱", icon: PackageOpen },
    { href: "/orders", label: "检品", icon: PlayCircle },
    { href: "/field", label: "出差", icon: BriefcaseBusiness },
    { href: "/orders", label: "X线", icon: ScanLine },
    { href: "/ship", label: "装箱", icon: PackageCheck },
    { href: "/dispatch", label: "出货", icon: Truck },
    { href: "/calendar", label: "日历", icon: CalendarDays }
  ];

  const metricsCards = [
    { label: "今日入库订单", value: metrics.todayOrders, icon: ClipboardList, tone: "text-ink" },
    { label: "今日完成检品", value: metrics.todayDone, icon: CheckCircle2, tone: "text-success" },
    { label: "待入库订单", value: pendingInbound, icon: PackageSearch, tone: "text-warning" },
    { label: "今日出货", value: shippingToday, icon: Truck, tone: "text-machine" },
    { label: "不良率", value: percent(metrics.defectQty, metrics.totalInbound), icon: Activity, tone: "text-danger" }
  ] as const;

  return (
    <div className="space-y-6">
      <section>
        <p className="text-[13px] font-semibold text-steel">{today}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">今日工作</h1>
        <p className="mt-1 text-sm text-steel">查看今天需要处理的任务和现场状态。</p>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {metricsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-line/80 bg-white p-4 shadow-soft">
              <div className="flex items-center gap-2">
                <Icon size={15} className="text-steel" />
                <p className="text-xs font-medium text-steel">{card.label}</p>
              </div>
              <p className={`tabular-nums mt-3 text-3xl font-semibold tracking-tight ${card.tone}`}>{card.value}</p>
            </div>
          );
        })}
      </section>

      <section>
        <p className="mb-2 text-[13px] font-semibold text-steel">快速操作</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium text-ink transition-all duration-150 ease-out hover:bg-black/5 hover:text-machine active:scale-[0.98]"
              >
                <Icon size={16} className="text-steel" />
                {action.label}
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold tracking-tight">最近入库订单</h2>
          <Link href="/orders" className="inline-flex items-center gap-1 text-[13px] font-medium text-machine hover:underline">
            查看全部
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading && (
          <div className="rounded-2xl border border-line/80 bg-white shadow-soft">
            <SkeletonRows rows={4} />
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="rounded-2xl border border-line/80 bg-white shadow-soft">
            <EmptyState
              icon={<ClipboardList size={32} />}
              title="暂无入库订单"
              description="先录入预约订单，再到「入库」登记实际到货数量。"
              action={
                <Link href="/orders/new" className="inline-flex h-9 items-center rounded-xl bg-machine px-4 text-[13px] font-semibold text-white transition-all duration-150 ease-out hover:bg-primary-dark active:scale-[0.98]">
                  去入库
                </Link>
              }
            />
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-soft">
            <div className="overflow-x-auto">
              <table className="ui-table w-full min-w-[720px]">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>客户</th>
                    <th>番号</th>
                    <th className="text-right">数量</th>
                    <th>状态</th>
                    <th>出货日期</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 8).map((order) => (
                    <tr key={order.id}>
                      <td className="font-semibold">{order.po_number}</td>
                      <td className="text-steel">{order.customer_name}</td>
                      <td className="text-steel">{order.sku}</td>
                      <td className="tabular-nums text-right font-semibold">{order.quantity.toLocaleString()}</td>
                      <td>
                        <Badge status={order.status} />
                      </td>
                      <td className="tabular-nums text-steel">{order.shipping_date ?? "-"}</td>
                      <td className="text-right">
                        <Link href={`/inspect/${order.id}`} className="text-[13px] font-medium text-machine hover:underline">
                          检品
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
