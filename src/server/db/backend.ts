export type DataBackend = "supabase" | "pg";

/**
 * 迁移期数据源开关：
 * - 默认 supabase（现网行为不变）
 * - DATA_BACKEND=pg 时，**已完成迁移的接口**改走国内 PostgreSQL
 *
 * 注意：这是逐个接口迁移用的开关。在全部接口迁移完成前，不要在公网生产环境
 * 长期开启，否则会出现"部分接口读 PG、部分接口读 Supabase"的混合状态。
 */
export function getDataBackend(): DataBackend {
  return process.env.DATA_BACKEND === "pg" ? "pg" : "supabase";
}
