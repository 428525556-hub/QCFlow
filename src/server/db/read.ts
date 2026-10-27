import type { PoolClient, QueryResultRow } from "pg";

import { TABLE_COLUMNS, type TableName } from "./columns.ts";
import { queryRows } from "./query.ts";

/** 把 pg 返回的 Date 统一转成 ISO 字符串，保持与 Supabase 返回结构一致 */
export function normalizeRow<T>(row: QueryResultRow): T {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return normalized as T;
}

export type SelectOptions = {
  /** 只允许由本仓库内部拼装的固定 SQL 片段，禁止传入用户输入 */
  conditions?: string[];
  values?: unknown[];
  orderBy?: string;
  limit?: number;
  client?: PoolClient;
};

/** 通用只读查询：表名与列名来自白名单，条件/排序由调用方用固定字面量提供 */
export async function selectAll<T>(table: TableName, options: SelectOptions = {}): Promise<T[]> {
  const { conditions = [], values = [], orderBy, limit, client } = options;
  const where = conditions.length > 0 ? ` where ${conditions.join(" and ")}` : "";
  const order = orderBy ? ` order by ${orderBy}` : "";
  const limitSql = limit && limit > 0 ? ` limit ${Math.trunc(limit)}` : "";

  const sql = `select ${TABLE_COLUMNS[table]} from public.${table}${where}${order}${limitSql}`;
  const rows = client
    ? (await client.query<QueryResultRow>(sql, values)).rows
    : await queryRows<QueryResultRow>(sql, values);
  return rows.map((row) => normalizeRow<T>(row));
}
