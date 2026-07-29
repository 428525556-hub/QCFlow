"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { getClientOrdersProgress } from "@/src/api/ordersApi";
import { attachClientOrderDefects, getClientOrderTotals, type ClientOrderWithDefects } from "@/src/services/orderService";
import type { InspectionRecord, Order } from "@/lib/types";
import { BriefcaseBusiness, FileText, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export default function FieldInspectionPortalPage() {
  const profile = useCurrentProfile();
  const [orders, setOrders] = useState<ClientOrderWithDefects[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!profile || profile.role !== "field_inspector") return;
      setLoading(true);
      setMessage("");
      const { data, error } = await getClientOrdersProgress(profile.customer_name ?? "");
      if (error) {
        setMessage(error.message);
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

  if (!profile || profile.role !== "field_inspector") {
    return <div className="panel p-5 text-sm text-slate-500">这个入口只开放给出差检品账号。</div>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded border border-blue-900 bg-blue-950 p-5 text-white">
        <p className="text-sm font-bold text-sky-300">Field QC</p>
        <h1 className="mt-2 text-3xl font-black tracking-normal">出差检品</h1>
        <p className="mt-2 text-sm text-blue-100">账号范围：{profile.customer_name || "未设置客户名称"}</p>
      </section>

      <section className="grid grid-cols-3 gap-3">
        {[
          ["订单数", orders.length],
          ["总双数", totals.quantity],
          ["出差不良", totals.defects]
        ].map(([label, value]) => (
          <div key={label} className="panel p-4 text-center">
            <p className="text-xs font-black text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-blue-950">{value}</p>
          </div>
        ))}
      </section>

      {message && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</div>}
      {loading && <div className="panel p-5 text-sm text-slate-500">正在加载出差检品订单...</div>}
      {!loading && orders.length === 0 && <div className="panel p-5 text-sm text-slate-500">当前账号还没有可查看的出差检品订单。</div>}

      <section className="space-y-3">
        {orders.map((order) => (
          <article key={order.id} className="panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-blue-950">{order.po_number}</h2>
                <p className="mt-1 text-sm text-slate-600">
                  {order.customer_name} / 番号 {order.sku} / {order.quantity} 双
                </p>
                <p className="mt-1 text-sm font-bold text-blue-700">
                  出差不良 {order.defect_quantity} / 记录 {order.record_count}
                </p>
              </div>
              <Search className="shrink-0 text-blue-700" size={22} />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link href={`/field-inspect/${order.id}`} className="primary-btn">
                <BriefcaseBusiness size={18} />
                出差检品
              </Link>
              <Link href={`/report/${order.id}`} className="secondary-btn">
                <FileText size={18} />
                报告
              </Link>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
