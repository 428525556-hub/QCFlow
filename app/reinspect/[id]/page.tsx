"use client";

import { useCurrentUser } from "@/components/AuthGuard";
import { shortDate } from "@/lib/format";
import { getReinspectionPageData, insertReinspectionRecord } from "@/src/api/inspectionApi";
import type { InspectionRecord, Order, ReinspectionRecord } from "@/lib/types";
import { ArrowLeft, CheckCircle2, RotateCcw, Save, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Draft = {
  passed: number;
  failed: number;
  remark: string;
};

type DefectRow = InspectionRecord & {
  recovered: number;
  confirmedFailed: number;
  pending: number;
  finalFailed: number;
};

function stageLabel(stage: string) {
  return stage === "xray" ? "X光" : "普通检品";
}

export default function ReinspectPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const user = useCurrentUser();
  const [order, setOrder] = useState<Order | null>(null);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [reinspections, setReinspections] = useState<ReinspectionRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true);
    setMessage("");
    const { data, error } = await getReinspectionPageData(orderId);

    setOrder(data.order as Order | null);
    setRecords((data.records ?? []) as InspectionRecord[]);
    setReinspections((data.reinspections ?? []) as ReinspectionRecord[]);
    if (error) {
      setMessage(`${error.message}。请先在 Supabase 执行二次检品 SQL。`);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const rows = useMemo<DefectRow[]>(() => {
    return records.map((record) => {
      const related = reinspections.filter((item) => item.source_record_id === record.id);
      const recovered = related.reduce((sum, item) => sum + Number(item.passed_quantity || 0), 0);
      const confirmedFailed = related.reduce((sum, item) => sum + Number(item.failed_quantity || 0), 0);
      const processed = recovered + confirmedFailed;
      return {
        ...record,
        recovered,
        confirmedFailed,
        pending: Math.max(0, Number(record.quantity || 0) - processed),
        finalFailed: Math.max(0, Number(record.quantity || 0) - recovered)
      };
    });
  }, [records, reinspections]);

  const totals = useMemo(() => {
    const originalDefects = records.reduce((sum, record) => sum + Number(record.quantity || 0), 0);
    const recovered = reinspections.reduce((sum, item) => sum + Number(item.passed_quantity || 0), 0);
    const confirmedFailed = reinspections.reduce((sum, item) => sum + Number(item.failed_quantity || 0), 0);
    return {
      originalDefects,
      recovered,
      confirmedFailed,
      pending: rows.reduce((sum, row) => sum + row.pending, 0),
      finalFailed: Math.max(0, originalDefects - recovered)
    };
  }, [records, reinspections, rows]);

  function updateDraft(recordId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [recordId]: { ...(current[recordId] ?? { passed: 0, failed: 0, remark: "" }), ...patch }
    }));
  }

  async function saveReinspection(event: FormEvent<HTMLFormElement>, row: DefectRow) {
    event.preventDefault();
    if (!user) return;

    const draft = drafts[row.id] ?? { passed: 0, failed: 0, remark: "" };
    const passed = Number(draft.passed || 0);
    const failed = Number(draft.failed || 0);

    setMessage("");
    if (passed + failed <= 0) {
      setMessage("请填写二次检品通过数量或仍不良数量。");
      return;
    }
    if (passed + failed > row.pending) {
      setMessage(`本次二次检品数量不能超过待二检数量 ${row.pending}。`);
      return;
    }

    setSavingId(row.id);
    const { data, error } = await insertReinspectionRecord({
      order_id: orderId,
      source_record_id: row.id,
      user_id: user.id,
      inspection_stage: row.inspection_stage,
      defect_type: row.defect_type,
      color: row.color,
      size: row.size,
      passed_quantity: passed,
      failed_quantity: failed,
      remark: draft.remark || null
    });

    if (error) {
      setMessage(`${error.message}。请确认 Supabase 已执行二次检品 SQL。`);
      setSavingId("");
      return;
    }

    setReinspections((current) => [data as ReinspectionRecord, ...current]);
    setDrafts((current) => ({ ...current, [row.id]: { passed: 0, failed: 0, remark: "" } }));
    setSavingId("");
    setMessage("二次检品记录已保存。");
  }

  if (loading) return <div className="panel p-5 text-sm text-slate-500">正在加载二次检品...</div>;
  if (!order) return <div className="panel p-5 text-sm text-red-600">没有找到这个订单。</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/orders" className="mb-2 inline-flex items-center gap-1 text-sm font-bold text-blue-700">
            <ArrowLeft size={16} />
            返回订单
          </Link>
          <h1 className="truncate text-2xl font-black tracking-normal text-blue-950">二次检品</h1>
          <p className="mt-1 text-sm text-blue-700">
            {order.customer_name} / {order.po_number} / {order.sku}
          </p>
        </div>
        <Link href={`/report/${orderId}`} className="secondary-btn shrink-0">
          报告
        </Link>
      </div>

      {message && (
        <p className="fixed inset-x-4 bottom-24 z-50 rounded border border-blue-200 bg-white px-3 py-3 text-sm font-bold text-blue-800 shadow-panel md:static md:shadow-none">
          {message}
        </p>
      )}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["一次不良", totals.originalDefects],
          ["二次转良", totals.recovered],
          ["仍不良", totals.confirmedFailed],
          ["待二检", totals.pending],
          ["最终不良", totals.finalFailed]
        ].map(([label, value]) => (
          <div key={label} className="panel p-3 text-center">
            <p className="text-xs font-black text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black text-blue-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        {rows.length === 0 && <div className="panel p-4 text-sm text-slate-500">这个订单还没有不良记录。</div>}
        {rows.map((row) => {
          const draft = drafts[row.id] ?? { passed: 0, failed: 0, remark: "" };
          return (
            <article key={row.id} className="panel overflow-hidden">
              <div className="border-b border-line bg-blue-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-blue-700">{stageLabel(row.inspection_stage)}</p>
                    <h2 className="mt-1 text-lg font-black text-blue-950">{row.defect_type}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {row.color || "-"} / {row.size || "-"} / {shortDate(row.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-bold text-slate-500">待二检</p>
                    <p className="text-2xl font-black text-amber-700">{row.pending}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div className="rounded bg-white p-2">
                    <p className="text-[11px] font-bold text-slate-500">一次不良</p>
                    <p className="font-black">{row.quantity}</p>
                  </div>
                  <div className="rounded bg-white p-2">
                    <p className="text-[11px] font-bold text-slate-500">转良</p>
                    <p className="font-black text-emerald-700">{row.recovered}</p>
                  </div>
                  <div className="rounded bg-white p-2">
                    <p className="text-[11px] font-bold text-slate-500">仍不良</p>
                    <p className="font-black text-red-600">{row.confirmedFailed}</p>
                  </div>
                  <div className="rounded bg-white p-2">
                    <p className="text-[11px] font-bold text-slate-500">最终不良</p>
                    <p className="font-black text-blue-950">{row.finalFailed}</p>
                  </div>
                </div>
              </div>

              <form onSubmit={(event) => saveReinspection(event, row)} className="space-y-3 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="label">返修后通过</span>
                    <input className="field" type="number" min={0} max={row.pending} value={draft.passed} onChange={(event) => updateDraft(row.id, { passed: Number(event.target.value || 0) })} />
                  </label>
                  <label className="space-y-1">
                    <span className="label">仍然不良</span>
                    <input className="field" type="number" min={0} max={row.pending} value={draft.failed} onChange={(event) => updateDraft(row.id, { failed: Number(event.target.value || 0) })} />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="label">备注</span>
                  <input className="field" value={draft.remark} onChange={(event) => updateDraft(row.id, { remark: event.target.value })} placeholder="返修情况、处理意见" />
                </label>
                <button type="submit" disabled={savingId === row.id || row.pending <= 0} className="primary-btn w-full">
                  {row.pending <= 0 ? <CheckCircle2 size={18} /> : <Save size={18} />}
                  {row.pending <= 0 ? "已完成二次判定" : savingId === row.id ? "保存中" : "保存二次检品"}
                </button>
              </form>
            </article>
          );
        })}
      </section>

      {reinspections.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-blue-950">二次检品记录</h2>
          {reinspections.map((item) => (
            <article key={item.id} className="panel flex items-center gap-3 p-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded bg-blue-50 text-machine">
                {item.passed_quantity > 0 ? <RotateCcw size={20} /> : <ShieldAlert size={20} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-black">
                  {stageLabel(item.inspection_stage)} / {item.defect_type}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  转良 {item.passed_quantity} / 仍不良 {item.failed_quantity} / {item.color || "-"} / {item.size || "-"}
                </p>
                {item.remark && <p className="mt-1 text-sm text-slate-500">{item.remark}</p>}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
