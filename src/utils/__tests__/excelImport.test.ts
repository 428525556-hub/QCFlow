import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildItemPayload,
  buildOrderPayload,
  buildRows,
  groupRowsIntoOrders,
  isRowImportable,
  mapHeaderField,
  mapHeaderFieldStrict,
  mapHeaders,
  mapInspectionPlan,
  normalizeDate,
  normalizeNumber,
  summarizeRows,
  validateRow,
  type CanonicalField,
  type ExcelImportRow,
  type RawImportRow
} from "../excelImport.ts";

function emptyRow(): ExcelImportRow {
  return {
    rowNumber: 2,
    sourceSheet: "Sheet1",
    customerName: "文君",
    factoryName: "顺欣",
    poNumber: "WJ-26061",
    sku: "GR-6571",
    color: "未定",
    size: "未定",
    quantityPerCarton: 10,
    cartonCount: 41,
    quantity: 410,
    inboundDate: "2026-07-14",
    shippingDate: "2026-08-30",
    shippingDateTbd: false,
    inspectionPlan: "both",
    remark: null,
    directShip: false,
    status: "ok",
    warnings: [],
    errors: [],
    duplicateInFile: false,
    maybeExisting: false,
    fields: {}
  };
}

function rawRow(rowNumber: number, values: Partial<Record<CanonicalField, unknown>>): RawImportRow {
  const cells = {} as Partial<Record<CanonicalField, { value: unknown; column: number; mergedFrom?: { row: number; column: number } }>>;
  let column = 1;
  for (const [field, value] of Object.entries(values) as Array<[CanonicalField, unknown]>) {
    cells[field] = { value, column: column++ };
  }
  return { rowNumber, sourceSheet: "Sheet1", cells };
}

const FULL_VALUES: Partial<Record<CanonicalField, unknown>> = {
  customerName: "文君",
  factoryName: "顺欣",
  poNumber: "WJ-26061",
  sku: "GR-6571",
  quantityPerCarton: 10,
  cartonCount: 41,
  quantity: 410,
  inboundDate: "2026/7/14",
  shippingDate: "2026/9/1",
  inspectionPlan: "检品+X线",
  remark: null,
  reservationType: null
};

test("表头同义字段识别", () => {
  assert.equal(mapHeaderField("客户"), "customerName");
  assert.equal(mapHeaderField("客先"), "customerName");
  assert.equal(mapHeaderField("Customer Name"), "customerName");
  assert.equal(mapHeaderField("工厂"), "factoryName");
  assert.equal(mapHeaderField("订单号"), "poNumber");
  assert.equal(mapHeaderField("PO No"), "poNumber");
  assert.equal(mapHeaderField("注文番号"), "poNumber");
  assert.equal(mapHeaderField("品番"), "sku");
  assert.equal(mapHeaderField("款号"), "sku");
  assert.equal(mapHeaderField("入数（双）"), "quantityPerCarton");
  assert.equal(mapHeaderField("订单箱数（件）"), "cartonCount");
  assert.equal(mapHeaderField("件数"), "cartonCount");
  assert.equal(mapHeaderField("ケース数"), "cartonCount");
  assert.equal(mapHeaderField("做柜日期"), "shippingDate");
  assert.equal(mapHeaderField("装柜日期"), "shippingDate");
  assert.equal(mapHeaderField("交期"), "shippingDate");
  assert.equal(mapHeaderField("出荷予定日"), "shippingDate");
  assert.equal(mapHeaderField("预约入库日"), "reservationType");
  assert.equal(mapHeaderField("入数\n（双）"), "quantityPerCarton");
  assert.equal(mapHeaderField("订单数量（双）"), "quantity");
  assert.equal(mapHeaderField("款柜日期"), "shippingDate");
  assert.equal(mapHeaderField("预约日期"), "inboundDate");
  assert.equal(mapHeaderField("检验内容"), "inspectionPlan");
  assert.equal(mapHeaderField("材型"), "model");
  assert.equal(mapHeaderField("鞋型"), "shoeType");
  assert.equal(mapHeaderField("备注"), "remark");
  assert.equal(mapHeaderField("完全无关的列"), null);
});

test("标题行不会被当作表头（精确匹配为 0）", () => {
  assert.equal(mapHeaderFieldStrict("26年9月吴江硕宇检品计划追踪表"), null);
  assert.equal(mapHeaderFieldStrict("客户"), "customerName");
  assert.equal(mapHeaderFieldStrict("订单箱数（件）"), "cartonCount");
});

