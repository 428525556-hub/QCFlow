import assert from "node:assert/strict";
import { test } from "node:test";

import { buildDuplicateKeySet } from "../excelImportService.ts";

test("buildDuplicateKeySet 生成的键与导入行去重规则一致", () => {
  const keys = buildDuplicateKeySet([
    {
      customer_name: "文君",
      po_number: "WJ-1",
      sku: "GR-1",
      quantity: 410,
      shipping_date: "2026-08-20"
    }
  ]);

  assert.equal(keys.size, 1);
  assert.ok(keys.has(["文君", "WJ-1", "GR-1", 410, "2026-08-20"].join("|")));
});

test("shipping_date / quantity 为空时与 Excel 行使用同样的空值表示", () => {
  const keys = buildDuplicateKeySet([
    {
      customer_name: "客户A",
      po_number: "PO-1",
      sku: "SKU-1",
      quantity: null,
      shipping_date: null
    }
  ]);

  assert.ok(keys.has(["客户A", "PO-1", "SKU-1", "", ""].join("|")));
});
