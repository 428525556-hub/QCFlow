"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { getClientOrderDetailData } from "@/src/api/ordersApi";
import { buildClientOrderDetailReport, groupOrderItemsByColor } from "@/src/services/orderService";
import type { InspectionRecord, Order, OrderItem } from "@/lib/types";
import { ArrowLeft, ImageOff } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function ClientOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const profile = useCurrentProfile();
  const orderId = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      if (!profile || profile.role !== "client") return;
      setLoading(true);
      setMessage("");

      const { data, error } = await getClientOrderDetailData(orderId, profile.customer_name ?? "");

      if (error) setMessage(`${error.message}。请确认管理员已开启客户只读权限。`);
      setOrder((data.order ?? null) as Order | null);
      setItems((data.items ?? []) as OrderItem[]);
      setRecords((data.records ?? []) as InspectionRecord[]);
      setLoading(false);
    }

    load();
  }, [orderId, profile]);

  const report = useMemo(() => buildClientOrderDetailReport(order, records), [order, records]);

  const colorGroups = useMemo(() => groupOrderItemsByColor(items), [items]);

  if (loading) return <div className="panel p-5 text-sm text-slate-500">正在加载订单...</div>;
  if (!order) return <div className="panel p-5 text-sm text-slate-500">没有权限查看这个订单，或订单不存在。</div>;

  return (
    <div className="space-y-4">
      <div>
        <Link href="/client" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
          <ArrowLeft size={16} />
          返回客户订单
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-normal text-blue-950">{order.po_number}</h1>
            <p className="mt-1 text-sm text-blue-700">
              {order.customer_name} / 番号 {order.sku} / 出货 {order.shipping_date ?? "-"}
            </p>
          </div>
          <StatusBadge status={order.status} />
        </div>
      </div>

      {message && <p className="rounded bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{message}</p>}

      <section className="grid grid-cols-3 gap-3">
        <div className="panel p-3">
          <p className="text-xs font-bold text-slate-500">检品数量</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{report.total}</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs font-bold text-slate-500">不良数量</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{report.defectQty}</p>
        </div>
        <div className="panel p-3">
          <p className="text-xs font-bold text-slate-500">不良率</p>
          <p className="mt-1 text-2xl font-black text-blue-950">{report.rate}</p>
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-black text-blue-950">颜色尺码进度</h2>
        <div className="mt-3 space-y-3">
          {colorGroups.map((group) => (
            <div key={group.color} className="rounded border border-line bg-blue-50 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-black text-blue-950">{group.color}</p>
                <p className="text-xs font-bold text-blue-700">
                  预约 {group.total} / 已入 {group.inbound}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {group.items.map((item) => (
                  <div key={item.id} className="rounded bg-white px-2 py-2 text-sm">
                    <p className="font-black">尺码 {item.size}</p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} / 已入 {item.inbound_quantity || 0}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-black text-blue-950">颜色尺码不良统计</h2>
        <div className="mt-3 space-y-2">
          {report.byColorSize.length === 0 && <p className="text-sm text-slate-500">暂无颜色尺码不良记录。</p>}
          {report.byColorSize.map((row) => (
            <div key={`${row.color}-${row.size}-${row.defectType}`} className="grid grid-cols-[1fr_auto] gap-3 rounded border border-line bg-white p-3">
              <div>
                <p className="font-black text-blue-950">
                  {row.color} / {row.size}
                </p>
                <p className="mt-1 text-sm text-slate-500">{row.defectType}</p>
              </div>
              <p className="text-lg font-black text-blue-800">x {row.quantity}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="text-lg font-black text-blue-950">不良分类统计</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {report.byType.length === 0 && <p className="text-sm text-slate-500">暂无不良记录。</p>}
          {report.byType.map(([type, quantity]) => (
            <div key={type} className="rounded border border-line bg-white p-3">
              <p className="font-black">{type}</p>
              <p className="mt-1 text-sm text-slate-500">数量 {quantity}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-black text-blue-950">不良图片和原因</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {records.length === 0 && <div className="panel p-4 text-sm text-slate-500">暂无不良记录。</div>}
          {records.map((record) => (
            <article key={record.id} className="panel overflow-hidden">
              {record.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.photo_url} alt={record.defect_type} className="h-52 w-full object-cover" />
              ) : (
                <div className="grid h-52 w-full place-items-center bg-slate-100 text-slate-400">
                  <ImageOff size={28} />
                </div>
              )}
              <div className="p-4">
                <p className="font-black text-blue-950">
                  {record.defect_type} <span className="text-safety">x {record.quantity}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">{shortDate(record.created_at)}</p>
                {(record.color || record.size) && (
                  <p className="mt-1 text-xs font-bold text-blue-700">
                    {record.color || "-"} / {record.size || "-"}
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-700">{record.remark || "暂无备注原因"}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
