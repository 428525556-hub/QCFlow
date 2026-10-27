import type { PoolClient } from "pg";

import { withTransaction } from "./query.ts";

/**
 * 在事务内注入当前用户上下文。
 *
 * 注意：数据库里的 app.set_user() 使用 set_config(..., false)（会话级），
 * 在连接池复用时会串用户；这里改用事务级 set_config(..., true)，
 * 事务提交/回滚后自动清除。
 */
export async function withUserContext<T>(
  userId: string,
  email: string,
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(
      "select set_config('app.user_id', $1, true), set_config('app.user_email', $2, true)",
      [userId, email]
    );
    return run(client);
  });
}
