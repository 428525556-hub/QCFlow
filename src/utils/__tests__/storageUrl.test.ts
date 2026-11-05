import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPrivateStorageUrl } from "../storageUrl.ts";

test("私有存储 URL 使用稳定代理地址并编码路径", () => {
  const value = buildPrivateStorageUrl("inspection-photos", "/user/order/图片 1.jpg");
  const url = new URL(value, "https://qcflow.example");

  assert.equal(url.pathname, "/api/storage/object");
  assert.equal(url.searchParams.get("bucket"), "inspection-photos");
  assert.equal(url.searchParams.get("path"), "user/order/图片 1.jpg");
});
