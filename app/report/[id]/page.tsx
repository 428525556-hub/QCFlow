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

  async function downloadExcel() {
    if (!order) return;
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("検品検針報告書");

    const finalRows = report.finalRecordRows.filter((record) => record.finalQuantity > 0);
    const detailRows = finalRows.length > 0 ? finalRows : report.finalRecordRows;
    const stageText = (stage: string) => (stage === "xray" ? "X線" : "検品");
    const allDefects = report.grouped.flatMap((group) => group.items.map((item) => ({ group: group.group, type: item.type, quantity: item.quantity })));
    const leftColumns = ["NO", "品番", "注文NO", "カラー", "サイズ", "検品数", "区分", "備考"];
    const columnCount = Math.max(16, leftColumns.length + allDefects.length);
    const defectTotal = (type: string) => detailRows.filter((record) => record.defect_type === type).reduce((sum, record) => sum + record.finalQuantity, 0);
    const defectDetailRows = report.finalRecordRows.filter((record) => Number(record.quantity || 0) > 0 || Boolean(record.photo_url));
    const defectPhotoRows = defectDetailRows.filter((record) => Boolean(record.photo_url));

    const border = { style: "thin" as const, color: { argb: "FF000000" } };
    const baseAlignment = { vertical: "middle" as const, horizontal: "center" as const, wrapText: true };
    const titleFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFFFFFFF" } };
    const sectionFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE7F3FF" } };
    const headerFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFF4F9FF" } };
    const totalFill = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEEF6FF" } };

    worksheet.columns = Array.from({ length: columnCount }, (_, index) => ({ width: index < leftColumns.length ? 11 : 7 }));
    worksheet.views = [{ showGridLines: false }];

    function styleRange(rowNumber: number, fromColumn: number, toColumn: number, options: { fill?: typeof sectionFill; bold?: boolean; fontColor?: string; horizontal?: "left" | "center" | "right" } = {}) {
      for (let column = fromColumn; column <= toColumn; column += 1) {
        const cell = worksheet.getCell(rowNumber, column);
        cell.border = { top: border, left: border, bottom: border, right: border };
        cell.alignment = { ...baseAlignment, horizontal: options.horizontal ?? "center" };
        cell.font = { name: "Yu Gothic", size: 9, bold: options.bold ?? false, color: options.fontColor ? { argb: options.fontColor } : undefined };
        if (options.fill) cell.fill = options.fill;
      }
    }

    function merge(rowNumber: number, fromColumn: number, toColumn: number, value: string | number | null | undefined, options: { fill?: typeof sectionFill; bold?: boolean; fontColor?: string; horizontal?: "left" | "center" | "right" } = {}) {
      worksheet.mergeCells(rowNumber, fromColumn, rowNumber, toColumn);
      const cell = worksheet.getCell(rowNumber, fromColumn);
      cell.value = value ?? "";
      styleRange(rowNumber, fromColumn, toColumn, options);
    }

    function writeRow(values: Array<string | number | null | undefined>, rowNumber?: number, options: { fill?: typeof sectionFill; bold?: boolean; fontColor?: string; horizontal?: "left" | "center" | "right" } = {}) {
      const row = rowNumber ? worksheet.getRow(rowNumber) : worksheet.addRow([]);
      values.forEach((value, index) => {
        const cell = row.getCell(index + 1);
        cell.value = value ?? "";
      });
      styleRange(row.number, 1, Math.max(columnCount, values.length), options);
      row.commit();
      return row.number;
    }

    function sectionTitle(title: string) {
      const rowNumber = worksheet.rowCount + 1;
      merge(rowNumber, 1, columnCount, title, { fill: sectionFill, bold: true });
      worksheet.getRow(rowNumber).height = 20;
    }

    function getImageExtension(type: string): "png" | "jpeg" | "gif" {
      if (type.includes("png")) return "png";
      if (type.includes("gif")) return "gif";
      return "jpeg";
    }

    writeRow(["検品検針報告書 / 检品检针报告书"], undefined, { fill: titleFill, bold: true });
    merge(1, 1, columnCount, "検品検針報告書 / 检品检针报告书", { fill: titleFill, bold: true });
    worksheet.getRow(1).height = 26;

    writeRow(["検品報告書NO", order.po_number, "得意先 / 客户名称", order.customer_name, "工場名 / 工厂名称", order.factory_name, "検品日", new Date().toLocaleDateString()], undefined, { bold: true });
    writeRow(["ブランド名", "QCFlow", "注文NO / 订单号", order.po_number, "品番 / 番号", order.sku, "入荷日 / 来货日", order.inbound_date ?? "-"], undefined, { bold: true });
    writeRow(["検品数量", report.total, "出荷日 / 出货日", order.shipping_date ?? "-", "不良数", report.defectQty, "不良率", report.rate], undefined, { bold: true });

    const defectStartColumn = leftColumns.length + 1;
    writeRow([...leftColumns, ...allDefects.map((item) => item.type)], undefined, { fill: headerFill, bold: true });
    if (detailRows.length === 0) {
      merge(worksheet.rowCount + 1, 1, columnCount, "不良記録なし / 暂无不良记录", { horizontal: "left" });
    } else {
      detailRows.forEach((record, index) => {
        const defectValues = allDefects.map((item) => (item.type === record.defect_type ? record.finalQuantity || "" : ""));
        writeRow([index + 1, order.sku, order.po_number, record.color || "-", record.size || "-", record.quantity, stageText(record.inspection_stage), record.remark || "", ...defectValues]);
      });
    }
    const totalRowValues = Array.from({ length: leftColumns.length }, (_, index) => (index === 0 ? "合計 / 汇总" : ""));
    writeRow([...totalRowValues, ...allDefects.map((item) => defectTotal(item.type) || "")], undefined, { fill: totalFill, bold: true });
    writeRow(["最終不良 / 最终不良", report.defectQty, "二次検品良品戻し / 二检转良", report.recoveredQty, "二次確認不良 / 二次确认仍不良", report.confirmedFailedQty], undefined, { bold: true });

    sectionTitle("カラー・サイズ別不良 / 颜色尺码不良");
    writeRow(["カラー / 颜色", "サイズ / 尺码", "不良内容 / 问题", "数量", "最終結果 / 最终结果"], undefined, { fill: headerFill, bold: true });
    if (report.colorSizeRows.length === 0) {
      merge(worksheet.rowCount + 1, 1, columnCount, "不良記録なし / 暂无不良记录", { horizontal: "left" });
    } else {
      report.colorSizeRows.forEach((row) => writeRow([row.color, row.size, row.defectType, row.quantity, "最終不良 / 最终不良"]));
    }

    sectionTitle("二次検品記録 / 二次检品记录");
    writeRow(["日時 / 日期", "工程 / 环节", "カラー / 颜色", "サイズ / 尺码", "不良内容 / 问题", "良品戻し / 转良", "再不良 / 仍不良", "備考 / 备注"], undefined, { fill: headerFill, bold: true });
    if (reinspections.length === 0) {
      merge(worksheet.rowCount + 1, 1, columnCount, "二次検品記録なし / 暂无二检记录", { horizontal: "left" });
    } else {
      reinspections.forEach((item) => writeRow([shortDate(item.created_at), stageText(item.inspection_stage), item.color || "-", item.size || "-", item.defect_type, item.passed_quantity, item.failed_quantity, item.remark || "-"]));
    }

    sectionTitle("不良品明細 / 不良品明细");
    writeRow(["日付 / 日期", "工程 / 环节", "注文NO / 订单号", "品番 / 番号", "カラー / 颜色", "サイズ / 尺码", "不良内容 / 问题", "一次不良", "二検良品 / 二检转良", "最終不良 / 最终不良", "備考 / 备注"], undefined, { fill: headerFill, bold: true });
    if (defectDetailRows.length === 0) {
      merge(worksheet.rowCount + 1, 1, columnCount, "不良記録なし / 暂无不良记录", { horizontal: "left" });
    } else {
      defectDetailRows.forEach((record) =>
        writeRow([shortDate(record.created_at), stageText(record.inspection_stage), order.po_number, order.sku, record.color || "-", record.size || "-", record.defect_type, record.quantity, record.recoveredQuantity, record.finalQuantity, record.remark || "-"])
      );
    }

    sectionTitle("不良品写真 / 不良品图片");
    writeRow(["日付 / 日期", "工程 / 环节", "注文NO / 订单号", "品番 / 番号", "カラー / 颜色", "サイズ / 尺码", "不良内容 / 问题", "数量", "備考 / 备注", "写真 / 图片"], undefined, { fill: headerFill, bold: true });
    if (defectPhotoRows.length === 0) {
      merge(worksheet.rowCount + 1, 1, columnCount, "写真なし / 暂无图片", { horizontal: "left" });
    } else {
      for (const record of defectPhotoRows) {
        const rowNumber = writeRow([shortDate(record.created_at), stageText(record.inspection_stage), order.po_number, order.sku, record.color || "-", record.size || "-", record.defect_type, record.quantity, record.remark || "", ""]);
        const row = worksheet.getRow(rowNumber);
        row.height = 95;
        worksheet.getColumn(10).width = 24;
        try {
          const response = await fetch(record.photo_url!, { cache: "force-cache" });
          if (!response.ok) throw new Error("Photo download failed");
          const blob = await response.blob();
          const buffer = await blob.arrayBuffer();
          const imageId = workbook.addImage({ buffer, extension: getImageExtension(blob.type) });
          worksheet.addImage(imageId, {
            tl: { col: 9.1, row: rowNumber - 0.9 },
            ext: { width: 150, height: 105 },
            editAs: "oneCell"
          });
        } catch {
          worksheet.getCell(rowNumber, 10).value = "图片加载失败";
        }
      }
    }

    for (let column = 1; column <= columnCount; column += 1) {
      const width = column === 10 ? 24 : column <= 11 ? 13 : Math.max(worksheet.getColumn(column).width ?? 8, 8);
      worksheet.getColumn(column).width = width;
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `検品検針報告書-${order.po_number || "report"}.xlsx`;
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
