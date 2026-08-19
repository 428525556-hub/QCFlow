"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { useLanguage } from "@/components/LanguageProvider";
import { getOrdersProgressData, subscribeOrdersProgress } from "@/src/api/ordersApi";
import { getOrderSchedulePlan } from "@/src/api/scheduleApi";
import { buildOrderProgressMap, getDefaultOrderProgress, groupOrdersByCustomer, type OrderProgress } from "@/src/services/orderService";
import type { InspectionRecord, Order, ReinspectionRecord } from "@/lib/types";
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChevronLeft, FileText, PackageCheck, Plus, RefreshCw, ScanLine, Settings2, Truck, X } from "lucide-react";
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
  const [scheduleOrderId, setScheduleOrderId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await getOrdersProgressData();
    setOrders(data.orders.filter((order) => order.inspection_plan !== "field"));
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
            <p className="mt-1 text-sm text-slate-500">{t("inboundDate")}：{order.inbound_date ?? "未设置"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs font-bold text-blue-700">{t("notInbound")}</p>
            <p className="text-xl font-black text-blue-950">{Math.max(0, order.quantity - Number(order.inbound_quantity || 0))}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <ProgressPill label={t("normalInspection")} passed={progress.normalPassed} failed={progress.normalFailed} recovered={progress.normalRecovered} />
          <ProgressPill label={t("fieldQc")} passed={progress.fieldPassed} failed={progress.fieldFailed} recovered={progress.fieldRecovered} />
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

        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-7">
          <Link href={`/inspect/${order.id}`} className="secondary-btn">
            <ArrowRight size={18} />
            {t("inspect")}
          </Link>
          {order.inspection_plan === "field" && (
            <Link href={`/field-inspect/${order.id}`} className="secondary-btn">
              <BriefcaseBusiness size={18} />
              出差
            </Link>
          )}
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
          <button type="button" onClick={() => setScheduleOrderId(order.id)} className="secondary-btn">
            <CalendarDays size={18} />
            检品计划
          </button>
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
                  {group.orders.length} {t("orderCount")} / {t("normalFinalFailed")} {group.normalFailed} / {t("fieldFinalFailed")} {group.fieldFailed} / {t("xrayFinalFailed")} {group.xrayFailed}
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
              <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs font-bold">
                <div className="rounded bg-blue-50 px-2 py-2 text-blue-800">入库 {order.inbound_quantity || 0}</div>
                <div className="rounded bg-emerald-50 px-2 py-2 text-emerald-700">检品过 {progress.normalPassed}</div>
                <div className="rounded bg-indigo-50 px-2 py-2 text-indigo-700">出差过 {progress.fieldPassed}</div>
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

      {scheduleOrderId && <OrderScheduleModal orderId={scheduleOrderId} onClose={() => setScheduleOrderId(null)} />}
    </div>
  );
}

function OrderScheduleModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const [data, setData] = useState<{
    order: Order | null;
    summary: {
      remainingPlanned: number;
      projectedDate: string | null;
      riskLevel: string;
      targetDate: string | null;
      latestAcceptable: string | null;
      perDate: Array<{ date: string; quantity: number; completed: number; urgent: boolean }>;
    };
    tasks: Array<{ scheduled_date: string; team_name: string | null; status: string; planned_quantity: number }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOrderSchedulePlan(orderId).then(({ data: result, error }) => {
      setLoading(false);
      if (!error && result) {
        setData({
          order: (result.order as Order) ?? null,
          summary: result.summary,
          tasks: (result.tasks ?? []).map((task) => ({
            scheduled_date: task.scheduled_date,
            team_name: task.teamName,
            status: task.status,
            planned_quantity: task.planned_quantity
          }))
        });
      }
    });
  }, [orderId]);

  const riskLabels: Record<string, { text: string; className: string }> = {
    green: { text: "正常", className: "bg-emerald-100 text-emerald-700" },
    yellow: { text: "黄色预警", className: "bg-yellow-100 text-yellow-700" },
    red: { text: "红色预警", className: "bg-red-100 text-red-700" },
    overload: { text: "超负荷", className: "bg-purple-100 text-purple-700" }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-blue-950">订单检品计划</h3>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        {loading && <p className="text-sm text-slate-500">正在加载...</p>}
        {!loading && data && (
          <>
            <p className="text-sm font-bold text-slate-600">
              {data.order?.po_number ?? "-"} · {data.order?.customer_name ?? "-"} · 总数 {data.order?.quantity ?? "-"} 双
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">剩余待排</p>
                <p className="font-black">{data.summary.remainingPlanned.toLocaleString()}</p>
              </div>
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">目标完成（提前7个工作日）</p>
                <p className="font-black">{data.summary.targetDate ?? "-"}</p>
              </div>
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">当前预计完成</p>
                <p className="font-black">{data.summary.projectedDate ?? "-"}</p>
              </div>
              <div className="rounded border border-line bg-blue-50 p-2">
                <p className="text-xs font-bold text-slate-500">风险等级</p>
                <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-black ${riskLabels[data.summary.riskLevel]?.className ?? "bg-emerald-100 text-emerald-700"}`}>
                  {riskLabels[data.summary.riskLevel]?.text ?? "正常"}
                </span>
              </div>
            </div>
            <div className="rounded border border-line bg-blue-50/60 p-3">
              <p className="mb-2 font-black text-blue-950">每日检品计划</p>
              <div className="space-y-1">
                {data.summary.perDate.map((row) => (
                  <div key={row.date} className="flex items-center justify-between rounded bg-white px-3 py-2 text-sm">
                    <span className="font-black">{row.date}</span>
                    <span className="flex items-center gap-2">
                      {row.urgent && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">紧急</span>}
                      <span className="font-black">{row.quantity.toLocaleString()} 双</span>
                      <span className="text-xs text-emerald-700">已完成 {row.completed.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
                {data.summary.perDate.length === 0 && <p className="text-sm text-slate-500">该订单暂无排程任务。</p>}
              </div>
            </div>
            <div className="rounded border border-line bg-blue-50/60 p-3">
              <p className="mb-2 font-black text-blue-950">任务明细（{data.tasks.length}）</p>
              <div className="space-y-1">
                {data.tasks.map((task) => (
                  <div key={task.scheduled_date + task.team_name} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-3 py-2 text-sm">
                    <span className="font-black">{task.scheduled_date} · {task.team_name ?? "-"}</span>
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">{task.status}</span>
                      <span className="font-black">{task.planned_quantity.toLocaleString()} 双</span>
                    </span>
                  </div>
                ))}
                {data.tasks.length === 0 && <p className="text-sm text-slate-500">暂无任务。</p>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
