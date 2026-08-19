"use client";

import { useCurrentProfile } from "@/components/AuthGuard";
import { isAdminEmail } from "@/lib/security";
import type { InspectionTeam, ProductionCalendarEntry, StyleCategory, TeamWorkException } from "@/lib/types";
import {
  createInspectionTeam,
  createStyleFactor,
  deleteCalendarEntry,
  deleteInspectionTeam,
  deleteStyleFactor,
  deleteTeamException,
  getInspectionTeams,
  getProductionCalendar,
  getStyleFactors,
  getTeamExceptions,
  saveCalendarEntry,
  saveTeamException,
  updateInspectionTeam,
  updateStyleFactor
} from "@/src/api/scheduleApi";
import { CalendarDays, Factory, Layers, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

const TYPE_OPTIONS = [
  { value: "normal", label: "普通检品" },
  { value: "xray", label: "X线" },
  { value: "field", label: "出差检品" }
] as const;

const STATUS_LABELS: Record<string, string> = {
  pending: "待送检",
  ready: "可送检",
  paused: "暂停送检"
};

type TeamDraft = {
  id?: string;
  name: string;
  daily_hours: string;
  standard_daily_capacity: string;
  baseline_members: string;
  current_members: string;
  max_daily_capacity: string;
  inspection_types: string[];
  enabled: boolean;
  factors: { normal: string; xray: string; field: string };
};

const emptyTeamDraft = (): TeamDraft => ({
  name: "",
  daily_hours: "8",
  standard_daily_capacity: "5000",
  baseline_members: "10",
  current_members: "10",
  max_daily_capacity: "6000",
  inspection_types: ["normal"],
  enabled: true,
  factors: { normal: "1", xray: "0.8", field: "0.7" }
});

export default function ScheduleTeamsPage() {
  const profile = useCurrentProfile();
  const isAdmin = profile?.role === "admin" || isAdminEmail(profile?.email ?? "");
  const [teams, setTeams] = useState<InspectionTeam[]>([]);
  const [styles, setStyles] = useState<StyleCategory[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<ProductionCalendarEntry[]>([]);
  const [exceptions, setExceptions] = useState<TeamWorkException[]>([]);
  const [draft, setDraft] = useState<TeamDraft>(emptyTeamDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const [styleDraft, setStyleDraft] = useState({ name: "", factor: "1" });
  const [calendarDraft, setCalendarDraft] = useState({ date: new Date().toISOString().slice(0, 10), is_work_day: false, work_hours: "", remark: "" });
  const [exceptionDraft, setExceptionDraft] = useState({ team_id: "", date: new Date().toISOString().slice(0, 10), is_working: false, work_hours: "", capacity_factor: "", remark: "" });

  async function load() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [teamResult, styleResult, calendarResult, exceptionResult] = await Promise.all([getInspectionTeams(), getStyleFactors(), getProductionCalendar(), getTeamExceptions()]);
    setTeams((teamResult.data ?? []) as InspectionTeam[]);
    setStyles((styleResult.data ?? []) as StyleCategory[]);
    setCalendarEntries((calendarResult.data ?? []) as ProductionCalendarEntry[]);
    setExceptions((exceptionResult.data ?? []) as TeamWorkException[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function startEdit(team: InspectionTeam) {
    setEditingId(team.id);
    setDraft({
      id: team.id,
      name: team.name,
      daily_hours: String(team.daily_hours),
      standard_daily_capacity: String(team.standard_daily_capacity),
      baseline_members: String(team.baseline_members),
      current_members: String(team.current_members),
      max_daily_capacity: String(team.max_daily_capacity),
      inspection_types: team.inspection_types ?? ["normal"],
      enabled: team.enabled,
      factors: {
        normal: String(team.capacity_factors?.normal ?? 1),
        xray: String(team.capacity_factors?.xray ?? 0.8),
        field: String(team.capacity_factors?.field ?? 0.7)
      }
    });
  }

  async function saveTeam(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: draft.name.trim(),
      daily_hours: Number(draft.daily_hours),
      standard_daily_capacity: Number(draft.standard_daily_capacity),
      baseline_members: Number(draft.baseline_members),
      current_members: Number(draft.current_members),
      max_daily_capacity: Number(draft.max_daily_capacity),
      inspection_types: draft.inspection_types,
      enabled: draft.enabled,
      capacity_factors: {
        normal: Number(draft.factors.normal) || 1,
        xray: Number(draft.factors.xray) || 0.8,
        field: Number(draft.factors.field) || 0.7
      }
    };
    setMessage("");
    const { error } = editingId ? await updateInspectionTeam(editingId, payload) : await createInspectionTeam(payload);
    if (error) {
      setMessage(`保存班组失败：${error.message}`);
      return;
    }
    setMessage(editingId ? "班组已更新。" : "班组已创建。");
    setEditingId(null);
    setDraft(emptyTeamDraft());
    await load();
  }

  async function removeTeam(team: InspectionTeam) {
    if (!window.confirm(`确定删除班组「${team.name}」吗？已有排程任务的班组将保留记录但解除绑定。`)) return;
    const { error } = await deleteInspectionTeam(team.id);
    if (error) {
      setMessage(`删除失败：${error.message}`);
      return;
    }
    setMessage("班组已删除。");
    await load();
  }

  async function saveStyle(event: FormEvent) {
    event.preventDefault();
    const { error } = await createStyleFactor({ name: styleDraft.name.trim(), factor: Number(styleDraft.factor) });
    if (error) {
      setMessage(`保存款式系数失败：${error.message}`);
      return;
    }
    setStyleDraft({ name: "", factor: "1" });
    setMessage("款式系数已保存。");
    await load();
  }

  async function saveCalendarEntryRow(event: FormEvent) {
    event.preventDefault();
    const { error } = await saveCalendarEntry({
      date: calendarDraft.date,
      is_work_day: calendarDraft.is_work_day,
      work_hours: calendarDraft.work_hours ? Number(calendarDraft.work_hours) : null,
      remark: calendarDraft.remark.trim() || null
    });
    if (error) {
      setMessage(`保存日历失败：${error.message}`);
      return;
    }
    setMessage("工作日历已保存。");
    await load();
  }

  async function saveExceptionRow(event: FormEvent) {
    event.preventDefault();
    if (!exceptionDraft.team_id) {
      setMessage("请选择班组。");
      return;
    }
    const { error } = await saveTeamException({
      team_id: exceptionDraft.team_id,
      date: exceptionDraft.date,
      is_working: exceptionDraft.is_working,
      work_hours: exceptionDraft.work_hours ? Number(exceptionDraft.work_hours) : null,
      capacity_factor: exceptionDraft.capacity_factor ? Number(exceptionDraft.capacity_factor) : null,
      remark: exceptionDraft.remark.trim() || null
    });
    if (error) {
      setMessage(`保存班组例外失败：${error.message}`);
      return;
    }
    setMessage("班组例外已保存。");
    await load();
  }

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <section className="panel p-5 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded bg-blue-50 text-blue-700">
            <ShieldAlert size={26} />
          </div>
          <h1 className="text-xl font-black text-blue-950">只有管理员可以管理班组与产能</h1>
          <p className="mt-2 text-sm text-slate-500">这里可以配置班组、产能系数、工作日历和班组例外。</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 rounded bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-900">
          <Factory size={14} />
          管理员
        </div>
        <h1 className="text-2xl font-black tracking-normal text-blue-950">班组与产能管理</h1>
        <p className="mt-1 text-sm text-blue-700">配置检品班组、款式系数、公司工作日历与班组例外。产能全部可配置，不会写死在代码里。</p>
      </div>

      {message && <p className="rounded bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800">{message}</p>}
      {loading && <div className="panel p-5 text-sm text-slate-500">正在加载...</div>}

      {!loading && (
        <>
          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-blue-950">{editingId ? "编辑班组" : "新增班组"}</h2>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setDraft(emptyTeamDraft()); }} className="secondary-btn h-9 px-3 text-sm">
                  取消编辑
                </button>
              )}
            </div>
            <form onSubmit={saveTeam} className="grid gap-3 md:grid-cols-4">
              <label className="text-sm font-bold text-slate-700">
                班组名称
                <input className="field mt-1" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
              </label>
              <label className="text-sm font-bold text-slate-700">
                每日工作小时
                <input type="number" min="1" step="0.5" className="field mt-1" value={draft.daily_hours} onChange={(event) => setDraft({ ...draft, daily_hours: event.target.value })} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                标准日产能（满编 8 小时）
                <input type="number" min="1" className="field mt-1" value={draft.standard_daily_capacity} onChange={(event) => setDraft({ ...draft, standard_daily_capacity: event.target.value })} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                最大日产能
                <input type="number" min="1" className="field mt-1" value={draft.max_daily_capacity} onChange={(event) => setDraft({ ...draft, max_daily_capacity: event.target.value })} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                基准人数
                <input type="number" min="1" className="field mt-1" value={draft.baseline_members} onChange={(event) => setDraft({ ...draft, baseline_members: event.target.value })} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                当前人数
                <input type="number" min="0" className="field mt-1" value={draft.current_members} onChange={(event) => setDraft({ ...draft, current_members: event.target.value })} />
              </label>
              <label className="text-sm font-bold text-slate-700">
                可检品类
                <div className="mt-1 flex flex-wrap gap-2">
                  {TYPE_OPTIONS.map((option) => (
                    <label key={option.value} className="inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={draft.inspection_types.includes(option.value)}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            inspection_types: event.target.checked
                              ? [...draft.inspection_types, option.value]
                              : draft.inspection_types.filter((value) => value !== option.value)
                          })
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </label>
              <label className="inline-flex items-center gap-2 self-end pb-2 text-sm font-bold text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
                启用班组
              </label>
              <div className="grid grid-cols-3 gap-2 md:col-span-3">
                {(["normal", "xray", "field"] as const).map((type) => (
                  <label key={type} className="text-sm font-bold text-slate-700">
                    {TYPE_OPTIONS.find((option) => option.value === type)?.label}效率系数
                    <input type="number" min="0.1" step="0.1" className="field mt-1" value={draft.factors[type]} onChange={(event) => setDraft({ ...draft, factors: { ...draft.factors, [type]: event.target.value } })} />
                  </label>
                ))}
              </div>
              <button type="submit" className="primary-btn self-end md:col-span-1">
                <Save size={18} />
                保存班组
              </button>
            </form>
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 text-lg font-black text-blue-950">班组列表（{teams.length}）</h2>
            <div className="space-y-2">
              {teams.length === 0 && <p className="text-sm text-slate-500">还没有班组，先新增一个。</p>}
              {teams.map((team) => (
                <div key={team.id} className="flex items-center justify-between gap-3 rounded border border-line bg-blue-50/60 p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-blue-950">{team.name}</p>
                      {!team.enabled && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-black text-slate-600">已停用</span>}
                    </div>
                    <p className="mt-1 text-xs font-bold text-slate-600">
                      标准 {team.standard_daily_capacity} 双 / {team.daily_hours}h · 当前 {team.current_members}/{team.baseline_members} 人 · 最大 {team.max_daily_capacity} 双 · 品类 {(team.inspection_types ?? []).join("、")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => startEdit(team)} className="secondary-btn h-9 px-3 text-sm">
                      编辑
                    </button>
                    <button type="button" onClick={() => removeTeam(team)} className="icon-btn text-red-700" aria-label="删除">
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <Layers size={18} className="text-machine" />
                <h2 className="font-black text-blue-950">款式系数</h2>
              </div>
              <form onSubmit={saveStyle} className="mb-3 grid grid-cols-[1fr_90px_auto] gap-2">
                <input className="field" placeholder="名称（如 复杂款）" value={styleDraft.name} onChange={(event) => setStyleDraft({ ...styleDraft, name: event.target.value })} required />
                <input type="number" min="0.1" step="0.1" className="field" value={styleDraft.factor} onChange={(event) => setStyleDraft({ ...styleDraft, factor: event.target.value })} />
                <button type="submit" className="primary-btn h-11 px-3">
                  <Plus size={16} />
                </button>
              </form>
              <div className="space-y-2">
                {styles.map((style) => (
                  <div key={style.id} className="flex items-center justify-between gap-3 rounded border border-line bg-blue-50/60 p-2">
                    <div>
                      <p className="font-black">{style.name}</p>
                      <p className="text-xs text-slate-500">系数 {style.factor}{style.remark ? ` · ${style.remark}` : ""}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="secondary-btn h-8 px-2 text-xs"
                        onClick={async () => {
                          const factor = prompt(`设置「${style.name}」的系数（当前 ${style.factor}）：`, String(style.factor));
                          if (factor === null || Number(factor) <= 0) return;
                          const { error } = await updateStyleFactor(style.id, { factor: Number(factor) });
                          setMessage(error ? `修改失败：${error.message}` : "款式系数已更新。");
                          await load();
                        }}
                      >
                        改系数
                      </button>
                      <button
                        type="button"
                        className="icon-btn text-red-700"
                        aria-label="删除"
                        onClick={async () => {
                          if (!window.confirm(`删除款式类别「${style.name}」？`)) return;
                          const { error } = await deleteStyleFactor(style.id);
                          setMessage(error ? `删除失败：${error.message}` : "已删除。");
                          await load();
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <CalendarDays size={18} className="text-machine" />
                <h2 className="font-black text-blue-950">公司工作日历</h2>
              </div>
              <form onSubmit={saveCalendarEntryRow} className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_90px_auto]">
                <input type="date" className="field" value={calendarDraft.date} onChange={(event) => setCalendarDraft({ ...calendarDraft, date: event.target.value })} required />
                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input type="checkbox" className="h-4 w-4" checked={calendarDraft.is_work_day} onChange={(event) => setCalendarDraft({ ...calendarDraft, is_work_day: event.target.checked })} />
                  {calendarDraft.is_work_day ? "补班上班" : "放假停工"}
                </label>
                <input type="number" min="1" step="0.5" className="field" placeholder="小时(空=8)" value={calendarDraft.work_hours} onChange={(event) => setCalendarDraft({ ...calendarDraft, work_hours: event.target.value })} />
                <button type="submit" className="primary-btn h-11 px-3">
                  <Plus size={16} />
                </button>
              </form>
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {calendarEntries.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded border border-line bg-blue-50/60 p-2">
                    <div>
                      <p className="font-black">{entry.date}</p>
                      <p className="text-xs text-slate-500">
                        {entry.is_work_day ? "上班" : "放假"}{entry.work_hours ? ` · ${entry.work_hours} 小时` : ""}{entry.remark ? ` · ${entry.remark}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn text-red-700"
                      aria-label="删除"
                      onClick={async () => {
                        const { error } = await deleteCalendarEntry(entry.id);
                        setMessage(error ? `删除失败：${error.message}` : "已删除。");
                        await load();
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                {calendarEntries.length === 0 && <p className="text-sm text-slate-500">暂无日历条目（默认周一至周五上班）。</p>}
              </div>
            </div>
          </section>

          <section className="panel p-4">
            <h2 className="mb-3 text-lg font-black text-blue-950">班组例外（休息 / 加班 / 请假 / 临时增减产能）</h2>
            <form onSubmit={saveExceptionRow} className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_1fr_90px_90px_auto]">
              <select className="field" value={exceptionDraft.team_id} onChange={(event) => setExceptionDraft({ ...exceptionDraft, team_id: event.target.value })} required>
                <option value="">选择班组</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
              <input type="date" className="field" value={exceptionDraft.date} onChange={(event) => setExceptionDraft({ ...exceptionDraft, date: event.target.value })} required />
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={exceptionDraft.is_working} onChange={(event) => setExceptionDraft({ ...exceptionDraft, is_working: event.target.checked })} />
                {exceptionDraft.is_working ? "上班" : "休息"}
              </label>
              <input type="number" min="1" step="0.5" className="field" placeholder="小时" value={exceptionDraft.work_hours} onChange={(event) => setExceptionDraft({ ...exceptionDraft, work_hours: event.target.value })} />
              <input type="number" min="0.1" step="0.1" className="field" placeholder="产能系数(如0.8)" value={exceptionDraft.capacity_factor} onChange={(event) => setExceptionDraft({ ...exceptionDraft, capacity_factor: event.target.value })} />
              <button type="submit" className="primary-btn h-11 px-3">
                <Plus size={16} />
              </button>
            </form>
            <div className="space-y-2">
              {exceptions.map((exception) => {
                const team = teams.find((row) => row.id === exception.team_id);
                return (
                  <div key={exception.id} className="flex items-center justify-between gap-3 rounded border border-line bg-blue-50/60 p-2">
                    <div>
                      <p className="font-black">
                        {team?.name ?? "未知班组"} · {exception.date} · {exception.is_working ? "上班" : "休息"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {exception.work_hours ? ` ${exception.work_hours} 小时` : ""}
                        {exception.capacity_factor ? ` 系数 ${exception.capacity_factor}` : ""}
                        {exception.remark ? ` · ${exception.remark}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="icon-btn text-red-700"
                      aria-label="删除"
                      onClick={async () => {
                        const { error } = await deleteTeamException(exception.id);
                        setMessage(error ? `删除失败：${error.message}` : "已删除。");
                        await load();
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {exceptions.length === 0 && <p className="text-sm text-slate-500">暂无班组例外。</p>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
