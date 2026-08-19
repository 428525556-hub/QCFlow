"use client";

import type { InspectionScheduleTask, InspectionTeam, Order, OrderItem, ScheduleProgressRecord } from "@/lib/types";
import { Badge } from "@/components/ui";
import { SkeletonRows } from "@/components/ui";
import { getTodayPlan, recordScheduleProgress } from "@/src/api/scheduleApi";
import { AlertTriangle, CalendarDays, CheckSquare, Clock, Info, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type TodayTaskRow = {
  task: InspectionScheduleTask;
  order: Order | null;
  item: OrderItem | null;
  progress: ScheduleProgressRecord[];
};

type TeamGroup = {
  teamId: string;
  teamName: string;
  capacityUnits: number;
  plannedUnits: number;
  completed: number;
  tasks: TodayTaskRow[];
};

const RISK_TEXT: Record<string, string> = {
  green: "正常",
  yellow: "黄色预警",
  red: "红色预警",
  overload: "超负荷"
};

const RISK_TONE: Record<string, "green" | "amber" | "red" | "violet"> = {
  green: "green",
  yellow: "amber",
  red: "red",
  overload: "violet"
};

const STATUS_LABELS: Record<string, string> = {
  待开始: "待开始",
  进行中: "进行中",
  已完成: "已完成",
  部分完成: "部分完成",
  延期: "延期",
  已取消: "已取消",
  已调整: "已调整"
};

export default function ScheduleTodayPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [metrics, setMetrics] = useState<{ planned: number; completed: number; difference: number; capacityUnits: number; utilization: number; urgentCount: number; riskCount: number } | null>(null);
  const [groups, setGroups] = useState<TeamGroup[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkInTask, setCheckInTask] = useState<InspectionScheduleTask | null>(null);
  const [checkInQuantity, setCheckInQuantity] = useState("");
  const [explainTask, setExplainTask] = useState<TodayTaskRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await getTodayPlan(date);
      if (error || !data) {
        setMessage(error?.message ?? "加载失败");
        setLoading(false);
        return;
      }
      setMetrics(data.metrics);
      setGroups(data.teams as TeamGroup[]);
      setWarnings(data.warnings ?? []);
      setLoading(false);
    }
    load();
  }, [date]);

