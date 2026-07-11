"use client";

import { StatusBadge } from "@/components/StatusBadge";
import { shortDate } from "@/lib/format";
import { getReportPageData } from "@/src/api/inspectionApi";
import { buildInspectionReportSummary } from "@/src/services/reportService";
import { type InspectionRecord, type Order, type ReinspectionRecord } from "@/lib/types";
import { Download, Printer, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const pdfLabels: Record<string, string> = {
  "危害": "Hazard",
  "帮面和附件": "Upper and accessories",
  "中底和内里": "Insole and lining",
  "大底/插跟/贴合": "Outsole and bonding",
  "包装及表示不良": "Packing and labeling",
  "检针/X光": "Needle/X-ray",
  "常用补充": "Common"
};

function excelEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function excelCell(value: string | number | null | undefined, className = "") {
  return `<td class="${className}">${excelEscape(value)}</td>`;
}

function excelHeader(value: string | number | null | undefined, className = "") {
  return `<th class="${className}">${excelEscape(value)}</th>`;
}

function verticalExcelHeader(value: string | number | null | undefined, className = "") {
  const text = String(value ?? "");
  const chars = Array.from(text).map((char) => (char.trim() ? excelEscape(char) : "&nbsp;"));
  return `<th class="${className}">${chars.join("<br />")}</th>`;
}

export default function ReportPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [records, setRecords] = useState<InspectionRecord[]>([]);
  const [reinspections, setReinspections] = useState<ReinspectionRecord[]>([]);

  useEffect(() => {
    async function load() {
      const { data } = await getReportPageData(orderId);
      setOrder(data.order as Order | null);
      setRecords((data.records ?? []) as InspectionRecord[]);
      setReinspections((data.reinspections ?? []) as ReinspectionRecord[]);
    }

    load();
  }, [orderId]);

  const report = useMemo(() => buildInspectionReportSummary(order, records, reinspections), [order, records, reinspections]);

  async function downloadPdf() {
    if (!order) return;
    const currentOrder = order;
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF("portrait", "mm", "a4");
    const template = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = "/qc-report-template.png";
    });

    const scaleX = template.naturalWidth / 595.44;
    const scaleY = template.naturalHeight / 841.68;
    const fontFamily = '"Microsoft YaHei", "Yu Gothic", "Meiryo", Arial, sans-serif';
    const finalRows = report.finalRecordRows.filter((record) => record.finalQuantity > 0);
    const rows = finalRows.length > 0 ? finalRows : report.finalRecordRows;
    const rowsPerPage = 6;

    function createPage() {
      const canvas = document.createElement("canvas");
      canvas.width = template.naturalWidth;
      canvas.height = template.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF canvas unavailable");
      context.drawImage(template, 0, 0);
      context.textBaseline = "middle";
      return { canvas, context };
    }

    function px(pointX: number, pointY: number) {
      return { x: pointX * scaleX, y: pointY * scaleY };
    }

    function write(context: CanvasRenderingContext2D, value: string | number, pointX: number, pointY: number, options?: { size?: number; bold?: boolean; align?: CanvasTextAlign; color?: string }) {
      const position = px(pointX, pointY);
      context.font = `${options?.bold ? 700 : 500} ${options?.size ?? 10}px ${fontFamily}`;
      context.fillStyle = options?.color ?? "#000000";
      context.textAlign = options?.align ?? "left";
      context.fillText(String(value ?? ""), position.x, position.y);
    }

    function writeBox(context: CanvasRenderingContext2D, value: string | number, pointX: number, pointY: number, pointW: number, pointH: number, options?: { size?: number; bold?: boolean; align?: CanvasTextAlign; color?: string }) {
      const position = px(pointX, pointY);
      const width = pointW * scaleX;
      const height = pointH * scaleY;
      context.fillStyle = "rgba(255,255,255,0.92)";
      context.fillRect(position.x + 1, position.y + 1, Math.max(1, width - 2), Math.max(1, height - 2));
      context.font = `${options?.bold ? 700 : 500} ${options?.size ?? 10}px ${fontFamily}`;
      context.fillStyle = options?.color ?? "#000000";
      context.textAlign = options?.align ?? "center";
      const text = String(value ?? "");
      const x = options?.align === "left" ? position.x + 4 : options?.align === "right" ? position.x + width - 4 : position.x + width / 2;
      context.fillText(text.length > 24 ? `${text.slice(0, 23)}…` : text, x, position.y + height / 2);
    }

    function addPage(canvas: HTMLCanvasElement, first: boolean) {
      if (!first) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297);
    }

    const defectColumns = Array.from({ length: 52 }, (_, index) => 125.5 + index * 8.25);
    const groupedQuantities = report.grouped.flatMap((group) => group.items.map((item) => item.quantity));
    const pageCount = Math.max(1, Math.ceil(Math.max(rows.length, 1) / rowsPerPage));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const { canvas, context } = createPage();

      writeBox(context, currentOrder.po_number, 83, 64.1, 28, 4.2, { size: 8, bold: true, align: "left" });
      writeBox(context, currentOrder.customer_name, 83, 68.1, 28, 4.2, { size: 8, bold: true, align: "left" });
      writeBox(context, "QCFlow", 83, 72.1, 28, 4.2, { size: 8, bold: true, align: "left" });
      writeBox(context, currentOrder.factory_name, 119, 72.1, 30, 4.2, { size: 8, bold: true, align: "left" });
      writeBox(context, currentOrder.inbound_date ?? "-", 160, 72.1, 34, 4.2, { size: 8, bold: true });
      writeBox(context, new Date().toLocaleDateString(), 216, 72.1, 30, 4.2, { size: 8, bold: true });
      writeBox(context, currentOrder.shipping_date ?? "-", 260, 72.1, 34, 4.2, { size: 8, bold: true });

      groupedQuantities.slice(0, defectColumns.length).forEach((quantity, index) => {
        if (quantity <= 0) return;
        write(context, quantity, defectColumns[index], 230, { size: 8, bold: true, align: "center", color: "#b91c1c" });
      });

      const visibleRows = rows.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
      visibleRows.forEach((record, index) => {
        const y = 225 + index * 6.3;
        const stage = record.inspection_stage === "xray" ? "X線" : "検品";
        writeBox(context, `${stage} ${record.color || "-"} / ${record.size || "-"} ${record.defect_type} x${record.finalQuantity}`, 470, y, 67, 5.5, {
          size: 6,
          bold: true,
          align: "left",
          color: "#b91c1c"
        });
      });

      addPage(canvas, pageIndex === 0);
    }

    pdf.save(`検品検针報告書-${currentOrder.po_number}.pdf`);
  }

  function downloadExcel() {
    if (!order) return;
    const finalRows = report.finalRecordRows.filter((record) => record.finalQuantity > 0);
    const detailRows = finalRows.length > 0 ? finalRows : report.finalRecordRows;
    const stageText = (stage: string) => (stage === "xray" ? "X線" : "検品");
    const allDefects = report.grouped.flatMap((group) => group.items.map((item) => ({ group: group.group, type: item.type, quantity: item.quantity })));
    const leftColumns = ["NO", "品番", "注文NO", "カラー", "サイズ", "検品数", "区分", "備考"];
    const columnCount = Math.max(59, leftColumns.length + allDefects.length);
    const emptyCells = (count: number) => Array.from({ length: count }, () => "<td></td>").join("");
    const spanCell = (value: string | number | null | undefined, colspan: number, className = "") => `<td colspan="${colspan}" class="${className}">${excelEscape(value)}</td>`;
    const spanHeader = (value: string | number | null | undefined, colspan: number, className = "") => `<th colspan="${colspan}" class="${className}">${excelEscape(value)}</th>`;
    const defectTotal = (type: string) => detailRows.filter((record) => record.defect_type === type).reduce((sum, record) => sum + record.finalQuantity, 0);

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: "Yu Gothic", "Meiryo", "Microsoft YaHei", Arial, sans-serif; }
    table { border-collapse: collapse; table-layout: fixed; }
    col.narrow { width: 28px; }
    col.info { width: 58px; }
    th, td {
      border: 1px solid #000;
      padding: 2px 3px;
      font-size: 9px;
      text-align: center;
      vertical-align: middle;
      mso-number-format:"\\@";
      white-space: normal;
    }
    .title { height: 30px; font-size: 15px; font-weight: 700; background: #fff; }
    .info-label { background: #fff; font-weight: 700; text-align: left; }
    .info-value { background: #fff; text-align: left; }
    .group { background: #e7f3ff; font-weight: 700; }
    .subgroup { background: #f4f9ff; font-weight: 700; }
    .vertical { height: 178px; width: 24px; line-height: 1.08; font-weight: 700; }
    .left-vertical { height: 178px; width: 34px; line-height: 1.08; font-weight: 700; }
    .data-row td { height: 16px; }
    .total { background: #eef6ff; font-weight: 700; }
    .bad { color: #c00000; font-weight: 700; }
    .good { color: #008000; font-weight: 700; }
    .note { text-align: left; }
    .no-border { border: none; }
  </style>
</head>
<body>
  <table>
    <colgroup>
      ${leftColumns.map(() => '<col style="width:42px" />').join("")}
      ${allDefects.map(() => '<col class="narrow" />').join("")}
      ${emptyCells(Math.max(0, columnCount - leftColumns.length - allDefects.length)).replaceAll("<td></td>", '<col class="narrow" />')}
    </colgroup>
    <tr><td class="title" colspan="${columnCount}">検品検針報告書　/　检品检针报告书</td></tr>
    <tr>
      ${spanCell("検品報告書NO", 2, "info-label")}
      ${spanCell(order.po_number, 2, "info-value")}
      ${spanCell("得意先 / 客户名称", 2, "info-label")}
      ${spanCell(order.customer_name, 2, "info-value")}
      ${spanCell("工場名 / 工厂名称", 3, "info-label")}
      ${spanCell(order.factory_name, 4, "info-value")}
      ${spanCell("検品日", 2, "info-label")}
      ${spanCell(new Date().toLocaleDateString(), 3, "info-value")}
      ${emptyCells(columnCount - 20)}
    </tr>
    <tr>
      ${spanCell("ブランド名", 2, "info-label")}
      ${spanCell("QCFlow", 2, "info-value")}
      ${spanCell("注文NO / 订单号", 2, "info-label")}
      ${spanCell(order.po_number, 2, "info-value")}
      ${spanCell("品番 / 番号", 3, "info-label")}
      ${spanCell(order.sku, 4, "info-value")}
      ${spanCell("入荷日 / 来货日", 2, "info-label")}
      ${spanCell(order.inbound_date ?? "-", 3, "info-value")}
      ${emptyCells(columnCount - 20)}
    </tr>
    <tr>
      ${spanCell("検品数量", 2, "info-label")}
      ${spanCell(report.total, 2, "info-value")}
      ${spanCell("出荷日 / 出货日", 2, "info-label")}
      ${spanCell(order.shipping_date ?? "-", 2, "info-value")}
      ${spanCell("不良数", 3, "info-label")}
      ${spanCell(report.defectQty, 4, "info-value bad")}
      ${spanCell("不良率", 2, "info-label")}
      ${spanCell(report.rate, 3, "info-value bad")}
      ${emptyCells(columnCount - 20)}
    </tr>
    <tr>
      ${emptyCells(leftColumns.length)}
      ${report.grouped.map((group) => spanHeader(group.group, group.items.length, "group")).join("")}
      ${emptyCells(Math.max(0, columnCount - leftColumns.length - allDefects.length))}
    </tr>
    <tr>
      ${leftColumns.map((label) => verticalExcelHeader(label, "left-vertical")).join("")}
      ${allDefects.map((item) => verticalExcelHeader(item.type, "vertical")).join("")}
      ${emptyCells(Math.max(0, columnCount - leftColumns.length - allDefects.length))}
    </tr>
    ${
      detailRows.length === 0
        ? `<tr class="data-row">${spanCell("不良記録なし / 暂无不良记录", columnCount, "note")}</tr>`
        : detailRows
            .map((record, index) => {
              const left = [
                excelCell(index + 1),
                excelCell(order.sku),
                excelCell(order.po_number),
                excelCell(record.color || "-"),
                excelCell(record.size || "-"),
                excelCell(record.quantity),
                excelCell(stageText(record.inspection_stage)),
                excelCell(record.remark || "")
              ].join("");
              const defectCells = allDefects.map((item) => excelCell(item.type === record.defect_type ? record.finalQuantity || "" : "", item.type === record.defect_type ? "bad" : "")).join("");
              return `<tr class="data-row">${left}${defectCells}${emptyCells(Math.max(0, columnCount - leftColumns.length - allDefects.length))}</tr>`;
            })
            .join("")
    }
    <tr class="total">
      ${spanCell("合計 / 汇总", leftColumns.length)}
      ${allDefects.map((item) => excelCell(defectTotal(item.type) || "")).join("")}
      ${emptyCells(Math.max(0, columnCount - leftColumns.length - allDefects.length))}
    </tr>
    <tr>
      ${spanCell("最終不良 / 最终不良", 5, "info-label")}
      ${spanCell(report.defectQty, 3, "bad")}
      ${spanCell("二次検品良品戻し / 二检转良", 6, "info-label")}
      ${spanCell(report.recoveredQty, 3, "good")}
      ${spanCell("二次確認不良 / 二次确认仍不良", 6, "info-label")}
      ${spanCell(report.confirmedFailedQty, 3, "bad")}
      ${emptyCells(columnCount - 26)}
    </tr>
    <tr>
      ${spanCell("カラー・サイズ別不良 / 颜色尺码不良", columnCount, "subgroup")}
    </tr>
    <tr>
      ${spanHeader("カラー / 颜色", 4)}
      ${spanHeader("サイズ / 尺码", 4)}
      ${spanHeader("不良内容 / 问题", 8)}
      ${spanHeader("数量", 3)}
      ${spanHeader("最終結果 / 最终结果", 5)}
      ${emptyCells(columnCount - 24)}
    </tr>
    ${
      report.colorSizeRows.length === 0
        ? `<tr>${spanCell("不良記録なし / 暂无不良记录", columnCount, "note")}</tr>`
        : report.colorSizeRows
            .map(
              (row) =>
                `<tr>${spanCell(row.color, 4)}${spanCell(row.size, 4)}${spanCell(row.defectType, 8)}${spanCell(row.quantity, 3, "bad")}${spanCell("最終不良 / 最终不良", 5)}${emptyCells(columnCount - 24)}</tr>`
            )
            .join("")
    }
    <tr>
      ${spanCell("二次検品記録 / 二次检品记录", columnCount, "subgroup")}
    </tr>
    <tr>
      ${spanHeader("日時 / 日期", 4)}
      ${spanHeader("工程 / 环节", 4)}
      ${spanHeader("カラー / 颜色", 4)}
      ${spanHeader("サイズ / 尺码", 4)}
      ${spanHeader("不良内容 / 问题", 8)}
      ${spanHeader("良品戻し / 转良", 4)}
      ${spanHeader("再不良 / 仍不良", 4)}
      ${spanHeader("備考 / 备注", 8)}
      ${emptyCells(columnCount - 40)}
    </tr>
    ${
      reinspections.length === 0
        ? `<tr>${spanCell("二次検品記録なし / 暂无二检记录", columnCount, "note")}</tr>`
        : reinspections
            .map(
              (item) =>
                `<tr>${spanCell(shortDate(item.created_at), 4)}${spanCell(stageText(item.inspection_stage), 4)}${spanCell(item.color || "-", 4)}${spanCell(item.size || "-", 4)}${spanCell(item.defect_type, 8)}${spanCell(item.passed_quantity, 4, "good")}${spanCell(item.failed_quantity, 4, "bad")}${spanCell(item.remark || "-", 8)}${emptyCells(columnCount - 40)}</tr>`
            )
            .join("")
    }
  </table>
</body>
</html>`;

    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `検品検針報告書-${order.po_number || "report"}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (!order) {
    return <div className="panel p-5 text-sm text-slate-500">正在生成报告...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="overflow-hidden rounded border border-slate-900 bg-white">
        <div className="grid grid-cols-[1fr_1.6fr] border-b-2 border-slate-900">
          <div className="grid grid-cols-[120px_1fr] border-r-2 border-slate-900 text-sm">
            <div className="border-b border-r border-slate-900 p-2 font-black">检品报告书NO</div>
            <div className="border-b border-slate-900 p-2">{order.po_number}</div>
            <div className="border-b border-r border-slate-900 p-2 font-black">检品依赖者</div>
            <div className="border-b border-slate-900 p-2">{order.customer_name}</div>
            <div className="border-r border-slate-900 p-2 font-black">ブランド名</div>
            <div className="p-2">QCFlow</div>
          </div>
          <div className="p-4 text-center">
            <h1 className="text-2xl font-black tracking-normal">最终检品・检针 报告书</h1>
            <div className="mt-4 grid grid-cols-4 gap-px bg-slate-900 text-sm">
              <div className="bg-white p-2 font-black">工厂名</div>
              <div className="bg-white p-2">{order.factory_name}</div>
              <div className="bg-white p-2 font-black">入荷日</div>
              <div className="bg-white p-2">{order.inbound_date ?? "-"}</div>
              <div className="bg-white p-2 font-black">出荷日</div>
              <div className="bg-white p-2">{order.shipping_date ?? "-"}</div>
              <div className="bg-white p-2 font-black">检品終了日</div>
              <div className="bg-white p-2">{new Date().toLocaleDateString()}</div>
              <div className="bg-white p-2 font-black">番号</div>
              <div className="bg-white p-2">{order.sku}</div>
              <div className="bg-white p-2 font-black">状态</div>
              <div className="bg-white p-2">
                <StatusBadge status={order.status} />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-px bg-slate-900">
          {[
            ["入库总件数", report.total],
            ["一次不良", report.originalDefectQty],
            ["二检转良", report.recoveredQty],
            ["最终不良", report.defectQty]
          ].map(([label, value]) => (
            <div key={label} className="bg-white p-4 text-center">
              <p className="text-xs font-black text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-black tracking-normal">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["最终不良率", report.rate],
          ["二次确认仍不良", report.confirmedFailedQty],
          ["一次记录数", records.length],
          ["二次记录数", reinspections.length]
        ].map(([label, value]) => (
          <div key={label} className="panel p-4 text-center">
            <p className="text-xs font-black text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-black tracking-normal text-blue-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-emerald-700 px-4 py-3 text-white">
          <h2 className="font-black">二次检品汇总</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-emerald-50">
                <th className="border border-slate-300 px-3 py-2 text-left">阶段</th>
                <th className="border border-slate-300 px-3 py-2 text-left">不良原因</th>
                <th className="border border-slate-300 px-3 py-2 text-left">颜色</th>
                <th className="border border-slate-300 px-3 py-2 text-left">尺码</th>
                <th className="border border-slate-300 px-3 py-2 text-right">转良</th>
                <th className="border border-slate-300 px-3 py-2 text-right">仍不良</th>
                <th className="border border-slate-300 px-3 py-2 text-left">备注</th>
              </tr>
            </thead>
            <tbody>
              {reinspections.length === 0 && (
                <tr>
                  <td colSpan={7} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                    暂无二次检品记录
                  </td>
                </tr>
              )}
              {reinspections.map((item) => (
                <tr key={item.id}>
                  <td className="border border-slate-300 px-3 py-2 font-black">{item.inspection_stage === "xray" ? "X光" : "普通检品"}</td>
                  <td className="border border-slate-300 px-3 py-2">{item.defect_type}</td>
                  <td className="border border-slate-300 px-3 py-2">{item.color || "-"}</td>
                  <td className="border border-slate-300 px-3 py-2">{item.size || "-"}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-black text-emerald-700">{item.passed_quantity}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-black text-red-600">{item.failed_quantity}</td>
                  <td className="border border-slate-300 px-3 py-2">{item.remark || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-blue-950 px-4 py-3 text-white">
          <h2 className="font-black">颜色尺码不良统计</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-blue-50">
                <th className="border border-slate-300 px-3 py-2 text-left">颜色</th>
                <th className="border border-slate-300 px-3 py-2 text-left">尺码</th>
                <th className="border border-slate-300 px-3 py-2 text-left">不良原因</th>
                <th className="border border-slate-300 px-3 py-2 text-right">数量</th>
              </tr>
            </thead>
            <tbody>
              {report.colorSizeRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="border border-slate-300 px-3 py-4 text-center text-slate-500">
                    暂无不良尺码颜色记录
                  </td>
                </tr>
              )}
              {report.colorSizeRows.map((row) => (
                <tr key={`${row.color}-${row.size}-${row.defectType}`}>
                  <td className="border border-slate-300 px-3 py-2 font-black">{row.color}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.size}</td>
                  <td className="border border-slate-300 px-3 py-2">{row.defectType}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right font-black text-blue-800">{row.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel overflow-hidden">
        <div className="border-b border-line bg-slate-950 px-4 py-3 text-white">
          <h2 className="font-black">问题类别统计</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead>
              <tr>
                {report.grouped.map((group) => (
                  <th key={group.group} className="border border-slate-300 bg-slate-100 px-3 py-2 text-center font-black">
                    {group.group}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {report.grouped.map((group) => (
                  <td key={group.group} className="border border-slate-300 align-top">
                    <div className="border-b border-slate-300 bg-amber-50 px-3 py-2 text-center text-lg font-black">{group.quantity}</div>
                    <div className="divide-y divide-slate-200">
                      {group.items.map((item) => (
                        <div key={item.type} className="flex items-center justify-between gap-3 px-3 py-2">
                          <span>{item.type}</span>
                          <span className="font-black text-slate-700">{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-black">检品记录</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {report.finalRecordRows.length === 0 && <div className="panel p-4 text-sm text-slate-500">没有缺陷记录。</div>}
          {report.finalRecordRows.map((record) => (
            <article key={record.id} className="panel flex gap-3 p-3">
              {record.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.photo_url} alt={record.defect_type} className="h-20 w-20 shrink-0 rounded object-cover" />
              ) : (
                <div className="grid h-20 w-20 shrink-0 place-items-center rounded bg-slate-100 text-slate-400">
                  <ShieldCheck size={22} />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-black">
                  {record.defect_type} <span className="text-safety">最终 x {record.finalQuantity}</span>
                </p>
                {record.recoveredQuantity > 0 && <p className="mt-1 text-xs font-black text-emerald-700">二次转良 {record.recoveredQuantity} / 原不良 {record.quantity}</p>}
                <p className="mt-1 text-xs text-slate-500">{shortDate(record.created_at)}</p>
                {(record.color || record.size) && (
                  <p className="mt-1 text-xs font-bold text-blue-700">
                    {record.color || "-"} / {record.size || "-"}
                  </p>
                )}
                {record.remark && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{record.remark}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="sticky bottom-16 grid grid-cols-4 gap-3 rounded border border-line bg-white p-3 shadow-panel md:bottom-4">
        <Link href={`/inspect/${orderId}`} className="secondary-btn">
          检品
        </Link>
        <Link href={`/reinspect/${orderId}`} className="secondary-btn">
          二检
        </Link>
        <button type="button" onClick={() => window.print()} className="secondary-btn">
          <Printer size={18} />
          打印
        </button>
        <button type="button" onClick={downloadExcel} className="primary-btn">
          <Download size={18} />
          Excel
        </button>
      </div>
    </div>
  );
}
