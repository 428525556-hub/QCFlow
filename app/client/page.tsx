"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { getClientOrdersProgress } from "@/src/api/ordersApi";
import { attachClientOrderDefects, getClientOrderTotals, type ClientOrderWithDefects } from "@/src/services/orderService";
import type { InspectionRecord, Order } from "@/lib/types";
import { ArrowRight, Eye } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function ClientPortalPage() {
  const profile = useCurrentProfile();
  const [orders, setOrders] = useState<ClientOrderWithDefects[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!profile || profile.role !== "client") return;
      setLoading(true);
      setMessage("");

      const { data, error } = await getClientOrdersProgress(profile.customer_name ?? "");

      if (error) {
        setMessage(`${error.message}。请确认管理员已开启客户只读权限。`);
        setLoading(false);
        return;
      }

      const records = (data.records ?? []) as InspectionRecord[];
      setOrders(attachClientOrderDefects((data.orders ?? []) as Order[], records));
      setLoading(false);
    }

    load();
  }, [profile]);

  const totals = useMemo(() => getClientOrderTotals(orders), [orders]);

  if (!profile || profile.role !== "client") {
    return <div className="panel p-5 text-sm text-slate-500">客户账号登录后可查看客户订单。</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <Eye size={14} />
          客户只读端
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">{profile.customer_name}</h1>
        <p className="mt-1 text-sm text-blue-700">实时查看订单进度、检品报告、不良图片和原因。</p>
      </div>

      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</p>}

      <section className="grid grid-cols-3 gap-3">
        <div className="panel p-3">
          <p className="text-xs font-bold text-slate-500">订单总数</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{orders.length}</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs font-bold text-slate-500">已入库</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{totals.inbound}</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs font-bold text-slate-500">不良率</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{totals.rate}</p>
        </div>
      </section>

      <section className="space-y-3">
        {loading && <div className="panel p-5 text-sm text-slate-500">正在加载客户订单...</div>}
        {!loading && orders.length === 0 && <div className="panel p-5 text-sm text-slate-500">暂无可查看订单。</div>}
        {orders.map((order) => (
          <Link key={order.id} href={`/client/orders/${order.id}`} className="panel flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate font-black">{order.po_number}</p>
                <StatusBadge status={order.status} />
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">
                番号 {order.sku} / 出货 {order.shipping_date ?? "-"} / 创建 {shortDate(order.created_at)}
              </p>
              <p className="mt-1 text-xs font-bold text-blue-700">
                已入 {order.inbound_quantity || 0} / 不良 {order.defect_quantity} / 记录 {order.record_count}
              </p>
            </div>
            <ArrowRight size={18} className="shrink-0 text-slate-400" />
          </Link>
        ))}
      </section>
    </div>
  );
}