test("表头中间有空列时按真实列号映射（不错位）", () => {
  const sparse: string[] = [];
  sparse[0] = "客户";
  sparse[1] = "工厂";
  sparse[4] = "订单号";
  sparse[5] = "品番";
  sparse[6] = "入数";
  sparse[7] = "订单箱数（件）";
  sparse[8] = "订单数量（双）";
  const map = mapHeaders(sparse);
  assert.equal(map[0], "customerName");
  assert.equal(map[1], "factoryName");
  assert.equal(map[4], "poNumber");
  assert.equal(map[5], "sku");
  assert.equal(map[6], "quantityPerCarton");
  assert.equal(map[7], "cartonCount");
  assert.equal(map[8], "quantity");
  assert.equal(Object.keys(map).length, 7);
});

test("数字标准化", () => {
  assert.equal(normalizeNumber("10双"), 10);
  assert.equal(normalizeNumber("10.0"), 10);
  assert.equal(normalizeNumber("10"), 10);
  assert.equal(normalizeNumber("41"), 41);
  assert.equal(normalizeNumber("410"), 410);
  assert.equal(normalizeNumber("1,000"), 1000);
  assert.equal(normalizeNumber(410), 410);
  assert.equal(normalizeNumber({ result: 410 }), 410);
  assert.equal(normalizeNumber(""), null);
  assert.equal(normalizeNumber("  "), null);
  assert.equal(normalizeNumber("abc"), null);
  assert.equal(normalizeNumber(null), null);
});

test("用户验收用例：10×箱数 = 数量（11 组全部一致）", () => {
  const cases = [
    [41, 410],
    [8, 80],
    [185, 1850],
    [108, 1080],
    [53, 530],
    [12, 120],
    [45, 450],
    [69, 690],
    [14, 140],
    [73, 730],
    [99, 990]
  ];
  for (const [boxCount, totalQuantity] of cases) {
    const [row] = buildRows([rawRow(2, { ...FULL_VALUES, cartonCount: boxCount, quantity: totalQuantity })]);
    assert.equal(row.quantityPerCarton, 10, `入数应为 10`);
    assert.equal(row.cartonCount, boxCount, `箱数应为 ${boxCount}`);
    assert.equal(row.quantity, totalQuantity, `总数量应为 ${totalQuantity}`);
    assert.equal(row.status, "ok", `10 × ${boxCount} = ${totalQuantity} 应正常`);
  }
});

test("用户表头「人数（双）」也能映射到每箱数量", () => {
  assert.equal(mapHeaderField("人数（双）"), "quantityPerCarton");
  assert.equal(mapHeaderFieldStrict("人数（双）"), "quantityPerCarton");
  assert.equal(mapHeaderField("人数(双)"), "quantityPerCarton");
});

test("日期标准化", () => {
  assert.equal(normalizeDate("2026/7/14"), "2026-07-14");
  assert.equal(normalizeDate("2026-07-14"), "2026-07-14");
  assert.equal(normalizeDate("2026.7.14"), "2026-07-14");
  assert.equal(normalizeDate(new Date(2026, 6, 14)), "2026-07-14");
  assert.equal(normalizeDate("26/9/10"), "2026-09-10");
  assert.equal(normalizeDate("26年9月10日"), "2026-09-10");
  assert.equal(normalizeDate("2026/9/1 00:00:00"), "2026-09-01");
  assert.equal(normalizeDate({ result: "2026/7/14" }), "2026-07-14");
  assert.equal(normalizeDate(46217), "2026-07-14");
  assert.equal(normalizeDate("不是日期"), null);
  assert.equal(normalizeDate(""), null);
});

test("检验内容映射", () => {
  assert.equal(mapInspectionPlan("检品+X线").plan, "both");
  assert.equal(mapInspectionPlan("检品和X光都要").plan, "both");
  assert.equal(mapInspectionPlan("只做检品").plan, "normal");
  assert.equal(mapInspectionPlan("X线").plan, "xray");
  assert.equal(mapInspectionPlan("出差检品").plan, "field");
  assert.equal(mapInspectionPlan("").plan, "both");
  assert.equal(mapInspectionPlan("未知内容").plan, "both");
  assert.ok(mapInspectionPlan("未知内容").note);
});

test("数量逻辑校验：10 × 41 = 410 正常；= 400 标记需确认，人工确认后允许导入", () => {
  const okRow = emptyRow();
  validateRow(okRow);
  assert.equal(okRow.status, "ok");
  assert.equal(isRowImportable(okRow, false), true);

  const badRow = emptyRow();
  badRow.quantity = 400;
  validateRow(badRow);
  assert.equal(badRow.status, "need_confirm");
  assert.ok(badRow.warnings.some((warning) => warning.includes("数量不一致")));
  assert.equal(isRowImportable(badRow, false), false);
  assert.equal(isRowImportable(badRow, true), true);
});

