import { Pool, types } from "pg";

import { logger } from "../logger.ts";

// DATE 原样返回 'YYYY-MM-DD'，避免本地时区把日期偏移一天
types.setTypeParser(1082, (value) => value);
// NUMERIC 转成 number，保持与 Supabase 返回的数值类型一致
types.setTypeParser(1700, (value) => Number(value));

let pool: Pool | null = null;

/**
 * 服务端 Postgres 连接池（单例）。
 * 连接串只能来自服务端环境变量 DATABASE_URL，不要使用 NEXT_PUBLIC_ 前缀。
 */
export function getPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("缺少 DATABASE_URL（仅服务端使用，不要加 NEXT_PUBLIC_ 前缀）");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
    pool.on("error", (error) => {
      logger.error("db_idle_client_error", { message: error.message });
    });
  }

  return pool;
}

/** 测试或进程退出时释放连接池 */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
