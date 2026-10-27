import type { PoolClient, QueryResultRow } from "pg";

import { withUserContext } from "./userContext.ts";

const SCHEDULE_RPC_SQL = {
  rollover_schedule: "select public.rollover_schedule($1::jsonb) as result",
  apply_schedule_insert: "select public.apply_schedule_insert($1::jsonb) as result",
  apply_schedule_run: "select public.apply_schedule_run($1::jsonb) as result",
  apply_manual_adjust: "select public.apply_manual_adjust($1::jsonb) as result",
  record_schedule_progress: "select public.record_schedule_progress($1::jsonb) as result"
} as const;

export type ScheduleRpcName = keyof typeof SCHEDULE_RPC_SQL;

type ScheduleRpcResult<T> = QueryResultRow & { result: T };

/** 在已设置用户上下文的事务连接上调用排程函数（测试可复用并回滚）。 */
export async function callScheduleRpcWithClient<T>(
  client: PoolClient,
  fn: ScheduleRpcName,
  payload: Record<string, unknown>
): Promise<T> {
  const result = await client.query<ScheduleRpcResult<T>>(SCHEDULE_RPC_SQL[fn], [
    JSON.stringify(payload)
  ]);
  if (result.rows.length === 0) throw new Error(`${fn} 未返回结果`);
  return result.rows[0].result;
}

export async function callScheduleRpc<T>(input: {
  userId: string;
  email: string;
  fn: ScheduleRpcName;
  payload: Record<string, unknown>;
}): Promise<T> {
  return withUserContext(input.userId, input.email, (client) =>
    callScheduleRpcWithClient<T>(client, input.fn, input.payload)
  );
}
