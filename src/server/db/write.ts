import type { PoolClient, QueryResultRow } from "pg";

import { ApiError } from "../errors.ts";
import { TABLE_COLUMNS, type TableName } from "./columns.ts";
import { queryRows } from "./query.ts";
import { normalizeRow } from "./read.ts";

function assertAllowedColumns(table: TableName, columns: string[]) {
  const allowed = new Set(TABLE_COLUMNS[table].split(",").map((column) => column.trim()));
  for (const column of columns) {
    if (!allowed.has(column)) {
      throw new ApiError(`不允许的字段: ${column}`, 400, "VALIDATION_ERROR");
    }
  }
}

/** 批量插入（列名必须属于该表白名单，值全部参数化） */
export async function insertRows<T>(
  table: TableName,
  rows: Record<string, unknown>[],
  returning: string = TABLE_COLUMNS[table],
  client?: PoolClient
): Promise<T[]> {
  if (rows.length === 0) return [];

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) throw new ApiError("插入数据为空", 400, "VALIDATION_ERROR");
  assertAllowedColumns(table, columns);

  for (const row of rows) {
    const keys = Object.keys(row);
    if (keys.length !== columns.length || columns.some((column) => !(column in row))) {
      throw new ApiError("插入行的字段必须一致", 400, "VALIDATION_ERROR");
    }
  }

  const values: unknown[] = [];
  const tuples = rows.map(
    (row) => `(${columns.map((column) => {
      values.push(row[column]);
      return `$${values.length}`;
    }).join(", ")})`
  );
  const columnList = columns.map((column) => `"${column}"`).join(", ");

  const sql = `insert into public.${table} (${columnList}) values ${tuples.join(", ")} returning ${returning}`;
  const result = client
    ? (await client.query<QueryResultRow>(sql, values)).rows
    : await queryRows<QueryResultRow>(sql, values);
  return result.map((row) => normalizeRow<T>(row));
}

/** 按 id 批量删除，返回实际删除的 id */
export async function deleteRowsByIds(table: TableName, ids: string[], client?: PoolClient): Promise<string[]> {
  if (ids.length === 0) return [];
  const sql = `delete from public.${table} where id = any($1::uuid[]) returning id`;
  const rows = client
    ? (await client.query<QueryResultRow>(sql, [ids])).rows
    : await queryRows<QueryResultRow>(sql, [ids]);
  return rows.map((row) => String(row.id));
}

/** 按 id 更新单行；列名走白名单，id/created_at 不允许更新 */
export async function updateRowById<T>(
  table: TableName,
  id: string,
  patch: Record<string, unknown>,
  returning: string = TABLE_COLUMNS[table],
  client?: PoolClient
): Promise<T | null> {
  const columns = Object.keys(patch).filter((column) => patch[column] !== undefined);
  if (columns.length === 0) throw new ApiError("没有可更新的字段", 400, "VALIDATION_ERROR");
  assertAllowedColumns(table, columns);

  for (const forbidden of ["id", "created_at"]) {
    if (columns.includes(forbidden)) throw new ApiError(`字段不可更新: ${forbidden}`, 400, "VALIDATION_ERROR");
  }

  const values: unknown[] = [];
  const assignments = columns.map((column) => {
    values.push(patch[column]);
    return `"${column}" = $${values.length}`;
  });
  values.push(id);

  const sql = `update public.${table} set ${assignments.join(", ")} where id = $${values.length} returning ${returning}`;
  const rows = client
    ? (await client.query<QueryResultRow>(sql, values)).rows
    : await queryRows<QueryResultRow>(sql, values);
  return rows.length > 0 ? normalizeRow<T>(rows[0]) : null;
}