test("数量非法值：负数/小数标记异常", () => {
  const row = emptyRow();
  row.cartonCount = -1;
  validateRow(row);
  assert.ok(row.errors.includes("箱数必须为不小于 0 的整数"));

  row.cartonCount = 41;
  row.quantity = 1.5;
  validateRow(row);
  assert.ok(row.errors.includes("总数量必须为不小于 0 的整数"));

  const raw = emptyRow();
  raw.quantityPerCarton = 1.5;
  validateRow(raw);
  assert.ok(raw.errors.includes("每箱数量必须为正整数"));
});

test("缺失必填字段 → need_confirm（不猜测）", () => {
  const row = emptyRow();
  row.poNumber = "";
  row.sku = "";
  row.quantity = null;
  row.inboundDate = null;
  validateRow(row);
  assert.equal(row.status, "need_confirm");
  assert.ok(row.warnings.some((warning) => warning.includes("缺少订单号")));
  assert.ok(row.warnings.some((warning) => warning.includes("缺少品番")));
  assert.ok(row.warnings.some((warning) => warning.includes("缺少总数量")));
  assert.ok(row.warnings.some((warning) => warning.includes("缺少预约日期")));
});

test("真实场景：订单箱数 41 / 入数 10 / 订单数量 410 → 全部正确", () => {
  const [row] = buildRows([rawRow(2, FULL_VALUES)]);
  assert.equal(row.cartonCount, 41);
  assert.equal(row.quantityPerCarton, 10);
  assert.equal(row.quantity, 410);
  assert.equal(row.status, "ok");
  assert.equal(row.inboundDate, "2026-07-14");
  assert.equal(row.shippingDate, "2026-09-01");
});

test("真实场景：箱数 185 / 入数 10 / 数量 1850 → 箱数 185", () => {
  const [row] = buildRows([rawRow(2, { ...FULL_VALUES, poNumber: "WJ-26062", sku: "GR-6562", cartonCount: 185, quantity: 1850, shippingDate: new Date(2026, 8, 1) })]);
  assert.equal(row.cartonCount, 185);
  assert.equal(row.quantity, 1850);
  assert.equal(row.shippingDate, "2026-09-01");
  assert.equal(row.status, "ok");
});

test("款柜日期为「不出」：保留到备注，不产生无效日期", () => {
  const [row] = buildRows([rawRow(2, { ...FULL_VALUES, shippingDate: "不出" })]);
  assert.equal(row.shippingDate, null);
  assert.equal(row.status, "ok");
  assert.ok((row.remark ?? "").includes("款柜日期：不出"));
});

test("款柜日期为「待定/未定」：自动标记为出货日期待定", () => {
  const tbd = buildRows([rawRow(2, { ...FULL_VALUES, shippingDate: "待定" })])[0];
  assert.equal(tbd.shippingDate, null);
  assert.equal(tbd.shippingDateTbd, true);
  assert.equal(tbd.status, "ok");
  assert.ok((tbd.remark ?? "").includes("款柜日期：待定"));

  const undecided = buildRows([rawRow(3, { ...FULL_VALUES, shippingDate: "未定" })])[0];
  assert.equal(undecided.shippingDateTbd, true);
  assert.ok((undecided.remark ?? "").includes("款柜日期：未定"));

  const payload = buildOrderPayload(tbd);
  assert.equal(payload.shipping_date, null);
  assert.equal(payload.shipping_date_tbd, true);
});

test("预约日期与款柜日期不会互换", () => {
  const [row] = buildRows([rawRow(2, { ...FULL_VALUES, reservationType: "待定" })]);
  assert.equal(row.inboundDate, "2026-07-14");
  assert.equal(row.shippingDate, "2026-09-01");
  assert.equal(row.directShip, false);
});

test("日期无法识别 → need_confirm，并保留原始值", () => {
  const [row] = buildRows([rawRow(2, { ...FULL_VALUES, shippingDate: "not-a-date" })]);
  assert.equal(row.shippingDate, null);
  assert.equal(row.status, "need_confirm");
  assert.ok(row.warnings.some((warning) => warning.includes("出货/款柜日期无法识别")));
  assert.equal(row.fields.shippingDate?.raw, "not-a-date");
});

test("原始单元格追溯：sourceSheet / sourceRow / sourceColumn / raw / parsed", () => {
  const [row] = buildRows([rawRow(3, { ...FULL_VALUES, cartonCount: 41 })]);
  const trace = row.fields.cartonCount;
  assert.equal(trace?.sourceSheet, "Sheet1");
  assert.equal(trace?.sourceRow, 3);
  assert.equal(trace?.sourceColumn, 6);
  assert.equal(trace?.raw, 41);
  assert.equal(trace?.parsed, 41);
});

