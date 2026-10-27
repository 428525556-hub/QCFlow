import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

import type { Database, Json } from "@/src/types";
import {
  buildRows,
  groupRowsIntoOrders,
  isRowImportable,
  mapHeaderField,
  mapHeaderFieldStrict,
  mapHeaders,
  summarizeRows,
  validateRow,
  type CanonicalField,
  type ExcelImportRow,
  type RawImportCell,
  type RawImportRow
} from "../utils/excelImport.ts";

export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export type ImportPreviewResult = {
  rows: ExcelImportRow[];
  headers: string[];
  summary: ReturnType<typeof summarizeRows>;
  debug: {
    headerRowIndex: number;
    rawHeaders: string[];
    mapped: Array<{ column: number; header: string; field: CanonicalField }>;
    samples: Array<{ row: number; fields: Record<string, { type: string; preview: string }> }>;
  };
};

function unwrapCellValue(value: unknown): unknown {
  if (value && typeof value === "object" && "result" in value) {
    return (value as { result: unknown }).result ?? null;
  }
  return value;
}

/**
 * 读取单元格原始值；若单元格属于合并区域且本身为空，
 * 使用合并区域左上角主单元格的值，并记录来源位置（mergedFrom）。
 */
function readCell(worksheet: ExcelJS.Worksheet, rowNumber: number, column: number): RawImportCell {
  const cell = worksheet.getCell(rowNumber, column);
  const master = cell.isMerged ? cell.master : undefined;
  if (master) {
    return {
      value: unwrapCellValue(master.value),
      column,
      mergedFrom: { row: Number(master.row), column: Number(master.col) }
    };
  }
  return { value: unwrapCellValue(cell.value), column };
}

export async function parseImportFile(buffer: Buffer, fileName: string): Promise<ImportPreviewResult> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext !== "xlsx" && ext !== "csv") {
    throw new Error("仅支持 .xlsx / .csv 文件；.xls 请先在 Excel 中另存为 .xlsx 后再上传");
  }

  const workbook = new ExcelJS.Workbook();
  if (ext === "csv") {
    const csvReader = (workbook.csv as unknown as { read: (input: unknown) => Promise<void> }).read.bind(workbook.csv);
    await csvReader(buffer.toString("utf8").replace(/^\uFEFF/, ""));
  } else {
    const loader = (workbook.xlsx as unknown as { load: (input: unknown) => Promise<void> }).load.bind(workbook.xlsx);
    await loader(buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("Excel 中没有可读取的工作表");
  const sheetName = worksheet.name;
  const rowCount = worksheet.rowCount;
  if (rowCount <= 1) throw new Error("Excel 内容为空或缺少数据行");
  if (rowCount - 1 > MAX_IMPORT_ROWS) throw new Error(`单次最多导入 ${MAX_IMPORT_ROWS} 行，当前 ${rowCount - 1} 行`);

  // 兼容 Excel 1904 日期系统（老版 Mac Excel），日期序列号起点不同
  const date1904 = workbook.properties.date1904 === true;

  // 自动定位真正的表头行：Excel 第 1 行可能是标题行（如"26年9月…追踪表"）
  const scanLimit = Math.min(rowCount, 8);
  let headerRowIndex = 1;
  let bestScore = { strong: -1, weak: 0 };
  for (let r = 1; r <= scanLimit; r += 1) {
    const row = worksheet.getRow(r);
    let strong = 0;
    let weak = 0;
    let cells = 0;
    row.eachCell({ includeEmpty: false }, (cell) => {
      cells += 1;
      if (mapHeaderFieldStrict(cell.value)) strong += 1;
      else if (mapHeaderField(cell.value)) weak += 1;
    });
    if (cells === 0) continue;
    const better = strong > bestScore.strong || (strong === bestScore.strong && strong + weak > bestScore.strong + bestScore.weak);
    if (better) {
      bestScore = { strong, weak };
      headerRowIndex = r;
    }
  }

  if (bestScore.strong + bestScore.weak < 2) {
    throw new Error("无法识别 Excel 表头，请使用「下载Excel模板」的标准表头，或确认字段名位于前几行");
  }

  // 稀疏数组：下标 = Excel 列号 - 1，空表头单元格保留空洞，避免错位
  const headers: string[] = [];
  const debugSamples: ImportPreviewResult["debug"]["samples"] = [];
  const headerRow = worksheet.getRow(headerRowIndex);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "");
  });
  const fieldByIndex = mapHeaders(headers);

  if (Object.keys(fieldByIndex).length < 2) {
    throw new Error("表头可识别字段不足，请使用「下载Excel模板」的标准表头");
  }

  const rawRows: RawImportRow[] = [];
  for (let r = headerRowIndex + 1; r <= rowCount; r += 1) {
    const cells = {} as Record<CanonicalField, RawImportCell>;
    let hasContent = false;
    const sampleFields: Record<string, { type: string; preview: string }> = {};

    for (const [index, field] of Object.entries(fieldByIndex)) {
      const column = Number(index) + 1;
      const rawCell = readCell(worksheet, r, column);
      let value = rawCell.value;
      if (date1904 && typeof value === "number" && (field === "inboundDate" || field === "shippingDate")) {
        value = new Date(Date.UTC(1904, 0, 1) + value * 86400000);
        rawCell.value = value;
      }
      if (value != null && String(value).trim() !== "") hasContent = true;
      if (debugSamples.length < 3) {
        let type: string = typeof value;
        if (value instanceof Date) type = "Date";
        else if (value && typeof value === "object") type = `Obj(${String((value as { formula?: string }).formula ?? "").slice(0, 20) || "object"})`;
        sampleFields[field] = { type, preview: String(value ?? "").slice(0, 30) };
      }
      cells[field] = rawCell;
    }

    if (hasContent) {
      rawRows.push({ rowNumber: r, sourceSheet: sheetName, cells });
      if (debugSamples.length < 3) debugSamples.push({ row: r, fields: sampleFields });
    }
  }

  const rows = buildRows(rawRows);
  return {
    rows,
    headers,
    summary: summarizeRows(rows),
    debug: {
      headerRowIndex,
      rawHeaders: headers.slice(0, 24),
      mapped: Object.entries(fieldByIndex).map(([index, field]) => ({ column: Number(index) + 1, header: headers[Number(index)] ?? "", field })),
      samples: debugSamples
    }
  };
}

