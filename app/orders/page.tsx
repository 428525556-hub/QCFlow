"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { useLanguage } from "@/components/LanguageProvider";
import { shortDate } from "@/lib/format";
import { getOrdersProgressData, subscribeOrdersProgress } from "@/src/api/ordersApi";
import { buildOrderProgressMap, getDefaultOrderProgress, groupOrdersByCustomer, type OrderProgress } from "@/src/services/orderService";
import type { InspectionRecord, Order, ReinspectionRecord } from "@/lib/types";
import { ArrowRight, ChevronLeft, FileText, PackageCheck, Plus, RefreshCw, ScanLine, Settings2, Truck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

function ProgressPill({ label, passed, failed, recovered }: { label: string; passed: number; failed: number; recovered: number }) {
  const { t } = useLanguage();

  return (
    <div className="rounded border border-blue-100 bg-blue-50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-blue-700">{label}</p>
        {recovered > 0 && <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700">{t("recheckPassed")} {recovered}</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-white px-2 py-2">
          <p className="text-[11px] font-bold text-slate-500">{t("passed")}</p>
          <p className="text-lg font-black text-emerald-700">{passed}</p>
        </div>
        <div className="rounded bg-white px-2 py-2">
          <p className="text-[11px] font-bold text-slate-500">{t("failed")}</p>
          <p className="text-lg font-black text-red-600">{failed}</p>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [reinspections, setReinspections] = useState<ReinspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getOrdersProgressData();
    setOrders(data.orders);
    setRecords(data.records);
    setReinspections(data.reinspections);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();

    return subscribeOrdersProgress(load);
  }, [load]);

  const progressByOrder = useMemo(() => buildOrderProgressMap(orders, records, reinspections), [orders, records, reinspections]);
  const customerGroups = useMemo(() => groupOrdersByCustomer(orders, progressByOrder), [orders, progressByOrder]);
  const selectedGroup = useMemo(() => customerGroups.find((group) => group.customerName === selectedCustomerName) ?? null, [customerGroups, selectedCustomerName]);
  const selectedOrder = useMemo(() => selectedGroup?.orders.find((order) => order.id === selectedOrderId) ?? null, [selectedGroup, selectedOrderId]);

  useEffect(() => {
    if (selectedCustomerName && !selectedGroup) {
      setSelectedCustomerName(null);
      setSelectedOrderId(null);
    }
  }, [selectedCustomerName, selectedGroup]);

  useEffect(() => {
    if (selectedOrderId && !selectedOrder) setSelectedOrderId(null);
  }, [selectedOrderId, selectedOrder]);

  function openCustomer(customerName: string) {
    setSelectedCustomerName(customerName);
    setSelectedOrderId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openOrder(orderId: string) {
    setSelectedOrderId(orderId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToCustomers() {
    setSelectedCustomerName(null);
    setSelectedOrderId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function backToCustomerOrders() {
    setSelectedOrderId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderOrderDetail(order: Order) {
    const progress = progressByOrder.get(order.id) ?? getDefaultOrderProgress(order);

    return (
      <article className="panel p-4">
        <button type="button" onClick={backToCustomerOrders} className="mb-3 inline-flex items-center gap-1 text-sm font-black text-blue-700">
          <ChevronLeft size={18} />
          返回订单摘要
        </button>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-black">{order.po_number}</h3>
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-slate-500">{t("inboundDate")}：{shortDate(order.created_at)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold text-blue-700">{t("notInbound")}</p>
            <p className="text-xl font-black text-blue-950">{Math.max(0, order.quantity - Number(order.inbound_quantity || 0))}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <ProgressPill label={t("normalInspection")} passed={progress.normalPassed} failed={progress.normalFailed} recovered={progress.normalRecovered} />
          <ProgressPill label={t("xrayQc")} passed={progress.xrayPassed} failed={progress.xrayFailed} recovered={progress.xrayRecovered} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <dt className="font-bold text-slate-500">{t("reservedInboundFull")}</dt>
            <dd className="mt-1 truncate font-black text-blue-900">
              {order.quantity} / {order.inbound_quantity || 0}
            </dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">{t("baseQuantity")}</dt>
            <dd className="mt-1 truncate font-black text-blue-900">{progress.baseQuantity}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">{t("factory")}</dt>
            <dd className="mt-1 truncate">{order.factory_name}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">{t("shippingDate")}</dt>
            <dd className="mt-1 truncate font-black text-blue-900">{order.shipping_date ?? "-"}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">{t("sku")}</dt>
            <dd className="mt-1 truncate">{order.sku}</dd>
          </div>
          <div>
            <dt className="font-bold text-slate-500">{t("colorSize")}</dt>
            <dd className="mt-1 truncate">
              {order.color} / {order.size}
            </dd>
          </div>
        </dl>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-6">
          <Link href={`/inspect/${order.id}`} className="secondary-btn">
            <ArrowRight size={18} />
            {t("inspect")}
          </Link>
          <Link href={`/xray/${order.id}`} className="secondary-btn">
            <ScanLine size={18} />
            {t("xray")}
          </Link>
          <Link href={`/reinspect/${order.id}`} className="secondary-btn">
            <RefreshCw size={18} />
            {t("recheck")}
          </Link>
          <Link href={`/ship/${order.id}`} className="secondary-btn">
            <PackageCheck size={18} />
            装箱
          </Link>
          <Link href={`/dispatch/${order.id}`} className="secondary-btn">
            <Truck size={18} />
            出货
          </Link>
          <Link href={`/report/${order.id}`} className="secondary-btn">
            <FileText size={18} />
            {t("report")}
          </Link>
        </div>
      </article>
    );
  }

  function renderCustomerList() {
    return (
      <div className="space-y-3">
        {customerGroups.map((group) => (
          <button key={group.customerName} type="button" onClick={() => openCustomer(group.customerName)} className="panel w-full p-4 text-left transition hover:border-blue-400 hover:bg-blue-50">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-black text-blue-950">{group.customerName}</h2>
                <p className="mt-1 text-xs font-bold text-blue-700">
                  {group.orders.length} {t("orderCount")} / {t("normalFinalFailed")} {group.normalFailed} / {t("xrayFinalFailed")} {group.xrayFailed}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-bold text-blue-700">{t("reservedInbound")}</p>
                <p className="text-xl font-black text-blue-950">
                  {group.totalQuantity} / {group.inboundQuantity}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }

  function renderOrderSummaryList() {
    if (!selectedGroup) return null;

    return (
      <div className="space-y-3">
        <button type="button" onClick={backToCustomers} className="inline-flex items-center gap-1 text-sm font-black text-blue-700">
          <ChevronLeft size={18} />
          返回客户列表
        </button>

        <section className="rounded border border-blue-200 bg-blue-100/95 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-blue-950">{selectedGroup.customerName}</h2>
              <p className="text-xs font-bold text-blue-700">{selectedGroup.orders.length} {t("orderCount")}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs font-bold text-blue-700">{t("reservedInbound")}</p>
              <p className="text-xl font-black text-blue-950">
                {selectedGroup.totalQuantity} / {selectedGroup.inboundQuantity}
              </p>
            </div>
          </div>
        </section>

        {selectedGroup.orders.map((order) => {
          const progress = progressByOrder.get(order.id) ?? getDefaultOrderProgress(order);
          return (
            <button key={order.id} type="button" onClick={() => openOrder(order.id)} className="panel w-full p-4 text-left transition hover:border-blue-400 hover:bg-blue-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-black text-blue-950">{order.po_number}</h3>
                    <StatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-sm font-bold text-slate-700">番号：{order.sku || "-"}</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">出货日期：{order.shipping_date ?? "-"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-bold text-blue-700">数量</p>
                  <p className="text-xl font-black text-blue-950">{order.quantity}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-bold">
                <div className="rounded bg-blue-50 px-2 py-2 text-blue-800">入库 {order.inbound_quantity || 0}</div>
                <div className="rounded bg-emerald-50 px-2 py-2 text-emerald-700">检品过 {progress.normalPassed}</div>
                <div className="rounded bg-sky-50 px-2 py-2 text-sky-700">X线过 {progress.xrayPassed}</div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-normal text-blue-950">{t("orderList")}</h1>
          <p className="mt-1 text-sm text-blue-700">
            {!selectedCustomerName && "先选择客户，再选择订单。"}
            {selectedCustomerName && !selectedOrderId && "选择订单后可以进入检品、X线、装箱、出货和报告。"}
            {selectedOrderId && "当前为订单完整操作信息。"}
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Link href="/orders/manage" className="secondary-btn min-h-11 px-3">
            <Settings2 size={18} />
            总单管理
          </Link>
          <Link href="/orders/new" className="primary-btn min-h-11 px-3">
            <Plus size={18} />
            {t("inbound")}
          </Link>
        </div>
      </div>

      <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
        {t("orderHint")}
      </div>

      {loading && <div className="panel p-5 text-sm text-slate-500">{t("loading")}</div>}
      {!loading && orders.length === 0 && <div className="panel p-5 text-sm text-slate-500">{t("noInboundOrders")}</div>}
      {!loading && orders.length > 0 && !selectedCustomerName && renderCustomerList()}
      {!loading && orders.length > 0 && selectedCustomerName && !selectedOrderId && renderOrderSummaryList()}
      {!loading && selectedOrder && renderOrderDetail(selectedOrder)}
    </div>
  );
}
