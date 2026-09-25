import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { parseImportFile } from "../excelImportService.ts";

const REAL_FILES = [
  "C:\\Users\\pc\\Desktop\\文君-顺欣-订单明细_20240617.xlsx",
  "C:\\Users\\pc\\Desktop\\26年9月吴江硕宇检品计划追踪表.xlsx"
];

test("真实 Excel：文君-顺欣 订单明细（验收 16 项检查点）", async (t) => {
  const file = REAL_FILES[0];
  if (!existsSync(file)) {
    t.skip("真实文件不存在，跳过（桌面缺少 文君-顺欣-订单明细_20240617.xlsx）");
    return;
  }
  const buffer = await readFile(file);
  const preview = await parseImportFile(buffer, "文君-顺欣-订单明细_20240617.xlsx");
  const rows = preview.rows;

  console.log(`[真实文件] 总行数=${rows.length} 正常=${preview.summary.ok} 需确认=${preview.summary.needConfirm} 异常=${preview.summary.error} 总箱数=${preview.summary.totalCartons} 总双数=${preview.summary.totalQuantity}`);

  // 1-2. WJ-26061 / WJ-26062 两行订单号识别
  const wj61 = rows.filter((row) => row.poNumber === "WJ-26061");
  const wj62 = rows.filter((row) => row.poNumber === "WJ-26062");
  assert.ok(wj61.length >= 2, `WJ-26061 应至少 2 行，实际 ${wj61.length}`);
  assert.ok(wj62.length >= 2, `WJ-26062 应至少 2 行，实际 ${wj62.length}`);

  // 3-4. 客户/工厂
  for (const row of [...wj61, ...wj62]) {
    assert.equal(row.customerName, "文君");
    assert.equal(row.factoryName, "顺欣");
  }

  // 5. 品番集合
  const sku61 = new Set(wj61.map((row) => row.sku));
  const sku62 = new Set(wj62.map((row) => row.sku));
  assert.ok(sku61.has("GR-6571") && sku61.has("GR-5571"), `WJ-26061 品番 ${[...sku61].join(",")}`);
  assert.ok(sku62.has("GR-6562") && sku62.has("GR-5562"), `WJ-26062 品番 ${[...sku62].join(",")}`);

  // 6-9. 入数 10 / 箱数一致 / 10×箱数=数量
  for (const row of [...wj61, ...wj62]) {
    assert.equal(row.quantityPerCarton, 10, `第${row.rowNumber}行入数应为 10`);
    if (row.quantity != null && row.cartonCount != null) {
      assert.equal(row.quantity, row.quantityPerCarton * row.cartonCount, `第${row.rowNumber}行 10×箱数≠数量`);
    }
  }

  // 10. 预约日期（WJ-26061 首行）
  const first61 = wj61[0];
  assert.match(first61.inboundDate ?? "", /^\d{4}-\d{2}-\d{2}$/, `第${first61.rowNumber}行预约日期应为标准日期`);

  // 12. 「不出」不能误解析成日期
  for (const row of wj61) {
    if ((row.remark ?? "").includes("款柜日期：不出")) {
      assert.equal(row.shippingDate, null);
    }
  }

  // 13-15. 检验内容 / 鞋型 / 备注
  for (const row of [...wj61, ...wj62]) {
    assert.equal(row.inspectionPlan, "both", `第${row.rowNumber}行检验内容应为检品+X线`);
    assert.ok((row.remark ?? "").includes("鞋型"), `第${row.rowNumber}行备注应保留鞋型`);
  }
});

test("真实 Excel：26年9月吴江硕宇检品计划追踪表（表头第 2 行 + 批量识别）", async (t) => {
  const file = REAL_FILES[1];
  if (!existsSync(file)) {
    t.skip("真实文件不存在，跳过（桌面缺少 26年9月吴江硕宇检品计划追踪表.xlsx）");
    return;
  }
  const buffer = await readFile(file);
  const preview = await parseImportFile(buffer, "26年9月吴江硕宇检品计划追踪表.xlsx");
  const rows = preview.rows;

  console.log(`[真实文件] 表头行=${preview.debug.headerRowIndex} 总行数=${rows.length} 正常=${preview.summary.ok} 需确认=${preview.summary.needConfirm} 异常=${preview.summary.error} 总箱数=${preview.summary.totalCartons} 总双数=${preview.summary.totalQuantity}`);

  assert.equal(preview.debug.headerRowIndex, 2, "吴江文件表头应自动定位在第 2 行");
  assert.ok(rows.length > 50, `应识别大量明细行，实际 ${rows.length}`);
  assert.ok(preview.summary.ok > 0, "应存在正常行");

  const bad = rows.filter((row) => row.status === "error");
  for (const row of bad) {
    console.log(`[异常行] 第${row.rowNumber}行：${row.errors.join("；")}`);
  }
});