function rowDupKey(row: ExcelImportRow): string {
  return [row.customerName.trim(), row.poNumber.trim(), row.sku.trim(), row.quantity ?? "", row.shippingDate ?? ""].join("|");
}

export type ExistingOrderKeySource = {
  customer_name: string;
  po_number: string;
  sku: string;
  quantity: number | null;
  shipping_date: string | null;
};

/** 把已有订单转换成去重键集合（Supabase 与国内 PG 共用） */
export function buildDuplicateKeySet(orders: ExistingOrderKeySource[]): Set<string> {
  const keys = new Set<string>();
  for (const order of orders) {
    keys.add([order.customer_name, order.po_number, order.sku, String(order.quantity ?? ""), order.shipping_date ?? ""].join("|"));
  }
  return keys;
}

export async function findExistingDuplicateKeys(supabase: SupabaseClient<Database>, rows: ExcelImportRow[]): Promise<Set<string>> {
  const poNumbers = Array.from(new Set(rows.map((row) => row.poNumber.trim()).filter(Boolean)));
  if (poNumbers.length === 0) return new Set();

  const { data } = await supabase
    .from("orders")
    .select("customer_name, po_number, sku, quantity, shipping_date")
    .in("po_number", poNumbers)
    .is("deleted_at", null)
    .neq("status", "已完成");

  return buildDuplicateKeySet(data ?? []);
}

export type ImportRowResult = {
  rowNumber: number;
  success: boolean;
  message: string;
  orderId: string | null;
};

export type ImportGroupPayload = { order: unknown; items: unknown[] };
export type ImportCreateOrder = (payload: ImportGroupPayload) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

/**
 * 服务端导入：重新校验每一行（基于原始追溯值），只导入状态为 ok 的行；
 * 同一订单号 + 多个品番合并为一个订单（多条明细），通过现有事务函数写入。
 */
export async function importRows(
  rows: ExcelImportRow[],
  existingKeys: Set<string>,
  createOrder: ImportCreateOrder
): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = [];
  const importable: ExcelImportRow[] = [];

  for (const row of rows) {
    validateRow(row);
    if (!row.fields || Object.keys(row.fields).length === 0) {
      results.push({ rowNumber: row.rowNumber, success: false, message: "缺少原始单元格追溯信息，请重新上传并预览后再导入", orderId: null });
      continue;
    }
    if (!isRowImportable(row, true)) {
      results.push({ rowNumber: row.rowNumber, success: false, message: row.status === "error" ? row.errors.join("；") : `需人工确认：${row.warnings.join("；") || "数据不完整"}`, orderId: null });
      continue;
    }
    if (existingKeys.has(rowDupKey(row))) {
      results.push({ rowNumber: row.rowNumber, success: false, message: "与已有预约重复，已跳过（防止重复导入）", orderId: null });
      continue;
    }
    importable.push(row);
  }

  const groups = groupRowsIntoOrders(importable);
  for (const group of groups) {
    const { data, error } = await createOrder({ order: group.order, items: group.items as unknown[] });
    const orderId = String(data ?? "");
    for (const rowNumber of group.rowNumbers) {
      const confirmedRow = importable.find((row) => row.rowNumber === rowNumber);
      const mismatchNote = confirmedRow?.status === "need_confirm" ? `（已确认导入，${confirmedRow.warnings.join("；")}）` : "";
      if (error) {
        results.push({ rowNumber, success: false, message: `${error.message}${mismatchNote}`, orderId: null });
      } else {
        results.push({ rowNumber, success: true, message: `ok${mismatchNote}`, orderId });
      }
    }
  }

  return results;
}

export function buildImportTemplateWorkbook(): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("预约入库导入模板");
  const headers = ["预约日期", "预约入库", "客户", "工厂", "订单号", "品番", "入数（双）", "订单箱数（件）", "订单数量（双）", "检验内容", "材型", "款柜日期", "鞋型", "送货情况", "备注"];
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.addRow(["2026/8/20", "预约入库", "文君", "顺欣", "WJ-26061", "GR-6571", 10, 41, 410, "检品+X线", "单鞋", "2026/8/30", "单鞋", "", "示例行，可删除"]);
  sheet.columns = headers.map((header) => ({ header, width: Math.max(12, header.length * 2 + 4) }));
  return workbook;
}
