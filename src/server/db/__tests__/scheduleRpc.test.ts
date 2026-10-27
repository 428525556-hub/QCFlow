import assert from "node:assert/strict";
import { test } from "node:test";
import type { PoolClient } from "pg";

import { callScheduleRpcWithClient, type ScheduleRpcName } from "../scheduleRpc.ts";

test("排程 RPC 使用固定白名单 SQL，并把 payload 序列化为 JSON", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const client = {
    query: async (text: string, values?: unknown[]) => {
      calls.push({ text, values });
      return { rows: [{ result: { ok: true } }], rowCount: 1 };
    }
  } as unknown as PoolClient;

  const functions: ScheduleRpcName[] = [
    "rollover_schedule",
    "apply_schedule_insert",
    "apply_schedule_run",
    "apply_manual_adjust",
    "record_schedule_progress"
  ];

  for (const fn of functions) {
    assert.deepEqual(await callScheduleRpcWithClient(client, fn, { task_id: "task-1" }), { ok: true });
  }

  assert.deepEqual(
    calls.map((call) => call.text),
    functions.map((fn) => `select public.${fn}($1::jsonb) as result`)
  );
  for (const call of calls) {
    assert.deepEqual(call.values, [JSON.stringify({ task_id: "task-1" })]);
  }
});