const totalDifference = useMemo(() => (metrics ? metrics.planned - metrics.completed : 0), [metrics]);
const emergencyTasks = useMemo(() => {
  const rows: TodayTaskRow[] = [];
  for (const group of groups) {
    for (const row of group.tasks) {
      const explanation = (row.task.explanation ?? {}) as Record<string, unknown>;
      const urgency = explanation.urgency;
      if (urgency === "P0" || urgency === "P1" || row.task.priority === "特急") rows.push(row);
    }
  }
  return rows;
}, [groups]);

  async function submitCheckIn() {
    if (!checkInTask) return;
    const quantity = Number(checkInQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setMessage("请输入有效的完成双数。");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await recordScheduleProgress(checkInTask.id, { quantity });
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`任务已记录完成 ${quantity} 双。`);
    setCheckInTask(null);
    setCheckInQuantity("");
    const { data } = await getTodayPlan(date);
    if (data) {
      setMetrics(data.metrics);
      setGroups(data.teams as TeamGroup[]);
      setWarnings(data.warnings ?? []);
    }
  }

  function renderExplanation(row: TodayTaskRow) {
    const explanation = (row.task.explanation ?? {}) as {
      deadlineChain?: { earliest: string | null; preferred: string | null; hard: string | null };
      targetDate?: string | null;
      latestAcceptable?: string | null;
      urgency?: string;
      overload?: boolean;
      remainingQty?: number;
      workdaysRemaining?: number | null;
      teamDailyCapacity?: number;
      submittedQuantity?: number;
      reasonCodes?: string[];
      bufferDays?: number | null;
      projectedDate?: string | null;
      riskLevel?: string;
    };
    const deadlineChain = explanation.deadlineChain ?? { earliest: null, preferred: null, hard: null };
    const reasonCodes = (explanation.reasonCodes ?? []) as string[];
    const reasonLabels: Record<string, string> = {
      deadline_driven: "按 Deadline 倒排",
      compressed: "时间紧迫压缩排班",
      capacity_split: "当日产能不足拆分",
      earliest_start: "到达最早可检日期",
      arrival_limited: "受实际可送检数量限制",
      overflow_team: "跨班组承接",
      preferred_missed: "送货日期无法满足",
      urgent_insert: "紧急插单",
      rollover: "滚动结转"
    };

    return (
      <div className="rounded border border-line bg-canvas p-3 text-sm">
        <div className="mb-2 flex items-center gap-2">
          <Info size={15} className="text-machine" />
          <p className="font-black text-blue-950">为什么安排在这一天</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <div>
            <dt className="text-xs font-bold text-slate-500">预计可检</dt>
            <dd className="font-black">{deadlineChain.earliest ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">预约送货</dt>
            <dd className="font-black">{deadlineChain.preferred ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">最终出货</dt>
            <dd className="font-black">{deadlineChain.hard ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">剩余待检</dt>
            <dd className="font-black">{explanation.remainingQty ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">剩余工作日</dt>
            <dd className="font-black">{explanation.workdaysRemaining ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">目标完成日（提前7个工作日）</dt>
            <dd className="font-black">{explanation.targetDate ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">最晚完成日（送货前1工作日）</dt>
            <dd className="font-black">{explanation.latestAcceptable ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">紧急级别</dt>
            <dd className="font-black">
              {explanation.urgency ?? "-"}{explanation.overload ? " · 超负荷" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">班组日产能(标准单位)</dt>
            <dd className="font-black">{explanation.teamDailyCapacity ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">实际可检数量</dt>
            <dd className="font-black">{explanation.submittedQuantity ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">预计完成日</dt>
            <dd className="font-black">{explanation.projectedDate ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold text-slate-500">出货缓冲(天)</dt>
            <dd className="font-black">{explanation.bufferDays ?? "-"}</dd>
          </div>
        </dl>
        <div className="mt-2 flex flex-wrap gap-1">
          {reasonCodes.map((code) => (
            <span key={code} className="rounded bg-white px-2 py-0.5 text-[11px] font-black text-blue-700">
              {reasonLabels[code] ?? code}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded bg-machine/10 px-2.5 py-1 text-xs font-semibold text-machine">
            <CalendarDays size={14} />
            今日检品计划
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">今日计划</h1>
          <p className="mt-1 text-sm text-blue-700">今天每个班应该检什么、检多少，以及按当前产能能否按时完成。</p>
        </div>
        <label className="text-sm font-bold text-slate-700">
          日期
          <input type="date" className="field mt-1" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </div>

      {message && <p className="rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}

      {loading && (
        <div className="rounded-2xl border border-line/80 bg-white shadow-soft">
          <SkeletonRows rows={5} />
        </div>
      )}

      {!loading && metrics && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">今日计划</p>
              <p className="mt-1 text-xl font-black text-blue-950">{metrics.planned.toLocaleString()} 双</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">今日已完成</p>
              <p className="mt-1 text-xl font-black text-emerald-700">{metrics.completed.toLocaleString()} 双</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">今日差异</p>
              <p className="mt-1 text-xl font-black text-amber-700">{totalDifference.toLocaleString()} 双</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">今日可用产能</p>
              <p className="mt-1 text-xl font-black text-blue-950">{metrics.capacityUnits.toLocaleString()}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">产能利用率</p>
              <p className={`mt-1 text-xl font-black ${metrics.utilization > 90 ? "text-red-600" : metrics.utilization > 75 ? "text-amber-600" : "text-blue-950"}`}>
                {metrics.utilization}%
              </p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">紧急订单</p>
              <p className="mt-1 text-xl font-black text-red-600">{metrics.urgentCount}</p>
            </div>
            <div className="panel p-3">
              <p className="text-xs font-bold text-slate-500">延期/送货预警</p>
              <p className="mt-1 text-xl font-black text-orange-600">{metrics.riskCount}</p>
            </div>
          </section>

          {warnings.length > 0 && (
            <section className="space-y-1">
              {warnings.map((warning, index) => (
                <p key={index} className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {warning}
                </p>
              ))}
            </section>
          )}

          {emergencyTasks.length > 0 && (
            <section className="panel overflow-hidden border-red-200">
              <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-3">
                <h2 className="font-black text-red-700">今日紧急检品</h2>
                <p className="text-xs font-bold text-red-600">当天/明天送货或特急订单，应优先安排</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-slate-50 text-left text-xs font-black text-slate-500">
                      <th className="px-3 py-2">订单</th>
                      <th className="px-3 py-2">款号</th>
                      <th className="px-3 py-2">颜色/尺码</th>
                      <th className="px-3 py-2 text-right">计划</th>
                      <th className="px-3 py-2">班组</th>
                      <th className="px-3 py-2">紧急级别</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emergencyTasks.map((row) => {
                      const explanation = (row.task.explanation ?? {}) as Record<string, unknown>;
                      const teamName = groups.find((group) => group.tasks.includes(row))?.teamName ?? "-";
                      return (
                        <tr key={row.task.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 font-black">{row.order?.po_number ?? row.task.order_id}</td>
                          <td className="px-3 py-2">{row.item?.sku ?? row.order?.sku ?? "-"}</td>
                          <td className="px-3 py-2">{row.item?.color ?? "-"} / {row.item?.size ?? "-"}</td>
                          <td className="px-3 py-2 text-right font-black">{row.task.planned_quantity.toLocaleString()}</td>
                          <td className="px-3 py-2">{teamName}</td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">
                              {String(explanation.urgency ?? "-")}{explanation.overload ? " · 超负荷" : ""}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {groups.length === 0 && <div className="panel p-5 text-sm text-slate-500">当天没有排程任务。可以到「排程总览」执行自动重新排程。</div>}

          {groups.map((group) => (
            <section key={group.teamId || "unassigned"} className="panel overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3">
                <h2 className="font-black text-blue-950">{group.teamName}</h2>
                <p className="text-xs font-bold text-slate-600">
                  计划 {group.plannedUnits.toLocaleString()} 单位 / 产能 {group.capacityUnits.toLocaleString()}
                  {group.capacityUnits > 0 && <span className={group.plannedUnits / group.capacityUnits > 0.9 ? " text-red-600" : " text-slate-600"}> / 利用率 {Math.round((group.plannedUnits / group.capacityUnits) * 100)}%</span>}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-slate-50 text-left text-xs font-black text-slate-500">
                      <th className="px-3 py-2">订单</th>
                      <th className="px-3 py-2">款号</th>
                      <th className="px-3 py-2">颜色/尺码</th>
                      <th className="px-3 py-2 text-right">计划</th>
                      <th className="px-3 py-2 text-right">已完成</th>
                      <th className="px-3 py-2 text-right">差异</th>
                      <th className="px-3 py-2">Deadline（送货/出货）</th>
                      <th className="px-3 py-2">状态</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.tasks.map((row) => {
                      const task = row.task;
                      const explanation = (task.explanation ?? {}) as Record<string, unknown>;
                      const deadlineChain = (explanation.deadlineChain ?? {}) as Record<string, string | null>;
                      const risk = (explanation.riskLevel as string) ?? "green";
                      const difference = task.planned_quantity - task.completed_quantity;
                      return (
                        <tr key={task.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-black">{row.order?.po_number ?? task.order_id}</p>
                            <p className="text-xs text-slate-500">{row.order?.customer_name ?? ""}</p>
                          </td>
                          <td className="px-3 py-2">{row.item?.sku ?? row.order?.sku ?? "-"}</td>
                          <td className="px-3 py-2">
                            {row.item?.color ?? "-"} / {row.item?.size ?? "-"}
                          </td>
                          <td className="px-3 py-2 text-right font-black">{task.planned_quantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-black text-emerald-700">{task.completed_quantity.toLocaleString()}</td>
                          <td className={`px-3 py-2 text-right font-black ${difference > 0 ? "text-amber-700" : "text-slate-500"}`}>{difference.toLocaleString()}</td>
                          <td className="px-3 py-2 text-xs font-bold">
                            {deadlineChain.preferred ?? "-"} / {deadlineChain.hard ?? "-"}
                            <Badge status={RISK_TEXT[risk] ?? "正常"} tone={RISK_TONE[risk] ?? "gray"} className="ml-1" />
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">{STATUS_LABELS[task.status] ?? task.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setCheckInTask(task);
                                  setCheckInQuantity(String(Math.max(0, task.planned_quantity - task.completed_quantity)));
                                }}
                                className="secondary-btn h-9 px-2.5 text-xs"
                                disabled={task.status === "已完成" || task.status === "已取消"}
                              >
                                <CheckSquare size={14} />
                                打卡
                              </button>
                              <button type="button" onClick={() => setExplainTask(row)} className="icon-btn text-blue-700" aria-label="排程解释" title="为什么安排在这一天">
                                <Info size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}

      {explainTask && (
        <div className="modal-backdrop" onClick={() => setExplainTask(null)}>
          <div className="modal-dialog max-w-2xl space-y-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-blue-950">排程解释</h3>
              <button type="button" onClick={() => setExplainTask(null)} className="icon-btn" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm font-bold text-slate-600">
              {explainTask.order?.po_number ?? explainTask.task.order_id} · {explainTask.item?.sku ?? "-"} · {explainTask.item?.color ?? "-"}/{explainTask.item?.size ?? "-"}
            </p>
            {renderExplanation(explainTask)}
          </div>
        </div>
      )}

      {checkInTask && (
        <div className="modal-backdrop" onClick={() => setCheckInTask(null)}>
          <div className="w-full modal-dialog max-w-sm space-y-3" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-blue-950">任务打卡</h3>
              <button type="button" onClick={() => setCheckInTask(null)} className="icon-btn" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              计划 {checkInTask.planned_quantity} 双，已完成 {checkInTask.completed_quantity} 双，本次记录：
            </p>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={checkInTask.planned_quantity - checkInTask.completed_quantity}
              className="field text-center text-lg font-black"
              value={checkInQuantity}
              onChange={(event) => setCheckInQuantity(event.target.value)}
            />
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock size={14} />
              完成量只追加记录，不覆盖原计划；剩余量会自动进入后续排程。
            </div>
            <button type="button" onClick={submitCheckIn} disabled={saving} className="primary-btn w-full">
              {saving ? "保存中..." : "确认打卡"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
