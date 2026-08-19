"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { isAdminEmail } from "@/lib/security";
import type { InspectionScheduleTask, InspectionTeam, Order, OrderItem, ScheduleChangeLog } from "@/lib/types";
import { getOrdersWithItems, updateOrderItem } from "@/src/api/ordersApi";
import {
  adjustScheduleTask,
  applyUrgentInsert,
  getInspectionTeams,
  getOrderSchedulePlan,
  getScheduleLogs,
  getSchedulePlan,
  previewUrgentInsert,
  runAutoSchedule
} from "@/src/api/scheduleApi";
import { AlertTriangle, CalendarClock, Check, Info, Lock, LockOpen, Plus, RefreshCw, Send, Settings2, X, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PlanTask = InspectionScheduleTask & {
  order: Order | null;
  item: OrderItem | null;
  teamName: string | null;
  progressCount: number;
  riskLevel: string;
};

type PlanData = {
  from: string;
  to: string;
  days: number;
  teams: InspectionTeam[];
  dailyLoads: Array<{ date: string; teamId: string; plannedUnits: number; capacityUnits: number; utilization: number }>;
  warnings: string[];
  tasks: PlanTask[];
};

type InsertPreviewData = {
  canFit: boolean;
  capacityGap: number;
  suggestedDates: string[];
  urgentAssignments: unknown[];
  impactedUnits: Array<{ unitId: string; beforeProjected: string | null; afterProjected: string | null; beforeRisk: string; newRisk: string }>;
  shiftedTasks: Array<{ task_id: string; fromDate: string; toDate: string }>;
  summary: { delayedOrders: number; newRedRisks: number; newOrangeRisks: number };
};

type OrderPlanData = {
  order: Order | null;
  items: OrderItem[];
  tasks: PlanTask[];
  summary: {
    remainingPlanned: number;
    projectedDate: string | null;
    riskLevel: string;
    targetDate: string | null;
    latestAcceptable: string | null;
    perDate: Array<{ date: string; quantity: number; completed: number; urgent: boolean }>;
  };
};

const RISK_LABELS: Record<string, { text: string; className: string }> = {
  green: { text: "正常", className: "bg-emerald-100 text-emerald-700" },
  yellow: { text: "黄色预警", className: "bg-yellow-100 text-yellow-700" },
  red: { text: "红色预警", className: "bg-red-100 text-red-700" },
  overload: { text: "超负荷", className: "bg-purple-100 text-purple-700" }
};

const REASON_LABELS: Record<string, string> = {
  deadline_driven: "按 Deadline 倒排",
  compressed: "时间紧迫压缩",
  capacity_split: "产能拆分",
  earliest_start: "最早可检",
  arrival_limited: "送检限制",
  overflow_team: "跨班组",
  preferred_missed: "送货预警",
  urgent_insert: "紧急插单",
  rollover: "滚动结转"
};

export default function SchedulePlanPage() {
  const profile = useCurrentProfile();
  const isAdmin = profile?.role === "admin" || isAdminEmail(profile?.email ?? "");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(14);
  const [teamFilter, setTeamFilter] = useState("");
  const [plan, setPlan] = useState<PlanData | null>(null);
  const [teams, setTeams] = useState<InspectionTeam[]>([]);
  const [orderRows, setOrderRows] = useState<Array<Order & { items: OrderItem[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"plan" | "logs">("plan");
  const [logs, setLogs] = useState<ScheduleChangeLog[]>([]);

  const [adjustTask, setAdjustTask] = useState<PlanTask | null>(null);
  const [explainTask, setExplainTask] = useState<PlanTask | null>(null);
  const [showReplan, setShowReplan] = useState(false);
  const [replanning, setReplanning] = useState(false);

  const [insertOpen, setInsertOpen] = useState(false);
  const [insertItemId, setInsertItemId] = useState("");
  const [insertQty, setInsertQty] = useState("");
  const [insertReason, setInsertReason] = useState("");
  const [preview, setPreview] = useState<InsertPreviewData | null>(null);
  const [inserting, setInserting] = useState(false);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitItemId, setSubmitItemId] = useState("");
  const [submitQty, setSubmitQty] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"pending" | "ready" | "paused">("ready");
  const [orderPlanId, setOrderPlanId] = useState<string | null>(null);
  const [orderPlan, setOrderPlan] = useState<OrderPlanData | null>(null);
  const [orderPlanLoading, setOrderPlanLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [planResult, teamResult, orderResult] = await Promise.all([getSchedulePlan({ from, days, teamId: teamFilter || undefined }), getInspectionTeams(), getOrdersWithItems(false)]);
    if (planResult.data) setPlan(planResult.data as PlanData);
    if (planResult.error) setMessage(planResult.error.message);
    setTeams((teamResult.data ?? []) as InspectionTeam[]);
    setOrderRows((orderResult.data ?? []) as Array<Order & { items: OrderItem[] }>);
    setLoading(false);
  }, [from, days, teamFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const allItems = useMemo(() => {
    const rows: Array<{ item: OrderItem; order: Order }> = [];
    for (const order of orderRows) {
      for (const item of order.items ?? []) rows.push({ item, order });
    }
    return rows;
  }, [orderRows]);

  async function loadLogs() {
    if (!isAdmin) return;
    const { data } = await getScheduleLogs();
    setLogs((data ?? []) as ScheduleChangeLog[]);
  }

  useEffect(() => {
    if (tab === "logs") loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin]);

  async function runReplan() {
    setReplanning(true);
    setMessage("");
    const { data, error } = await runAutoSchedule("管理员手动触发自动重新排程");
    setReplanning(false);
    setShowReplan(false);
    if (error) {
      setMessage(`自动排程失败：${error.message}`);
      return;
    }
    const warnings = (data?.warnings ?? []) as Array<{ level: string; message: string }>;
    const skip = data?.skipSummary;
    const skipDetails = data?.skipDetails ?? [];
    const skipReasons: string[] = [];
    if (skip && skip.totalUnits > 0) {
      if (skip.pendingItems > 0) skipReasons.push(`${skip.pendingItems} 条明细待送检（未标记可送检）`);
      if (skip.noSubmittableQuantity > 0) skipReasons.push(`${skip.noSubmittableQuantity} 条明细未入库/可送检数量为 0`);
      if (skip.pausedItems > 0) skipReasons.push(`${skip.pausedItems} 条明细暂停送检`);
      if (skip.directShipOrders > 0) skipReasons.push(`${skip.directShipOrders} 个订单直接出货`);
    }
    setMessage(
      `自动排程完成：新生成 ${data?.inserted ?? 0} 个任务，调整 ${data?.cancelled ?? 0} 个旧任务。` +
        (skipReasons.length > 0 ? ` 未参与排程：${skipReasons.join("，")}。` : "") +
        (skipDetails.length > 0 ? ` 明细：${skipDetails.slice(0, 3).map((row) => `${row.poNumber}/${row.sku}/${row.inspectionType === "xray" ? "X线" : row.inspectionType}(${row.reason}, 明细入库${row.itemInbound}/订单入库${row.orderInbound}/送检${row.submittedQuantity})`).join("；")}${skipDetails.length > 3 ? " 等" : ""}。` : "") +
        (warnings.length > 0 ? ` 预警 ${warnings.length} 条，详见计划列表。` : "")
    );
    await load();
  }

  async function runInsertPreview() {
    const itemId = insertItemId;
    const quantity = Number(insertQty);
    if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
      setMessage("请选择订单明细并填写有效的插单数量。");
      return;
    }
    const { data, error } = await previewUrgentInsert({ order_item_id: itemId, quantity, inspection_type: "normal" });
    if (error) {
      setMessage(error.message);
      return;
    }
    setPreview(data ?? null);
  }

  async function confirmInsert() {
    if (!preview?.canFit) return;
    setInserting(true);
    setMessage("");
    const { data, error } = await applyUrgentInsert({
      order_item_id: insertItemId,
      quantity: Number(insertQty),
      inspection_type: "normal",
      reason: insertReason.trim() || "紧急插单",
      shifted_tasks: preview.shiftedTasks.map((row) => ({ task_id: row.task_id, to_date: row.toDate }))
    });
    setInserting(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`紧急插单已应用：插入 ${data?.inserted ?? 0} 个任务，顺延 ${data?.shifted ?? 0} 个任务。`);
    setInsertOpen(false);
    setInsertItemId("");
    setInsertQty("");
    setInsertReason("");
    setPreview(null);
    await load();
  }

  async function saveSubmit() {
    const itemId = submitItemId;
    if (!itemId) {
      setMessage("请选择订单明细。");
      return;
    }
    const quantity = Number(submitQty);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setMessage("请输入有效的送检数量。");
      return;
    }
    const { error } = await updateOrderItem(itemId, { submitted_quantity: quantity, submit_status: submitStatus });
    if (error) {
      setMessage(`送检登记失败：${error.message}`);
      return;
    }
    setMessage("送检登记已保存。");
    setSubmitOpen(false);
    setSubmitItemId("");
    await load();
  }

  async function submitAllInbound() {
    const targets = allItems.filter(
      ({ item }) =>
        Number(item.inbound_quantity || 0) > 0 &&
        (Number(item.submitted_quantity || 0) !== Number(item.inbound_quantity || 0) || item.submit_status !== "ready")
    );
    if (targets.length === 0) {
      setMessage("没有需要处理的明细（已入库的都已标记为可送检）。");
      return;
    }
    if (!window.confirm(`将 ${targets.length} 条已入库明细标记为可送检并同步数量，确认？`)) return;
    for (const { item } of targets) {
      const { error } = await updateOrderItem(item.id, { submitted_quantity: item.inbound_quantity, submit_status: "ready" });
      if (error) {
        setMessage(`处理失败：${error.message}`);
        return;
      }
    }
    setMessage(`已将 ${targets.length} 条明细标记为可送检。`);
    await load();
  }

  async function openOrderPlan(orderId: string) {
    setOrderPlanId(orderId);
    setOrderPlan(null);
    setOrderPlanLoading(true);
    const { data, error } = await getOrderSchedulePlan(orderId);
    setOrderPlanLoading(false);
    if (error) {
      setMessage(error.message);
      setOrderPlanId(null);
      return;
    }
    setOrderPlan((data ?? null) as OrderPlanData | null);
  }

  async function toggleLock(task: PlanTask) {
    const action = task.locked ? "unlock" : "lock";
    const reason = task.locked ? "解除手动锁定" : "手动锁定该任务，自动重排不修改";
    const { error } = await adjustScheduleTask(task.id, { locked: !task.locked, reason });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(task.locked ? "已解锁。" : "已锁定。");
    await load();
  }

  function renderExplanation(task: PlanTask) {
    const explanation = (task.explanation ?? {}) as {
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
    const chain = explanation.deadlineChain ?? { earliest: null, preferred: null, hard: null };
    const codes = (explanation.reasonCodes ?? []) as string[];
    return (
      <dl className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
        <div>
          <dt className="text-xs font-bold text-slate-500">可检/送货/出货</dt>
          <dd className="font-black">
            {chain.earliest ?? "-"} / {chain.preferred ?? "-"} / {chain.hard ?? "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">剩余待检 / 可检数量</dt>
          <dd className="font-black">
            {explanation.remainingQty ?? "-"} / {explanation.submittedQuantity ?? "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">预计完成 / 缓冲</dt>
          <dd className="font-black">
            {explanation.projectedDate ?? "-"} / {explanation.bufferDays ?? "-"} 天
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">班组产能(单位)</dt>
          <dd className="font-black">{explanation.teamDailyCapacity ?? "-"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">目标/最晚完成日</dt>
          <dd className="font-black">
            {explanation.targetDate ?? "-"} / {explanation.latestAcceptable ?? "-"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-slate-500">紧急级别</dt>
          <dd className="font-black">{explanation.urgency ?? "-"}{explanation.overload ? " · 超负荷" : ""}</dd>
        </div>
        <div className="col-span-2 flex flex-wrap gap-1 md:col-span-4">
          {codes.map((code) => (
            <span key={code} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">
              {REASON_LABELS[code] ?? code}
            </span>
          ))}
        </div>
      </dl>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
            <CalendarClock size={14} />
            排程总览
          </div>
          <h1 className="text-2xl font-black tracking-normal text-blue-950">排程总览</h1>
          <p className="mt-1 text-sm text-blue-700">按日期和班组查看任务、产能利用率和风险；可人工调整、锁定、自动重排和紧急插单。</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-bold text-slate-700">
            开始日期
            <input type="date" className="field mt-1" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-slate-700">
            天数
            <select className="field mt-1" value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={7}>7 天</option>
              <option value={14}>14 天</option>
              <option value={30}>30 天</option>
              <option value={60}>60 天</option>
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">
            班组
            <select className="field mt-1" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
              <option value="">全部班组</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setTab("plan"); }} className={`secondary-btn ${tab === "plan" ? "border-blue-400 bg-blue-50" : ""}`}>
          排程计划
        </button>
        {isAdmin && (
          <button type="button" onClick={() => { setTab("logs"); loadLogs(); }} className={`secondary-btn ${tab === "logs" ? "border-blue-400 bg-blue-50" : ""}`}>
            审计记录
          </button>
        )}
      </div>

      {message && <p className="rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}

      {tab === "plan" && (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setShowReplan(true)} className="primary-btn">
              <RefreshCw size={18} />
              自动重新排程
            </button>
            <button type="button" onClick={() => setInsertOpen(true)} className="secondary-btn border-red-200 text-red-700">
              <Zap size={18} />
              紧急插单
            </button>
            <button type="button" onClick={() => { setSubmitOpen(true); }} className="secondary-btn">
              <Send size={18} />
              送检登记
            </button>
            <button type="button" onClick={submitAllInbound} className="secondary-btn">
              <Check size={18} />
              全部按已入库送检
            </button>
          </div>

          {loading && <div className="panel p-5 text-sm text-slate-500">正在加载...</div>}

          {!loading && plan && (
            <>
              {plan.warnings.length > 0 && (
                <section className="space-y-1">
                  {plan.warnings.map((warning, index) => (
                    <p key={index} className="flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {warning}
                    </p>
                  ))}
                </section>
              )}

              <section className="panel overflow-hidden">
                <div className="border-b border-line bg-blue-50/70 px-4 py-3">
                  <h2 className="font-black text-blue-950">每日班组产能负荷（{plan.from} ~ {plan.to}）</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-line bg-slate-50 text-left text-xs font-black text-slate-500">
                        <th className="px-3 py-2">日期</th>
                        <th className="px-3 py-2">班组</th>
                        <th className="px-3 py-2 text-right">计划(标准单位)</th>
                        <th className="px-3 py-2 text-right">可用产能</th>
                        <th className="px-3 py-2 text-right">剩余产能</th>
                        <th className="px-3 py-2 text-right">利用率</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.dailyLoads.map((load) => (
                        <tr key={`${load.date}-${load.teamId}`} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 font-black">{load.date}</td>
                          <td className="px-3 py-2">{plan.teams.find((team) => team.id === load.teamId)?.name ?? "-"}</td>
                          <td className="px-3 py-2 text-right">{load.plannedUnits.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{load.capacityUnits.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right">{Math.max(0, load.capacityUnits - load.plannedUnits).toLocaleString()}</td>
                          <td className={`px-3 py-2 text-right font-black ${load.utilization > 100 ? "text-red-600" : load.utilization > 90 ? "text-amber-600" : "text-slate-700"}`}>
                            {load.utilization}%
                          </td>
                        </tr>
                      ))}
                      {plan.dailyLoads.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-500">
                            当前窗口没有排程任务。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="panel overflow-hidden">
                <div className="border-b border-line bg-blue-50/70 px-4 py-3">
                  <h2 className="font-black text-blue-950">排程任务（{plan.tasks.length}）</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-line bg-slate-50 text-left text-xs font-black text-slate-500">
                        <th className="px-3 py-2">日期</th>
                        <th className="px-3 py-2">班组</th>
                        <th className="px-3 py-2">订单/款号</th>
                        <th className="px-3 py-2">颜色/尺码</th>
                        <th className="px-3 py-2">类型</th>
                        <th className="px-3 py-2 text-right">计划</th>
                        <th className="px-3 py-2 text-right">完成</th>
                        <th className="px-3 py-2">风险</th>
                        <th className="px-3 py-2">状态/锁定</th>
                        <th className="px-3 py-2 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.tasks.map((task) => (
                        <tr key={task.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 font-black">{task.scheduled_date}</td>
                          <td className="px-3 py-2">{task.teamName ?? "-"}</td>
                          <td className="px-3 py-2">
                            <p className="font-black">{task.order?.po_number ?? "-"}</p>
                            <p className="text-xs text-slate-500">{task.item?.sku ?? "-"}</p>
                          </td>
                          <td className="px-3 py-2">{task.item?.color ?? "-"} / {task.item?.size ?? "-"}</td>
                          <td className="px-3 py-2 text-xs font-bold">{task.inspection_type === "normal" ? "检品" : task.inspection_type === "xray" ? "X线" : "出差"}</td>
                          <td className="px-3 py-2 text-right font-black">{task.planned_quantity.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{task.completed_quantity.toLocaleString()}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded px-1.5 py-0.5 text-[11px] font-black ${RISK_LABELS[task.riskLevel]?.className ?? "bg-emerald-100 text-emerald-700"}`}>
                              {RISK_LABELS[task.riskLevel]?.text ?? "正常"}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">{task.status}</span>
                            {task.locked && <Lock size={13} className="ml-1 inline text-amber-600" />}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                className="secondary-btn h-9 px-2.5 text-xs"
                                onClick={() => setAdjustTask(task)}
                                disabled={task.status === "已完成" || task.status === "已取消"}
                              >
                                <Settings2 size={14} />
                                调整
                              </button>
                              <button type="button" onClick={() => openOrderPlan(task.order_id)} className="secondary-btn h-9 px-2.5 text-xs">
                                <CalendarClock size={14} />
                                订单计划
                              </button>
                              <button type="button" onClick={() => toggleLock(task)} className="icon-btn text-amber-600" aria-label={task.locked ? "解锁" : "锁定"} title={task.locked ? "解锁（自动重排可修改）" : "锁定（自动重排不修改）"}>
                                {task.locked ? <LockOpen size={16} /> : <Lock size={16} />}
                              </button>
                              <button type="button" onClick={() => setExplainTask(task)} className="icon-btn text-blue-700" aria-label="排程解释" title="为什么安排在这一天">
                                <Info size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {plan.tasks.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-3 py-4 text-center text-sm text-slate-500">
                            暂无任务，点击「自动重新排程」生成。
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {tab === "logs" && isAdmin && (
        <section className="panel overflow-hidden">
          <div className="border-b border-line bg-blue-50/70 px-4 py-3">
            <h2 className="font-black text-blue-950">排程审计记录（{logs.length}）</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-line bg-slate-50 text-left text-xs font-black text-slate-500">
                  <th className="px-3 py-2">时间</th>
                  <th className="px-3 py-2">操作人</th>
                  <th className="px-3 py-2">动作</th>
                  <th className="px-3 py-2">原因</th>
                  <th className="px-3 py-2">变更对比</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-3 py-2 text-xs">{new Date(log.created_at).toLocaleString("zh-CN")}</td>
                    <td className="px-3 py-2 text-xs">{log.user_email ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-black text-blue-700">{log.action}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{log.reason ?? "-"}</td>
                    <td className="px-3 py-2">
                      <details className="text-xs">
                        <summary className="cursor-pointer font-bold text-blue-700">查看 before/after</summary>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-[11px] text-slate-600">
                          {JSON.stringify({ before: log.before_data, after: log.after_data }, null, 2)}
                        </pre>
                      </details>
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-500">暂无审计记录。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {adjustTask && (
        <AdjustModal
          task={adjustTask}
          teams={teams}
          onClose={() => setAdjustTask(null)}
          onSaved={async (messageText) => {
            setMessage(messageText);
            setAdjustTask(null);
            await load();
          }}
        />
      )}

      {showReplan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowReplan(false)}>
          <div className="w-full max-w-md space-y-3 rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h3 className="text-lg font-black text-blue-950">确认自动重新排程？</h3>
            <p className="text-sm text-slate-600">
              将重新计算所有未完成订单：旧自动任务标记为「已调整」，已完成的检品记录、已完成/锁定的排程任务不会被修改。确认后无法直接撤销（可查看审计记录）。
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowReplan(false)} className="secondary-btn flex-1">取消</button>
              <button type="button" onClick={runReplan} disabled={replanning} className="primary-btn flex-1">
                {replanning ? "排程中..." : "确认执行"}
              </button>
            </div>
          </div>
        </div>
      )}

      {insertOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setInsertOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-blue-950">紧急插单</h3>
              <button type="button" onClick={() => setInsertOpen(false)} className="icon-btn" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_120px]">
              <label className="text-sm font-bold text-slate-700">
                订单明细（款号/颜色/尺码）
                <select className="field mt-1" value={insertItemId} onChange={(event) => { setInsertItemId(event.target.value); setPreview(null); }}>
                  <option value="">选择明细</option>
                  {allItems.map(({ item, order }) => (
                    <option key={item.id} value={item.id}>
                      {order.po_number} / {item.sku} / {item.color} / {item.size}（{item.quantity} 双）
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold text-slate-700">
                插单数量
                <input type="number" min="1" className="field mt-1" value={insertQty} onChange={(event) => { setInsertQty(event.target.value); setPreview(null); }} />
              </label>
            </div>
            <label className="text-sm font-bold text-slate-700">
              插单原因
              <input className="field mt-1" placeholder="例如：客户临时提前交货" value={insertReason} onChange={(event) => setInsertReason(event.target.value)} />
            </label>

            {!preview && (
              <button type="button" onClick={runInsertPreview} className="secondary-btn w-full">
                <Zap size={16} />
                计算产能缺口与影响
              </button>
            )}

            {preview && (
              <div className="space-y-3 rounded border border-line bg-blue-50/70 p-3">
                {preview.canFit ? (
                  <p className="rounded bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">
                    可以插入！建议日期：{preview.suggestedDates.join("、") || "-"}
                  </p>
                ) : (
                  <p className="rounded bg-red-50 px-3 py-2 text-sm font-black text-red-700">当前产能不足，缺口 {preview.capacityGap} 双，无法按 Deadline 完成。</p>
                )}
                <div className="text-sm">
                  <p className="font-black text-blue-950">插单影响分析</p>
                  <p className="mt-1 text-slate-600">
                    受影响订单 {preview.summary.delayedOrders} 个 · 新增延期风险 {preview.summary.newRedRisks} · 新增送货预警 {preview.summary.newOrangeRisks}
                  </p>
                  {preview.impactedUnits.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {preview.impactedUnits.slice(0, 10).map((row) => (
                        <li key={row.unitId} className="rounded bg-white px-2 py-1">
                          明细 {row.unitId.slice(0, 8)}：预计完成 {row.beforeProjected ?? "-"} → {row.afterProjected ?? "-"}（{row.beforeRisk} → {row.newRisk}）
                        </li>
                      ))}
                      {preview.impactedUnits.length > 10 && <li>...等共 {preview.impactedUnits.length} 条</li>}
                    </ul>
                  )}
                  {preview.shiftedTasks.length > 0 && (
                    <p className="mt-2 text-xs text-slate-600">将顺延 {preview.shiftedTasks.length} 个现有任务（仅自动任务、未锁定且未开始）。</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={runInsertPreview} className="secondary-btn flex-1">
                    重新计算
                  </button>
                  <button type="button" onClick={confirmInsert} disabled={inserting || !preview.canFit} className="primary-btn flex-1">
                    {inserting ? "应用中..." : "确认应用插单"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {submitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSubmitOpen(false)}>
          <div className="w-full max-w-md space-y-3 rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-blue-950">送检登记</h3>
              <button type="button" onClick={() => setSubmitOpen(false)} className="icon-btn" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500">登记后可排程数量。入库时数量会自动同步且状态自动变为可送检；这里可手动调整数量或改回待送检/暂停送检。</p>
            <label className="text-sm font-bold text-slate-700">
              订单明细
              <select
                className="field mt-1"
                value={submitItemId}
                onChange={(event) => {
                  const id = event.target.value;
                  setSubmitItemId(id);
                  const found = allItems.find((row) => row.item.id === id);
                  if (found) {
                    setSubmitQty(String(found.item.submitted_quantity ?? 0));
                    setSubmitStatus(found.item.submit_status ?? "pending");
                  }
                }}
              >
                <option value="">选择明细</option>
                {allItems.map(({ item, order }) => (
                  <option key={item.id} value={item.id}>
                    {order.po_number} / {item.sku} / {item.color} / {item.size}（已入 {item.inbound_quantity} / 已送检 {item.submitted_quantity} / 总 {item.quantity}）
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-700">
              可送检数量
              <input type="number" min="0" className="field mt-1" value={submitQty} onChange={(event) => setSubmitQty(event.target.value)} />
            </label>
            <label className="text-sm font-bold text-slate-700">
              送检状态
              <select className="field mt-1" value={submitStatus} onChange={(event) => setSubmitStatus(event.target.value as "pending" | "ready" | "paused")}>
                <option value="ready">可送检（参与排程）</option>
                <option value="pending">待送检（不参与排程）</option>
                <option value="paused">暂停送检（不参与排程）</option>
              </select>
            </label>
            <button type="button" onClick={saveSubmit} className="primary-btn w-full">
              <Check size={16} />
              保存送检登记
            </button>
          </div>
        </div>
      )}

      {explainTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExplainTask(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-blue-950">排程解释</h3>
              <button type="button" onClick={() => setExplainTask(null)} className="icon-btn" aria-label="关闭">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm font-bold text-slate-600">
              {explainTask.order?.po_number ?? "-"} · {explainTask.item?.sku ?? "-"} · {explainTask.scheduled_date} · {explainTask.teamName ?? "-"}
            </p>
            {renderExplanation(explainTask)}
          </div>
        </div>
      )}

      {orderPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOrderPlanId(null)}>
          <div className="max-h-[85vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-blue-950">订单检品计划</h3>
              <button type="button" onClick={() => setOrderPlanId(null)} className="icon-btn" aria-label="关闭">
                <X size={18} />
              </button>
            </div>

            {orderPlanLoading && <p className="text-sm text-slate-500">正在加载...</p>}

            {!orderPlanLoading && orderPlan && (
              <>
                <p className="text-sm font-bold text-slate-600">
                  {orderPlan.order?.po_number ?? "-"} · {orderPlan.order?.customer_name ?? "-"} · 总数 {orderPlan.order?.quantity ?? "-"} 双
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded border border-line bg-blue-50 p-2">
                    <p className="text-xs font-bold text-slate-500">剩余待排</p>
                    <p className="font-black">{orderPlan.summary.remainingPlanned.toLocaleString()}</p>
                  </div>
                  <div className="rounded border border-line bg-blue-50 p-2">
                    <p className="text-xs font-bold text-slate-500">目标完成（提前7个工作日）</p>
                    <p className="font-black">{orderPlan.summary.targetDate ?? "-"}</p>
                  </div>
                  <div className="rounded border border-line bg-blue-50 p-2">
                    <p className="text-xs font-bold text-slate-500">当前预计完成</p>
                    <p className="font-black">{orderPlan.summary.projectedDate ?? "-"}</p>
                  </div>
                  <div className="rounded border border-line bg-blue-50 p-2">
                    <p className="text-xs font-bold text-slate-500">风险等级</p>
                    <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-black ${RISK_LABELS[orderPlan.summary.riskLevel]?.className ?? "bg-emerald-100 text-emerald-700"}`}>
                      {RISK_LABELS[orderPlan.summary.riskLevel]?.text ?? "正常"}
                    </span>
                  </div>
                </div>

                <div className="rounded border border-line bg-blue-50/60 p-3">
                  <p className="mb-2 font-black text-blue-950">每日检品计划</p>
                  <div className="space-y-1">
                    {orderPlan.summary.perDate.map((row) => (
                      <div key={row.date} className="flex items-center justify-between rounded bg-white px-3 py-2 text-sm">
                        <span className="font-black">{row.date}</span>
                        <span className="flex items-center gap-2">
                          {row.urgent && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-700">紧急</span>}
                          <span className="font-black">{row.quantity.toLocaleString()} 双</span>
                          <span className="text-xs text-emerald-700">已完成 {row.completed.toLocaleString()}</span>
                        </span>
                      </div>
                    ))}
                    {orderPlan.summary.perDate.length === 0 && <p className="text-sm text-slate-500">该订单暂无排程任务。</p>}
                  </div>
                </div>

                <div className="rounded border border-line bg-blue-50/60 p-3">
                  <p className="mb-2 font-black text-blue-950">任务明细（{orderPlan.tasks.length}）</p>
                  <div className="space-y-1">
                    {orderPlan.tasks.map((task) => (
                      <div key={task.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-3 py-2 text-sm">
                        <span className="font-black">{task.scheduled_date} · {task.teamName ?? "-"}</span>
                        <span className="flex items-center gap-2">
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-700">{task.status}</span>
                          <span className="font-black">{task.planned_quantity.toLocaleString()} 双</span>
                        </span>
                      </div>
                    ))}
                    {orderPlan.tasks.length === 0 && <p className="text-sm text-slate-500">暂无任务。</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AdjustModal({
  task,
  teams,
  onClose,
  onSaved
}: {
  task: PlanTask;
  teams: InspectionTeam[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [date, setDate] = useState(task.scheduled_date);
  const [teamId, setTeamId] = useState(task.team_id ?? "");
  const [quantity, setQuantity] = useState(String(task.planned_quantity));
  const [priority, setPriority] = useState<"普通" | "加急" | "特急">(task.priority);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!reason.trim()) {
      onSaved("请填写调整原因（用于审计）。");
      return;
    }
    setSaving(true);
    const { error } = await adjustScheduleTask(task.id, {
      scheduled_date: date,
      team_id: teamId || null,
      planned_quantity: Number(quantity),
      priority,
      reason,
      locked: true
    });
    setSaving(false);
    if (error) {
      onSaved(`调整失败：${error.message}`);
      return;
    }
    onSaved("任务已调整并自动锁定，写入了审计记录。");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded bg-white p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-black text-blue-950">人工调整排程</h3>
          <button type="button" onClick={onClose} className="icon-btn" aria-label="关闭">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          调整后任务自动锁定；已完成的任务不可修改计划数量。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-bold text-slate-700">
            日期
            <input type="date" className="field mt-1" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-slate-700">
            班组
            <select className="field mt-1" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">未分配</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold text-slate-700">
            数量
            <input type="number" min="1" className="field mt-1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-slate-700">
            优先级
            <select className="field mt-1" value={priority} onChange={(event) => setPriority(event.target.value as "普通" | "加急" | "特急")}>
              <option value="普通">普通</option>
              <option value="加急">加急</option>
              <option value="特急">特急</option>
            </select>
          </label>
        </div>
        <label className="text-sm font-bold text-slate-700">
          调整原因（必填）
          <textarea className="field mt-1 min-h-16 resize-none" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="例如：客户提前交货，调整到 8/22" />
        </label>
        <button type="button" onClick={save} disabled={saving} className="primary-btn w-full">
          {saving ? "保存中..." : "保存并锁定"}
        </button>
      </div>
    </div>
  );
}