test("合并单元格展开：主单元格值自动填充到明细行，并记录来源", () => {
  const rows = buildRows([
    rawRow(3, { ...FULL_VALUES, sku: "GR-6571" }),
    {
      rowNumber: 4,
      sourceSheet: "Sheet1",
      cells: {
        customerName: { value: "文君", column: 1, mergedFrom: { row: 3, column: 1 } },
        factoryName: { value: "顺欣", column: 2, mergedFrom: { row: 3, column: 2 } },
        poNumber: { value: "WJ-26061", column: 5, mergedFrom: { row: 3, column: 5 } },
        sku: { value: "GR-5571", column: 6 },
        quantityPerCarton: { value: 10, column: 7 },
        cartonCount: { value: 41, column: 8 },
        quantity: { value: 410, column: 9 },
        inboundDate: { value: "2026/7/14", column: 10 },
        shippingDate: { value: "2026/9/1", column: 11 },
        inspectionPlan: { value: "检品+X线", column: 12 },
        remark: { value: null, column: 13 },
        reservationType: { value: null, column: 14 }
      }
    }
  ]);
  assert.equal(rows[1].poNumber, "WJ-26061");
  assert.equal(rows[1].sku, "GR-5571");
  assert.equal(rows[1].customerName, "文君");
  assert.equal(rows[1].factoryName, "顺欣");
  assert.equal(rows[1].fields.poNumber?.mergedFrom?.row, 3);
  assert.equal(rows[1].status, "ok");
});

test("同订单号多个品番 → 合并为一个订单多明细（不生成两个订单）", () => {
  const rows = buildRows([
    rawRow(3, { ...FULL_VALUES, sku: "GR-6571" }),
    rawRow(4, { ...FULL_VALUES, sku: "GR-5571", quantityPerCarton: 10, cartonCount: 30, quantity: 300 })
  ]);
  const groups = groupRowsIntoOrders(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[0].order.quantity, 710);
  assert.equal(groups[0].order.po_number, "WJ-26061");
  assert.deepEqual(groups[0].rowNumbers, [3, 4]);
});

test("buildRows：文件内重复行标记 → need_confirm", () => {
  const rows = buildRows([rawRow(2, FULL_VALUES), rawRow(3, FULL_VALUES)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, "ok");
  assert.equal(rows[1].duplicateInFile, true);
  assert.equal(rows[1].status, "need_confirm");
  assert.ok(rows[1].warnings.some((warning) => warning.includes("重复")));
});

test("汇总统计：总数 / 正常 / 需确认 / 异常 / 总箱数 / 总双数", () => {
  const rows = buildRows([
    rawRow(2, FULL_VALUES),
    rawRow(3, { ...FULL_VALUES, sku: "GR-5571", quantity: 400 }),
    rawRow(4, { ...FULL_VALUES, sku: "GR-6562", poNumber: "WJ-26062", inboundDate: null })
  ]);
  const summary = summarizeRows(rows);
  assert.equal(summary.total, 3);
  assert.equal(summary.ok, 1);
  assert.equal(summary.error, 0);
  assert.equal(summary.needConfirm, 2);
  assert.equal(summary.totalCartons, 41 + 41 + 41);
  assert.equal(summary.totalQuantity, 410 + 400 + 410);
});

test("缺必填字段/日期无法识别/重复 即使确认也不允许导入", () => {
  const missing = emptyRow();
  missing.poNumber = "";
  validateRow(missing);
  assert.equal(isRowImportable(missing, true), false);

  const dup = emptyRow();
  dup.duplicateInFile = true;
  dup.warnings.push("与第 2 行重复");
  dup.status = "need_confirm";
  assert.equal(isRowImportable(dup, true), false);

  const dateIssue = emptyRow();
  dateIssue.warnings.push("出货/款柜日期无法识别（原始值：abc），需人工确认");
  dateIssue.status = "need_confirm";
  assert.equal(isRowImportable(dateIssue, true), false);
});

test("材型/鞋型不丢：进入备注并保留追溯", () => {
  const [row] = buildRows([rawRow(2, { ...FULL_VALUES, model: "单鞋", shoeType: "单鞋" })]);
  assert.ok((row.remark ?? "").includes("材型：单鞋"));
  assert.ok((row.remark ?? "").includes("鞋型：单鞋"));
  assert.equal(row.fields.model?.parsed, "单鞋");
  assert.equal(row.fields.shoeType?.parsed, "单鞋");
});

test("payload 构建与现有数据结构一致", () => {
  const row = emptyRow();
  const order = buildOrderPayload(row);
  assert.equal(order.order_type, "reservation");
  assert.equal(order.customer_name, "文君");
  assert.equal(order.quantity, 410);
  assert.equal(order.inspection_plan, "both");
  assert.equal(order.shipping_date, "2026-08-30");
  assert.equal(order.inbound_quantity, 0);
  assert.equal(order.status, "未开始");

  const item = buildItemPayload(row);
  assert.equal(item.carton_count, 41);
  assert.equal(item.quantity_per_carton, 10);
  assert.equal(item.quantity, 410);
  assert.equal(item.inbound_quantity, 0);
});
