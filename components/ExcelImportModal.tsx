"use client";

import { Button, Modal, Spinner, Badge } from "@/components/ui";
import { confirmExcelImport, downloadImportTemplate, previewExcelImport, type ImportPreviewData, type ImportResultData } from "@/src/api/excelImportApi";
import { isRowImportable, validateRow, type ExcelImportRow, type ImportInspectionPlan } from "@/src/utils/excelImport";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 50;

const PLAN_OPTIONS: Array<{ value: ImportInspectionPlan; label: string }> = [
  { value: "both", label: "检品 + X线" },
  { value: "normal", label: "只做检品" },
  { value: "xray", label: "只做X线" },
  { value: "field", label: "出差检品" }
];

function toText(value: unknown): string {
  return value == null ? "" : String(value);
}

function toNumber(value: string): number | null {
  const num = Number(value);
  return value.trim() === "" || !Number.isFinite(num) ? null : Math.round(num);
}

export function ExcelImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState<ExcelImportRow[]>([]);
  const [summary, setSummary] = useState<{ total: number; ok: number; needConfirm: number; error: number; totalCartons: number; totalQuantity: number } | null>(null);
  const [debug, setDebug] = useState<NonNullable<ImportPreviewData["debug"]> | null>(null);
  const [fileName, setFileName] = useState("");
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<ImportResultData | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep("upload");
    setLoading(false);
    setSubmitting(false);
    setMessage("");
    setRows([]);
    setSummary(null);
    setDebug(null);
    setFileName("");
    setPage(0);
    setResult(null);
  }, [open]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(rows.length / PAGE_SIZE)), [rows.length]);
  const visibleRows = useMemo(() => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [rows, page]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      setMessage("仅支持 .xlsx / .xls / .csv 文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("文件大小不能超过 5MB");
      return;
    }

    setLoading(true);
    setMessage("");
    const { data, error } = await previewExcelImport(file);
    setLoading(false);
    if (error || !data) {
      setMessage(error?.message ?? "解析失败，请检查文件格式");
      return;
    }
    setRows(data.rows);
    setSummary(data.summary);
    setDebug(data.debug ?? null);
    setFileName(file.name);
    setPage(0);
    setStep("preview");
  }

  function patchRow(index: number, patch: Partial<ExcelImportRow>) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const next: ExcelImportRow = { ...row, ...patch };
        validateRow(next);
        return next;
      })
    );
  }

  function patchNumeric(index: number, key: "quantityPerCarton" | "cartonCount" | "quantity", value: string) {
    patchRow(index, { [key]: toNumber(value) } as Partial<ExcelImportRow>);
  }

  const mismatchCount = useMemo(() => rows.filter((row) => row.status === "need_confirm" && isRowImportable(row, true)).length, [rows]);
  const blockedCount = useMemo(() => rows.filter((row) => !isRowImportable(row, true)).length, [rows]);
  const importableCount = useMemo(() => rows.filter((row) => isRowImportable(row, true)).length, [rows]);

  async function confirm() {
    if (importableCount <= 0) {
      setMessage("没有状态为「正常」的可导入数据，请先修正异常/需确认行");
      return;
    }
    const ok = window.confirm(
      `确认导入 ${importableCount} 条预约数据？${mismatchCount > 0 ? ` 其中 ${mismatchCount} 行数量不一致，将按 Excel 原始数量录入。` : ""}${blockedCount > 0 ? ` 另有 ${blockedCount} 行（异常/缺必填/日期无法解析/重复）将跳过。` : ""}`
    );
    if (!ok) return;

    setSubmitting(true);
    setMessage("");
    const { data, error } = await confirmExcelImport(rows);
    setSubmitting(false);
    if (error || !data) {
      setMessage(error?.message ?? "导入失败");
      return;
    }
    setResult(data);
    setStep("result");
  }

  function downloadErrorCsv() {
    const failed = (result?.results ?? []).filter((item) => !item.success);
    if (failed.length === 0) return;
    const header = "行号,结果,原因\n";
    const body = failed
      .map((item) => `${item.rowNumber},失败,${item.message.replace(/,/g, "，").replace(/[\r\n]+/g, " ")}`)
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "导入错误记录.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal open={open} onClose={onClose} size="xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Excel 批量导入预约</h3>
          <p className="mt-0.5 text-[13px] text-steel">上传 → 自动识别 → 检查 → 确认后才会写入预约数据。</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      {message && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-600">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          {message}
        </div>
      )}

      {step === "upload" && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-canvas/60 px-6 py-10 text-center transition-all duration-150 ease-out hover:border-machine/50 hover:bg-primary/5"
          >
            <Upload size={26} className="text-machine" />
            <p className="mt-3 text-sm font-semibold">点击选择 Excel 文件</p>
            <p className="mt-1 text-xs text-steel">支持 .xlsx / .xls / .csv，单文件不超过 5MB，最多 5000 行</p>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-steel">表头不一定要和模板完全一致，系统会自动识别同义字段。</p>
            <Button variant="secondary" size="sm" icon={<Download size={15} />} onClick={() => downloadImportTemplate()}>
              下载Excel模板
            </Button>
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-steel">
              <Spinner className="h-4 w-4" />
              正在解析...
            </div>
          )}
        </div>
      )}

      {step === "preview" && summary && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
            <div className="rounded-xl border border-line/80 bg-white p-3">
              <p className="text-xs text-steel">共识别</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.total}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white p-3">
              <p className="text-xs text-steel">正常</p>
              <p className="mt-1 text-2xl font-semibold text-success tabular-nums">{summary.ok}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white p-3">
              <p className="text-xs text-steel">需确认</p>
              <p className="mt-1 text-2xl font-semibold text-warning tabular-nums">{summary.needConfirm}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white p-3">
              <p className="text-xs text-steel">异常</p>
              <p className="mt-1 text-2xl font-semibold text-danger tabular-nums">{summary.error}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white p-3">
              <p className="text-xs text-steel">总箱数</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.totalCartons}</p>
            </div>
            <div className="rounded-xl border border-line/80 bg-white p-3">
              <p className="text-xs text-steel">总双数</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{summary.totalQuantity}</p>
            </div>
          </div>

          <p className="text-xs text-steel">
            文件：{fileName} · 可直接在表格中修改数据，修改后自动重新校验。
            {blockedCount > 0 ? ` 有 ${blockedCount} 行异常/缺必填/日期无法解析，将被跳过；` : ""}
            {mismatchCount > 0 ? ` ${mismatchCount} 行数量不一致，确认导入后按 Excel 原始数量录入。` : ""}
          </p>

          <div className="overflow-x-auto rounded-xl border border-line/80 bg-white">
            <table className="ui-table w-full min-w-[1560px]">
              <thead>
                <tr>
                  <th>状态</th>
                  <th>行</th>
                  <th>客户</th>
                  <th>工厂</th>
                  <th>订单号</th>
                  <th>品番</th>
                  <th>每箱数量</th>
                  <th>箱数</th>
                  <th>总数量</th>
                  <th>预约日期</th>
                  <th>款柜/出货日期</th>
                  <th>检验内容</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, visibleIndex) => {
                  const index = page * PAGE_SIZE + visibleIndex;
                  return (
                    <tr key={row.rowNumber}>
                      <td className="align-top">
                        {row.status === "error" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-danger">
                            <XCircle size={14} />
                            {row.errors[0] ?? "异常"}
                          </span>
                        ) : row.status === "need_confirm" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-warning">
                            <AlertTriangle size={14} />
                            {row.warnings[0] ?? "需人工确认"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-success">
                            <CheckCircle2 size={14} />
                            正常
                          </span>
                        )}
                      </td>
                      <td className="tabular-nums text-steel">{row.rowNumber}</td>
                      <td>
                        <input className="field h-9 min-w-24 px-2 py-1 text-xs" value={row.customerName} onChange={(event) => patchRow(index, { customerName: event.target.value })} />
                      </td>
                      <td>
                        <input className="field h-9 min-w-24 px-2 py-1 text-xs" value={row.factoryName} onChange={(event) => patchRow(index, { factoryName: event.target.value })} />
                      </td>
                      <td>
                        <input className="field h-9 min-w-24 px-2 py-1 text-xs" value={row.poNumber} onChange={(event) => patchRow(index, { poNumber: event.target.value })} />
                      </td>
                      <td>
                        <input className="field h-9 min-w-24 px-2 py-1 text-xs" value={row.sku} onChange={(event) => patchRow(index, { sku: event.target.value })} />
                      </td>
                      <td>
                        <input
                          className="field h-9 !w-28 px-2 py-1 text-xs tabular-nums"
                          type="number"
                          value={row.quantityPerCarton == null ? "" : String(row.quantityPerCarton)}
                          onChange={(event) => patchNumeric(index, "quantityPerCarton", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="field h-9 !w-28 px-2 py-1 text-xs tabular-nums"
                          type="number"
                          value={row.cartonCount == null ? "" : String(row.cartonCount)}
                          onChange={(event) => patchNumeric(index, "cartonCount", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="field h-9 !w-32 px-2 py-1 text-xs font-semibold tabular-nums"
                          type="number"
                          value={row.quantity == null ? "" : String(row.quantity)}
                          onChange={(event) => patchNumeric(index, "quantity", event.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="field h-9 w-32 px-2 py-1 text-xs"
                          type="date"
                          value={row.inboundDate ?? ""}
                          onChange={(event) => patchRow(index, { inboundDate: event.target.value || null })}
                        />
                      </td>
                      <td>
                        <input
                          className="field h-9 w-32 px-2 py-1 text-xs"
                          type="date"
                          value={row.shippingDate ?? ""}
                          onChange={(event) => patchRow(index, { shippingDate: event.target.value || null })}
                        />
                      </td>
                      <td>
                        <select
                          className="field h-8 px-2 py-1 text-xs"
                          value={row.inspectionPlan}
                          onChange={(event) => patchRow(index, { inspectionPlan: event.target.value as ImportInspectionPlan })}
                        >
                          {PLAN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input className="field h-9 min-w-28 px-2 py-1 text-xs" value={toText(row.remark)} onChange={(event) => patchRow(index, { remark: event.target.value || null })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                上一页
              </Button>
              <span className="text-xs text-steel">{page + 1} / {pageCount}</span>
              <Button variant="secondary" size="sm" disabled={page >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}>
                下一页
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" icon={<RefreshCw size={15} />} onClick={() => setStep("upload")}>
                重新上传
              </Button>
              <Button variant="primary" size="md" icon={<Upload size={15} />} loading={submitting} disabled={importableCount <= 0} onClick={confirm}>
                确认导入 {importableCount > 0 ? `${importableCount} 条` : ""}
              </Button>
            </div>
          </div>

          {debug && (
            <details className="rounded-xl border border-line/80 bg-canvas/60 px-4 py-2 text-xs text-steel">
              <summary className="cursor-pointer font-semibold">调试信息（原始表头 / 识别映射 / 值类型）</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(debug, null, 2)}</pre>
            </details>
          )}
        </div>
      )}

      {step === "result" && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl border border-line/80 bg-emerald-50/60 p-4">
            <FileSpreadsheet size={28} className="text-success" />
            <div>
              <p className="text-base font-semibold">导入完成</p>
              <p className="mt-0.5 text-sm text-steel">成功 {result.successCount} 条 · 失败 {result.failCount} 条</p>
            </div>
          </div>

          {result.failCount > 0 && (
            <div className="rounded-xl border border-line/80 bg-white">
              <div className="border-b border-line/60 px-4 py-2.5 text-sm font-semibold">失败原因</div>
              <div className="max-h-60 overflow-y-auto">
                {result.results
                  .filter((item) => !item.success)
                  .map((item) => (
                    <div key={item.rowNumber} className="flex items-start gap-2 border-b border-line/60 px-4 py-2 text-[13px] last:border-0">
                      <span className="shrink-0 font-semibold">第{item.rowNumber}行：</span>
                      <span className="text-steel">{item.message}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {result.failCount > 0 && (
              <Button variant="secondary" size="md" icon={<Download size={15} />} onClick={downloadErrorCsv}>
                下载错误记录
              </Button>
            )}
            <Button variant="primary" size="md" onClick={onClose}>完成</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
