import assert from "node:assert/strict";
import { test } from "node:test";

import ExcelJS from "exceljs";

import { parseImportFile } from "../excelImportService.ts";

test("ExcelJS 解析：合并单元格自动展开 + 原始列号追溯 + 特殊日期", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("预约入库");
  sheet.addRow(["预约日期", "客户", "工厂", "订单号", "品番", "入数（双）", "订单箱数（件）", "订单数量（双）", "检验内容", "款柜日期"]);
  sheet.addRow(["2026/7/14", "文君", "顺欣", "WJ-26061", "GR-6571", 10, 41, 410, "检品+X线", "不出"]);
  sheet.addRow([null, null, null, null, "GR-5571", 10, 41, 410, "检品+X线", "不出"]);
  sheet.mergeCells("A2:A3");
  sheet.mergeCells("B2:B3");
  sheet.mergeCells("C2:C3");
  sheet.mergeCells("D2:D3");

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await parseImportFile(buffer, "merged.xlsx");

  assert.equal(preview.rows.length, 2);
  const first = preview.rows[0];
  const second = preview.rows[1];

  // 第 2 行：直接读取
  assert.equal(first.poNumber, "WJ-26061");
  assert.equal(first.sku, "GR-6571");
  assert.equal(first.customerName, "文君");
  assert.equal(first.factoryName, "顺欣");
  assert.equal(first.inboundDate, "2026-07-14");
  assert.equal(first.status, "ok");
  assert.equal(first.fields.cartonCount?.sourceColumn, 7);

  // 第 3 行：合并单元格展开（订单号/客户/工厂/预约日期来自上方主单元格）
  assert.equal(second.poNumber, "WJ-26061");
  assert.equal(second.sku, "GR-5571");
  assert.equal(second.customerName, "文君");
  assert.equal(second.factoryName, "顺欣");
  assert.equal(second.inboundDate, "2026-07-14");
  assert.equal(second.status, "ok");
  assert.equal(second.fields.poNumber?.mergedFrom?.row, 2);
  assert.equal(second.fields.poNumber?.sourceRow, 3);
  assert.equal(second.fields.poNumber?.sourceColumn, 4);

  // 「不出」进入备注，不产生日期
  assert.equal(first.shippingDate, null);
  assert.ok((first.remark ?? "").includes("款柜日期：不出"));
  assert.equal(preview.summary.total, 2);
  assert.equal(preview.summary.ok, 2);
  assert.equal(preview.summary.error, 0);
  assert.equal(preview.summary.totalCartons, 82);
  assert.equal(preview.summary.totalQuantity, 820);
});

test("ExcelJS 解析：数量不一致标记需确认（人工确认后允许导入）", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("预约入库");
  sheet.addRow(["预约日期", "客户", "工厂", "订单号", "品番", "入数（双）", "订单箱数（件）", "订单数量（双）"]);
  sheet.addRow(["2026/7/14", "文君", "顺欣", "WJ-26061", "GR-6571", 10, 41, 450]);

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const preview = await parseImportFile(buffer, "bad.xlsx");
  assert.equal(preview.rows.length, 1);
  assert.equal(preview.rows[0].status, "need_confirm");
  assert.ok(preview.rows[0].warnings.some((warning) => warning.includes("数量不一致")));
  assert.equal(preview.summary.needConfirm, 1);
});
